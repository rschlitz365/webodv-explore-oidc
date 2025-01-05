/****************************************************************************
**
** Copyright (C) 2020-2025 Reiner Schlitzer (Reiner.Schlitzer@awi.de).
** All rights reserved.
**
** This file is part of webODV Explore.
**
** This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
** WARRANTY OF DESIGN, MERCHANTABILIsTY AND FITNESS FOR A PARTICULAR PURPOSE.
**
****************************************************************************/

const os=require('os');
const fs=require('fs');
const createError=require('http-errors');
const WebSocket=require('ws');
const { spawn }=require('child_process');

/* session count and cpu load limits for single odvws instance */
const userCountLim=10,cpuLoadLim=0.5;

/* variables for odvws */
let odvwsRunCmd,adminPassw,dataRootPath,odvwsSettingsFile,exploreRootUrl;

/* variables used for ports management */
let hostAdress=4,firstPort,lastPort,portsAvail=[],portsUsed=[];

/* variables used for Explore datasets */
let datasetArr,oceanTree,atmosTree,riversTree,iceTree,sedimTree;

/**************************************************************************/
function addDataset(settings,rPath,collName,collExt,isLink,ret)
/**************************************************************************/
{
	let ds={ description: settings.description, access: settings.access,
			view: settings.view, auto_shutdown: settings.auto_shutdown,
			disable_exports: settings.disable_exports };
	let lPath=rPath+collName.toLowerCase()+'/';
	if (settings.netcdf_setup!=undefined)
		ds.netcdf_setup=settings.netcdf_setup;
	ds.path='/'+lPath;
	ds.collectionRoot=rPath;
	ds.collectionName=collName;
	ds.collectionExt=collExt;
	ds.collectionPath=rPath+collName+collExt;
	ds.accessFilePath=rPath+collName+'.Data/.access';
	ret.datasetArr.push(ds);
	ret.treeStr+="<li class='tree-item-node' title='"+ds.description+"' value='"+lPath+"'>"+collName+"</li> ";
	if (!isLink)
		ret.htmlStr+=' <li><a href="'+exploreRootUrl+lPath+'" target="_blank">'+collName+'</a>&emsp;-&emsp;'+ds.description+'</li>';
	if (settings.is_default_dataset)
	{ let dsd={...ds}; dsd.path='/'+rPath; ret.datasetArr.push(dsd); }
}

/**************************************************************************/
function cdUp(dir)
/**************************************************************************/
{
	let i=dir.lastIndexOf('/',dir.length-2);
	return (i>-1) ? dir.slice(0,i+1) : '';
}

/**************************************************************************/
function classifyAllRunningPorts()
/**************************************************************************/
{
	/* iterate over all datasets and mark running ports as used */
	datasetArr.map(d => { classifyRunningPorts(d); })
}

/**************************************************************************/
function classifyRunningPorts(dataset)
/**************************************************************************/
{
	let i,j,port,es=recentAccessFileEntries(dataRootPath+dataset.accessFilePath,70);
	for (i=0; i<es.length; ++i)
	{
		port=es[i].port; j=portsAvail.indexOf(port);
		if (j>-1)
		{
			portsAvail.splice(j,1);
			portsUsed.push({ port: port, dataset: dataset, startTimeStamp: Date.now() });
		}
	}
}

/**************************************************************************/
function defaultDatasetName(dir,refDir,dirEntryArr)
/**************************************************************************/
{
	let jo=extractJson(dir+'dir.info');
	if (jo.default_dataset!=undefined) return jo.default_dataset;

	let ds='',dsCount=0;
	dirEntryArr.map(e => {
	    if (e.isFile() && dir.startsWith(refDir) &&
			(e.name.endsWith('.odv') || e.name.endsWith('.nc')))
    	{ ds=e.name; ++dsCount; }
	})

	return (dsCount==1) ? ds : '';
}

