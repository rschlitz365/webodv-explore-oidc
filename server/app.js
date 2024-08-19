/****************************************************************************
**
** Copyright (C) 2020-2024 Reiner Schlitzer (Reiner.Schlitzer@awi.de).
** All rights reserved.
**
** This file is part of webODV Explore.
**
** This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
** WARRANTY OF DESIGN, MERCHANTABILIsTY AND FITNESS FOR A PARTICULAR PURPOSE.
**
****************************************************************************/
const serverVersion='webODV Explore v6 OIDC';
//const gcubeSuffix='?gcube-token=20f7a853-7b15-4afc-b7ce-7c48ae018828-843339462';
let gcubeSuffix='';

require('dotenv').config();

const fs=require('fs');
const path=require('path');
const createError=require('http-errors');
const express=require('express');
const mgr=require('./manager');

// OIDC start
const session=require('express-session');
const csrf=require('csurf');
const logger=require('morgan');
const passport=require('passport');
const SQLiteStore=require('connect-sqlite3')(session);
const OpenIDConnectStrategy=require('passport-openidconnect');
passport.use(new OpenIDConnectStrategy(
{
  issuer: process.env.OIDC_ISSUER,
  authorizationURL: process.env.OIDC_AUTHORIZATION_ENDPOINT,
  tokenURL: process.env.OIDC_TOKEN_ENDPOINT,
  userInfoURL: process.env.OIDC_USERINFO_ENDPOINT,
  clientID: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  callbackURL: process.env.OIDC_REDIRECT_URI,
},
(issuer,profile,done) => {
  //let prof=profile;
  return done(null,profile);
}
));
passport.serializeUser(function(user,cb)
{
  process.nextTick(function()
  { cb(null, { id: user.id, username: user.username, name: user.displayName, email: user.emails[0].value }); });
});
passport.deserializeUser(function(user,cb)
{ process.nextTick(function() { return cb(null,user); }); });
const ensureLogIn=require('connect-ensure-login').ensureLoggedIn;
const ensureLoggedIn=ensureLogIn();
// OIDC end

/* load the server settings */
let cf=JSON.parse(fs.readFileSync('./settings/server-settings.json'));
//cf.adminPassw=process.env.EXPLORE_ADMIN_PASSWORD;
//cf.env=process.env;

/* build the dataset trees */
let datasets=mgr.setup(cf);

/* create and configure the express server */
const app=express();
app.set('views',path.join(__dirname,'views'));
app.set('view engine','ejs');

/* MIDDLEWARE START... */

// oidc start
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session(
  {
    secret: 'hgfz5topcs5$,nbjf', resave: false, saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.db', dir: 'server/var/db' })
  }));
app.use(csrf());
app.use(passport.authenticate('session'));
app.use(function(req,res,next)
{
  let msgs=req.session.messages || [];
  res.locals.messages=msgs;
  res.locals.hasMessages=!! msgs.length;
  req.session.messages=[];
  next();
});
app.use(function(req,res,next)
  { res.locals.csrfToken=req.csrfToken(); next(); });
// oidc end

/* ...handle static pages */
app.use(express.static(path.join(__dirname,'public')));

//console.log(' '); console.log(`req.path: ${req.path}`);

/* ...handle Explore root page */
app.get('/',ensureLoggedIn,(req,res) =>
{
  res.render('explore',{ oceanTree: datasets.oceanTree,
    atmosTree: datasets.atmosTree, riversTree: datasets.riversTree,
    iceTree: datasets.iceTree, sedimTree: datasets.sedimTree,
    parentLink: cf.parentLink, exploreRootUrl: process.env.EXPLORE_ROOT_URL,
    gcubeSuffix: gcubeSuffix });
});

/* ...handle login process */
app.get('/login', passport.authenticate('openidconnect'));

/* ...finalize login process */
app.get('/callback',passport.authenticate('openidconnect',
	// { successReturnToOrRedirect: `/${gcubeSuffix}`,
	{ successReturnToOrRedirect: '/',
	  failureRedirect: '/login' }));

/* ...handle signin page */
app.get('/signin',(req,res,next) => { res.render('signin'); });

/* ...handle status page */
app.get('/status',ensureLoggedIn,(req,res,next) =>
{
  if (req.user.username=='reiner.schlitzer')
  {
    let status=mgr.getStatus();
    let usageFilePath=mgr.getUsageInfo(datasets.datasetArr);
    res.render('status',{ statusStr: status.str, usedPorts: status.usedPorts.toString(),
      isLocalHost: status.isLocalHost, downloadFilePath: usageFilePath,
      sessionId: process.env.EXPLORE_ADMIN_PASSWORD,
      wsUriBase: process.env.EXPLORE_WSURI_BASE});
  }
   else
    next(createError(403));
});

/* ...handle explore data session requests */
app.get(['/atmosphere/*', '/ice/*', '/ocean/*', '/rivers/*', '/sediment/*'],
  ensureLoggedIn,
  (req,res,next) =>
    {
      mgr.sessionRequest(req,res,next,userNameFromRequest(req),
        serverVersion,renderOdvOnlinePage);
    });

/* ...catch 404 and forward to error handler */
app.use((req,res,next) => { next(createError(404)); });

/* ...error handler */
app.use((err,req,res,next) =>
{
  //const dt=new Date(); console.log(dt.toISOString()+'  '+err.message);

  /* set locals, only providing error in development */
  res.locals.message=err.message;
  res.locals.error=req.app.get('env') === 'development' ? err : {};

  /* render the error page */
  res.status(err.status || 500);
  res.render('error');
});
/* ...MIDDLEWARE END */

app.listen(3000,() =>
  { console.log(serverVersion+' listening on port 3000...'); });


/**************************************************************************/
function renderOdvOnlinePage(req,res,userName,sessionIdent,collName,collDescr,
  wsUrl,staticPathPrefix,view,exploreRootUrl,serverVersion)
/**************************************************************************/
{
   res.render('odv-online',{ collectionName: collName,
    collectionDescription: collDescr,
    sessionId: sessionIdent, userId: userName, initialView: view,
    staticFilePathPrefix: staticPathPrefix, wsUri: wsUrl,
    rootUrl: exploreRootUrl, serverVersion: serverVersion });
}


/**************************************************************************/
function retrieveGcubeToken(req,res,next)
/**************************************************************************/
{
  let gct=(req.hasOwnProperty('query') &&
           req.query.hasOwnProperty('gcube-token')) ?
    req.query.gcube-token : undefined;
  gcubeSuffix= gct ? `?gcube-token=${gct}` : '';
  next();
}

/**************************************************************************/
function userNameFromRequest(req)
/**************************************************************************/
{
  let xfwd=req.headers['x-forwarded-for'];
  let ip=(xfwd!=undefined) ? xfwd : req.ip;
  if (ip.substr(0,7)=='::ffff:') ip=ip.substr(7);
  if (ip=='::1') ip='127.0.0.1';
  return `IP_${ip}`;
}
