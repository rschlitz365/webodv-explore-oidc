"use strict"

/****************************************************************************
**
** Copyright (C) 2018-2024 Reiner Schlitzer. All rights reserved.
**
** This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
** WARRANTY OF DESIGN, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
**
****************************************************************************/

let textArea=$("TextArea");

window.addEventListener('load',onPageLoad);


/**************************************************************************/
function $(elemId)
/**************************************************************************/
{
    return document.getElementById(elemId);
}

/**************************************************************************/
function currentDateTimeAsFileNamePart()
/**************************************************************************/
{ return new Date().toISOString().substring(0,19).replaceAll(':','-'); }

/**************************************************************************/
function onBtnDownload()
/**************************************************************************/
{
    let fn=window.location.hostname+'_activity-log_'
        +currentDateTimeAsFileNamePart()+'.log';
    let link=document.createElement("a");
    link.setAttribute('download',fn);
    link.href=downloadFilePath;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/**************************************************************************/
function onBtnNotification()
/**************************************************************************/
{
    let msg="<h2 class='is-red'>Admin Notification</h2> <p>"+textArea.value+'</p>';
    msg+=' <p>Please use <b><i>View > Close Session</i></b> to close your session now.</p>';
    sendWsMsgToAll('{"cmd":"notification_request","msg":"'+msg+'"}');
}

/**************************************************************************/
function onBtnGetStatus()
/**************************************************************************/
{
    sendWsMsgToAll('{"cmd":"status_info_request"}');
}

/**************************************************************************/
function onBtnShutdown()
/**************************************************************************/
{
    sendWsMsgToAll('{"cmd":"shutdown_request"}');
}

/**************************************************************************/
function onPageLoad()
/**************************************************************************/
{
    if (usedPorts.length==0)
    {
	    setElemEnabled('btnGetStatus',false);
	    setElemEnabled('btnNotification',false);
	    setElemEnabled('btnShutdown',false);
    }
}

/**************************************************************************/
function recipientPorts()
/**************************************************************************/
{
    let port=$("Port").value,ports=[]; 
    if (port.length==0) ports=usedPorts;
    else                ports.push(port);
    return ports;
}

/*!
  \brief Sends message \a cmdMsg to all recipient ports.
*/
/**************************************************************************/
function sendWsMsgToAll(cmdMsg)
/**************************************************************************/
{
    let portsArr=recipientPorts(); if (portsArr.length==0) return;
    
    textArea.value='';
    let msg='{"sender_id":"'+sessionId+'","cmds":['+cmdMsg+']}';
    portsArr.map(p => { sendWsMsg(p,msg); })
}

/*!
  \brief Sends message \a msg to port \a port.
*/
/**************************************************************************/
function sendWsMsg(port,msg)
/**************************************************************************/
{
    let wsUri=wsUriFromPort(port);
    let wsClient=new WebSocket(wsUri);

    wsClient.onopen=onWsOpen;
    wsClient.onmessage=onWsMessage;
    wsClient.onerror=onWsError;
    
    function onWsOpen()
    { wsClient.send(msg); }
    
    function onWsMessage(msg)
    { showMessage(msg.data); wsClient.close(); }
    
    function onWsError(msg)
    { showMessage(msg.data); wsClient.close(); }
}

/**************************************************************************/
function setElemEnabled(elId,enable)
/**************************************************************************/
{
    let el=$(elId); if (!el) return;
    el.disabled=enable ? false : true;
}

/**************************************************************************/
function showMessage(message)
/**************************************************************************/
{
    textArea.value+=message+"\n\n";
    textArea.scrollTop=textArea.scrollHeight;
}

/**************************************************************************/
function wsUriFromPort(port)
/**************************************************************************/
{
    if (wsUriBase.length==0)
	    return 'ws://localhost:'+port;
    else
	    return wsUriBase+(port-8200);
}