/**************************************************************************/
function extractCollDescription(odvFilePath)
/**************************************************************************/
{
	let sl=fs.readFileSync(odvFilePath,'utf8').split('\n');
	let l=sl.find(e => e.startsWith('Description'));
	let description=(l!=undefined) ? l.substring(l.indexOf(' = ')+3) : '';
	return description.replace('\r','');
}

/*!
  Returns the description of directory <i>dir</i> extracted from a .odv or
  dir.info file in <i>dir</i> or the directory pointed to by a link.info file.
*/
/**************************************************************************/
function extractDirDescription(dir,refDir)
/**************************************************************************/
{
	let descr='',en;
	let dirEntryArr=fs.readdirSync(dir,{ encoding: 'utf8', withFileTypes: true });

  	dirEntryArr.map(e => {
		en=e.name;
		if (e.isFile() && dir.startsWith(refDir) && en.endsWith('.odv'))
    	{
			/* item is .odv file: extract and return the collection description */
			descr=extractCollDescription(dir+en);
	    }
    	else if (e.isFile() && dir.startsWith(refDir) && en==='link.info')
    	{
			/* item is link.info file: extract and return the base collection description */
			let lnk=JSON.parse(fs.readFileSync(dir+en));
			descr=extractDirDescription(refDir+lnk.location,refDir);
		}
  	});

	if (descr==undefined || descr.length==0)
	{
		let jo=extractJsonRecursive(dir,refDir,'dir.info');
		if (jo.description!=undefined) descr=jo.description;
	}


	return descr;
}

/**************************************************************************/
function extractJson(filePath)
/**************************************************************************/
{
	return fs.existsSync(filePath) ?
		JSON.parse(fs.readFileSync(filePath)) : {};
}

/*!
  Recursively searches for file <i>fileName</i> in directory <i>dir</i> and
  upward up to <i>refDir</i>, and, on first match, returns the file contents
  as JSON object. An empty object is returned if no such file is found.
  NOTE: <i>dir</i> must start with <i>refDir</i>.
*/
/**************************************************************************/
function extractJsonRecursive(dir,refDir,fileName)
/**************************************************************************/
{
	let filePath=dir+fileName;
	if (fs.existsSync(filePath))
		return JSON.parse(fs.readFileSync(filePath));
	else
		{
			dir=cdUp(dir);
			if (dir.startsWith(refDir))
				return extractJsonRecursive(dir,refDir,fileName);
		}
	return {};
}

/**************************************************************************/
function extractSettings(settingsFilePath)
/**************************************************************************/
{
	let cs={ description: '', access: 'ReadOnly', view: '$FullScreenMap$',
		is_default_dataset: false, auto_shutdown: true, disable_exports: false };

	let s=extractJson(settingsFilePath);
	if (s.description!=undefined) cs.description=s.description;
	if (s.access!=undefined) cs.access=s.access;
	if (s.view!=undefined) cs.view=s.view;
	if (s.netcdf_setup!=undefined) cs.netcdf_setup=s.netcdf_setup;
	if (s.auto_shutdown!=undefined) cs.auto_shutdown=s.auto_shutdown;
	if (s.disable_exports!=undefined) cs.disable_exports=s.disable_exports;
	//console.log(`settings fn: ${settingsFilePath}  cs: ${cs.disable_exports}`);

	return cs;
}

/**************************************************************************/
function getStatus()
/**************************************************************************/
{
	verifyUsedPorts();
	const isLocalHost=!(os.hostname=='webodv' || os.hostname=='fu-00149');
	let i,port,ds={},es=[],str='',usedPorts=[];
	let userCount,cpuLoad,totUserCount=0,totCpuLoad=0.,openDatasetCount=0;
	for (i=(portsUsed.length-1); i>=0; --i)
	{
		port=portsUsed[i].port; ds=portsUsed[i].dataset;
		es=recentAccessFileEntries(dataRootPath+ds.accessFilePath,70);
		userCount=(es.length>0) ? parseInt(es[0].userCount) : 0;
		cpuLoad=(es.length>0) ? (parseFloat(es[0].cpuLoad)*100) : 0.;
		totUserCount+=userCount; totCpuLoad+=cpuLoad; usedPorts.push(port);
		openDatasetCount+=1;
		str=str
		+'<li><span class="tree-group-node tree-group-node-open">'+ds.collectionName
		+'</span> <ul class="tree-nested-list tree-nested-list-open">'
		+'<li class="tree-item-node"><i>description:</i> '+ds.description+'</li>'
		+'<li class="tree-item-node"><i>path:</i> '+ds.path+'</li>'
		+'<li class="tree-item-node"><i>port:</i> '+port+'</li>'
		+'<li class="tree-item-node"><i>access:</i> '+ds.access+'</li>'
		+'<li class="tree-item-node"><i>auto_shutdown:</i> '+ds.auto_shutdown+'</li>'
		+'<li class="tree-item-node"><i>disable_exports:</i> '+ds.disable_exports+'</li>'
		+'<li class="tree-item-node"><i>user_count:</i> '+userCount+'</li>'
		+'<li class="tree-item-node"><i>cpu_load [%]:</i> '+cpuLoad.toFixed(3)+'</li>'
		+'</ul> </li>';
	}

	if (str.length>0)
		str='<ul class="TreeView">'+str+'</ul>';
	else
		str='<p>No open dataset.</p>';

	str='<p>Open dataset count: '+openDatasetCount+' | Total user count: '
		+totUserCount+' | Total CPU load in last minute [%]: '
		+totCpuLoad.toFixed(3)+' | Available port Ids: '+portsAvail.length+'</p> '+str;

	return { str, usedPorts, isLocalHost };
}

/**************************************************************************/
function getUsageInfo(dsArr)
/**************************************************************************/
{
	let i,dsCount=dsArr.length,usageLines=[],usedDataSets=[];
	for (i=0; i<dsCount; ++i)
	{
		let ds=dsArr[i],cn=ds.collectionName;
		let actFn=dataRootPath+ds.collectionRoot+cn+'.Data/web/activity.log';
		if (!fs.existsSync(actFn) || usedDataSets.includes(cn)) continue;

		let lines=fs.readFileSync(actFn,'utf8').split('\n');
		lines.map(l => { if (l.length>0) usageLines.push(ds.collectionName+'\t'+ds.collectionRoot+'\t'+l); });
		usedDataSets.push(cn);
	}

	//let usageFilePath=dataRootPath+'activity.log';
	let usageFilePath='logs/activity.log';
	fs.writeFileSync('./public/'+usageFilePath,usageLines.join('\n'));

	return usageFilePath;
}

/**************************************************************************/
function nextAvailablePort(dataset)
/**************************************************************************/
{
	verifyUsedPorts();
	let port=portsAvail.pop();
	if (port!=undefined)
	{
		//console.log('nextAvailablePort(): port '+port+' now used');
		portsUsed.push({ port: port, dataset: dataset, startTimeStamp: Date.now() });
	}
	return port;
}

/*!
  Returns the array of entries retrieved from .access file <i>accessFilePath</i>.
  Entries older than <i>ageLimitSeconds</i> or with port equal to zero are ignored.
*/
/**************************************************************************/
function recentAccessFileEntries(accessFilePath,ageLimitSeconds=-1)
/**************************************************************************/
{
	const ageLimMs=ageLimitSeconds*1000,now=Date.now(); let entries=[];
	if (!fs.existsSync(accessFilePath)) return entries;

	let lines=fs.readFileSync(accessFilePath,'utf8').split('\n');
	let i,n=lines.length,e,p,t,eTime,port;
	for (i=0; i<n; ++i)
	{
		p=lines[i].replace('\r','').split(' = ');
		if (p.length==2)
		{
			t=p[1].split('\t'); eTime=Date.parse(t[0]); port=parseInt(t[3]);
			if ((ageLimMs<0 || (now-eTime)<ageLimMs) && port>0)
			{
				e={ instance: parseInt(p[0]), time: eTime, user: t[1], access: t[2],
					port: port, userCount: parseInt(t[4]), cpuLoad: parseFloat(t[5])};
				entries.push(e);
			}
		}
	}
	return entries;
}

/**************************************************************************/
function requestSessionId(req,res,reqPath,dataset,usrName,port,serverVersion,callbFct)
/**************************************************************************/
{
	const wsUri=wsUriForPort(req,port);
	let wsUriLocal='ws://localhost:'+port;

    let wsClient=new WebSocket(wsUriLocal);

    wsClient.on('error',onWsError);
    wsClient.on('message',onWsMessage);
    wsClient.on('open',onWsOpen);

    function onWsError(errMsg)
    {
		// failed to create WebSocket connection to wsUri
		//console.log('onWsError(): '+errMsg);
		console.log(`**requestSessionId: error ${wsUri} ${wsUriLocal} ${req.path}`);

		wsClient.close();
		setTimeout(requestSessionId,250,req,res,reqPath,dataset,usrName,port,serverVersion,callbFct);
    }

    function onWsMessage(jsonMsg)
    {
		const msg=JSON.parse(jsonMsg);
		//console.log('onWsMessage().session_id: '+msg.session_id);
		if (msg.reply_id=='session_request')
		{
			console.log(`**requestSessionId: success ${wsUri} ${wsUriLocal} ${req.path}`);
			wsClient.close();
		    callbFct(req,res,msg.user,msg.session_id,msg.collection_name,dataset.description,
				wsUri,staticPathPrefix(reqPath),dataset.view,exploreRootUrl,serverVersion);
		}
    }

    function onWsOpen()
    {
		wsClient.send(`{"sender_id":"${adminPassw}","cmds":[{"cmd":"session_request","user" :"${usrName}"}]}`);
    }
}

/*!
  Generates in <i>datasetArr</i> and <i>treeStr</i> members of <i>ret</i> json and
  html code representing a hierarchical tree of ODV collections and netCDF files
  in <i>dir</i> and any subdir.
*/
/**************************************************************************/
function scanForDatasets(dir,isLink,refDir,ret)
/**************************************************************************/
{
  let rPath=dir.substring(refDir.length),en,lnk,cn,cs,dirInfo,dsArr=[];
  let dirEntryArr=fs.readdirSync(dir,{ encoding: 'utf8', withFileTypes: true });

  let sortOrderArr=extractJson(dir+'dir.info').sort_order;
  if (sortOrderArr!=undefined && sortOrderArr.length>0)
  {
	sortOrderArr.reverse(); let i,j,n,dirent
	for (j=0; j<sortOrderArr.length; ++j)
	{
	  n=sortOrderArr[j];
	  i=dirEntryArr.findIndex(e => e.name==n);
	  if (i>-1)
		{ dirent=dirEntryArr[i]; dirEntryArr.splice(i,1); dirEntryArr.unshift(dirent); }
	};
  }

  let dfltDsName=defaultDatasetName(dir,refDir,dirEntryArr);

  /* loop over all directory entries */
  dirEntryArr.map(e => {
	en=e.name;
    if (e.isDirectory() && !en.endsWith('.Data'))
    {
		/* item is non-.Data directory: do recursive call */
		let descr=extractDirDescription(dir+en+'/',refDir);
    	ret.treeStr+="<li title='"+descr+"'><span id='"+en+"' class='tree-group-node'>"+en+"</span> <ul class='tree-nested-list'> ";
    	ret=scanForDatasets(dir+en+'/',isLink,refDir,ret);
		ret.treeStr+="</ul> </li> ";
    }
    else if (e.isFile() && dir.startsWith(refDir) && en==='link.info')
    {
		/* item is link.info file: scan the link's location directory */
		lnk=JSON.parse(fs.readFileSync(dir+en));
    	ret=scanForDatasets(refDir+lnk.location,true,refDir,ret);
    }
    else if (e.isFile() && dir.startsWith(refDir) && en.endsWith('.odv'))
    {
		/* item is .odv file: remember the dataset entry */
		if (en==dfltDsName) dsArr.unshift(e);
		else                dsArr.push(e);
    }
    else if (e.isFile() && dir.startsWith(refDir) && en.endsWith('.nc'))
    {
		/* item is .nc file: remember the dataset entry */
		if (en==dfltDsName) dsArr.unshift(e);
		else                dsArr.push(e);
    }
  });

  dsArr.map(e => {
	en=e.name;
    if (e.isFile() && dir.startsWith(refDir) && en.endsWith('.odv'))
    {
		/* item is .odv file: create a dataset entry */
		cn=en.substring(0,en.length-4);
		cs=extractSettings(dir+cn+'.settings');
		cs.description=extractCollDescription(dir+en);
		cs.is_default_dataset=(en==dfltDsName)
		addDataset(cs,rPath,cn,'.odv',isLink,ret);
    }
    else if (e.isFile() && dir.startsWith(refDir) && en.endsWith('.nc'))
    {
		/* item is .nc file: create a dataset entry */
		cn=en.substring(0,en.length-3);
		cs=extractSettings(dir+cn+'.settings');
		if (dirInfo==undefined) dirInfo=extractJsonRecursive(dir,refDir,'dir.info');
		if (cs.description=='' && dirInfo!=undefined && dirInfo.description!=undefined)
			cs.description=dirInfo.description;
		if (cs.netcdf_setup==undefined && dirInfo!=undefined && dirInfo.netcdf_setup!=undefined)
			cs.netcdf_setup=dirInfo.netcdf_setup;
		addDataset(cs,rPath,cn,'.nc',isLink,ret);
    }
  });

  return ret;
}

/**************************************************************************/
function sessionRequest(req,res,next,usrName,serverVersion,callbFct)
/**************************************************************************/
{
	/* construct the request path and find the requested dataset */
	let reqPath=req.path; if (!reqPath.endsWith('/')) reqPath=reqPath+'/';
	let dataset=datasetArr.find(d => d.path==reqPath);
	//console.log(`dataset.path: ${dataset.path}; usrName: ${usrName}`);
	if (dataset==undefined) { next(); return; }

	/* check whether an odvws instance is already running with this dataset */
	let port=usablePortFromAccessFile(dataset.accessFilePath);
	//console.log('usablePortFromAccessFile(): '+reqPath+' '+port);

	if (port>-1)
	{
		/* yes, odvws is running: request a sessionId and render the odv-online page */
		requestSessionId(req,res,reqPath,dataset,usrName,port,serverVersion,callbFct);
	}
	else
	{
		/* no, odvws is not running: request the next available port number.
		   throw error if we are out of port numbers */
		port=nextAvailablePort(dataset);
		//console.log('nextAvailablePort(): '+reqPath+' '+port);
		if (port==undefined)
		{
			next(createError(500,'The Explore service is overloaded. Try again later.'));
			return;
		}

		/* spawn new odvws instance */
        spawnOdvws(req,res,reqPath,dataset,port,usrName,serverVersion,callbFct);
	}
}

/**************************************************************************/
function setup(config)
/**************************************************************************/
{
	adminPassw=process.env.EXPLORE_ADMIN_PASSWORD;
	odvwsRunCmd=process.env.ODVWS_RUN_CMD;
	odvwsSettingsFile=process.env.ODVWS_SETTINGS_FILE;
	dataRootPath=process.env.EXPLORE_DATA_ROOT_PATH;
	exploreRootUrl=process.env.EXPLORE_ROOT_URL;
	firstPort=config.firstPort; lastPort=config.lastPort;
	if (config.hostAdress!=undefined) hostAdress=config.hostAdress;

	/* scan the dataset trees */
	let dir=dataRootPath,ret={ datasetArr:[],treeStr:'',htmlStr:'' },subDir;

	ret.htmlStr+='<!DOCTYPE html> <html> <head> <title>Explore Dataset Summary</title> <style> body { margin:10px 40px 0px 40px; color:#eaeaea; background-color:rgb(86,116,146); font-family:sans-serif; font-size:16px; line-height:1.35;} a,a:link,a:visited,a:active {color: #eaeaea;} a:hover {color:rgb(135,179,237);} </style> <link rel="shortcut icon" type="image/gif" href="../img/odv-icon.gif"> </head> <body>';
	ret.htmlStr+=' <h1>webODV Explore Dataset Summary</h1>';

	subDir=dir+'ocean/';
	if (fs.existsSync(subDir))
	{
		ret.htmlStr+=' <h2>Ocean</h2> <ul>';
		ret=scanForDatasets(subDir,false,dataRootPath,ret);
		oceanTree=ret.treeStr; ret.treeStr='';
		ret.htmlStr+=' </ul>';
	}

	subDir=dir+'atmosphere/';
	if (fs.existsSync(subDir))
	{
		ret.htmlStr+=' <h2>Atmosphere</h2> <ul>';
		ret=scanForDatasets(subDir,false,dataRootPath,ret);
		atmosTree=ret.treeStr; ret.treeStr='';
		ret.htmlStr+=' </ul>';
	}

	subDir=dir+'rivers/';
	if (fs.existsSync(subDir))
	{
		ret.htmlStr+=' <h2>Rivers</h2> <ul>';
		ret=scanForDatasets(subDir,false,dataRootPath,ret);
		riversTree=ret.treeStr; ret.treeStr='';
		ret.htmlStr+=' </ul>';
	}

	subDir=dir+'ice/';
	if (fs.existsSync(subDir))
	{
		ret.htmlStr+=' <h2>Ice</h2> <ul>';
		ret=scanForDatasets(subDir,false,dataRootPath,ret);
		iceTree=ret.treeStr; ret.treeStr='';
		ret.htmlStr+=' </ul>';
	}

	subDir=dir+'sediment/';
	if (fs.existsSync(subDir))
	{
		ret.htmlStr+=' <h2>Sediment</h2> <ul>';
		ret=scanForDatasets(subDir,false,dataRootPath,ret);
		sedimTree=ret.treeStr; delete ret.treeStr;
		ret.htmlStr+=' </ul>';
	}

	datasetArr=ret.datasetArr;

	/* write dataset summary html file */
	ret.htmlStr+=' </body> </html>';
	fs.writeFileSync('./server/public/html/dataset-summary.html',ret.htmlStr);

	/* initialize the available and used ports arrays */
	for (let i=lastPort; i>=firstPort; --i) portsAvail.push(i);

	/* iterate over all datasets and mark running ports as used */
	classifyAllRunningPorts();

	return { datasetArr, oceanTree, atmosTree, riversTree, iceTree, sedimTree };
}

/**************************************************************************/
function spawnOdvws(req,res,reqPath,dataset,port,usrName,serverVersion,callbFct)
/**************************************************************************/
{
	let collFilePath=dataRootPath+dataset.collectionPath;
	let viewSpec=(collFilePath.endsWith('.nc')) ? dataset.view : '$FullScreenMap$';
	let options=[ collFilePath, '-view', viewSpec, '-access', dataset.access,
		'-admin_password', adminPassw, '-port', port,
		'-settings_filepath', odvwsSettingsFile ];
	if (dataset.auto_shutdown) options.push('-auto_shutdown');
	if (dataset.disable_exports) options.push('-disable_exports');
	if (dataset.netcdf_setup)
	{ options.push('-netcdf_setup'); options.push(dataset.netcdf_setup); }
	//if (hostAdress!=4)
	//{ options.push('-host_address'); options.push(hostAdress); }

	console.log(`\n**spawnOdvws: ${odvwsRunCmd} ${options.join(' ')}`);
	let odvws=spawn(odvwsRunCmd,options,{ detached: true,stdio: [ 'ignore', 'pipe', 'ignore' ] } );
	odvws.stdout.on('data',(data) => { onOdvwsStdout(data); });

    function onOdvwsStdout(data)
    {
		let msg=data.toString(); msg=msg.replace('\r',''); msg=msg.replace('\n','');
		if (msg.startsWith('collection ready'))
		{
			console.log(`**onOdvwsStdout: ${msg} ${reqPath} ${port}`);
		    odvws.unref(); odvws.stdout.destroy();
			requestSessionId(req,res,reqPath,dataset,usrName,port,serverVersion,callbFct);
		}
    }

}

/**************************************************************************/
function staticPathPrefix(path)
/**************************************************************************/
{
	let i,n=path.match(/\//g).length,s='';
	for (i=1; i<n; ++i) s+='../';
	return s;
}

/*!
  Reads .access file <i>accessFilePath</i> and searches for the first odvws
  instance entry with user count and cpu load below capacity threshholds.

  Returns the port number of the first acceptable odvws instance, or -1 if
  no such instance is found.
*/
/**************************************************************************/
function usablePortFromAccessFile(accessFilePath)
/**************************************************************************/
{
	let es=recentAccessFileEntries(dataRootPath+accessFilePath,70);
	let port=-1,i,n=es.length;
	//console.log('usablePortFromAccessFile(): '+accessFilePath+'  entryCount: '+n);
	for (i=0; i<n; ++i)
	{
		//console.log((i+1)+'  userCount: '+es[i].userCount+'  cpuLoad: '+es[i].cpuLoad+'  port: '+es[i].port);
		if (es[i].userCount<userCountLim && es[i].cpuLoad<cpuLoadLim)
		{ port=es[i].port; break; }
	}
	return port;
}

/**************************************************************************/
function verifyUsedPorts()
/**************************************************************************/
{
	/* iterate over all datasets and mark running ports as used */
	classifyAllRunningPorts();

	const ageLimSecs=70,ageLimMilliSecs=ageLimSecs*1000;
	const nowTimeStamp=Date.now();
	let i,es,port,usageCount;

	/* loop over all used ports and ensure that the corresponding odvws
	   is still alive. if dead, delete the respective portsUsed item and
	   return the port to the available port number pool */
	for (i=(portsUsed.length-1); i>=0; --i)
	{
		/* only check used ports older than ageLimMilliSecs msec (time allowed for an
		   odvws instance to reach "collection ready" state */
		if ((nowTimeStamp-portsUsed[i].startTimeStamp)<ageLimMilliSecs) continue;

		usageCount=0; port=portsUsed[i].port;
		es=recentAccessFileEntries(dataRootPath+portsUsed[i].dataset.accessFilePath,ageLimSecs);
		es.map(e => { if (e.port==port) ++usageCount; });
		/* make port available again, if no longer used */
		if (usageCount==0)
		{
			//console.log('verifyUsedPorts(): port '+port+' back as available');
			portsUsed.splice(i,1); portsAvail.push(port);
		}
	}
}

/**************************************************************************/
function wsUriForPort(req,port)
/**************************************************************************/
{
	if (os.hostname=='fu-00149')
		return `wss://explore.webodv.awi.de/odv-online_${port-8200}/`;
	else
	{
		let wsBase=process.env.EXPLORE_WSURI_BASE,wsUri;
		if (wsBase.length>0)
			wsUri=wsBase+(port-8200);
		else {
			let ip=req.connection.localAddress;
		        //console.log(`**wsUriForPort: ${ip}`)
			if (ip.substring(0,7)=='::ffff:') ip=ip.substring(7);
			if (ip=='::1') ip='127.0.0.1';
		        //console.log(`**wsUriForPort: ${ip}`)
			wsUri='ws://'+ip+':'+port;
		    //wsUri=`ws://${ip}/odv-online_${port-8200}/`;
		}
		//console.log(`wsUri: ${wsUri}`)
		return wsUri;
	}
}

module.exports.getStatus=getStatus;
module.exports.getUsageInfo=getUsageInfo;
module.exports.sessionRequest=sessionRequest;
module.exports.setup=setup;
