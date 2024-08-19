"use strict"

/****************************************************************************
**
** Copyright (C) 2018-2023 Reiner Schlitzer. All rights reserved.
**
** This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
** WARRANTY OF DESIGN, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
**
****************************************************************************/

window.addEventListener('load',onPageLoad);

/**************************************************************************/
function $(elId)
/**************************************************************************/
{ return document.getElementById(elId); }

/**************************************************************************/
function clearSettings()
/**************************************************************************/
{
    let keys=Object.keys(localStorage),i,n=keys.length;
    for (i=0; i<n; ++i)
    { if (isWebodvKey(keys[i])) localStorage.removeItem(keys[i]) }
}

/**************************************************************************/
function currentDateTimeAsFileNamePart()
/**************************************************************************/
{ return new Date().toISOString().substring(0,19).replaceAll(':','-'); }

/**************************************************************************/
function isWebodvKey(key)
/**************************************************************************/
{
    return (key.includes("lastView") || key.includes("/views/") ||
            key.includes("lastOpen") || key.includes("LastAgree"));
}

/**************************************************************************/
function onLoadFileRestore(e)
/**************************************************************************/
{
    if ($('deleteCb').checked) clearSettings();

    let lines=e.target.result.split('\n'),i,m,n=lines.length,it;
    for (i=0; i<n; ++i)
    {
        it=lines[i].split('\t'); m=it.length;
        if (m==2) localStorage.setItem(it[0],it[1]);
    }
}

/**************************************************************************/
function onPageLoad()
/**************************************************************************/
{
	$('fileSelectorR').addEventListener('change',onSelectFileRestore);
}

/**************************************************************************/
function onSelectFileRestore(e)
/**************************************************************************/
{
    if (e.target.files.length==0) return;
        
    let reader=new FileReader();
    reader.addEventListener('load',onLoadFileRestore);
    reader.readAsText(e.target.files[0]);
}

/**************************************************************************/
function onBtnSave()
/**************************************************************************/
{
    let keys=Object.keys(localStorage); keys.sort();
    let i,j,n=keys.length,key,strArr=[];

    for (i=0; i<n; ++i)
    {
        key=keys[i];
        if (isWebodvKey(key))
        { strArr.push(key+'\t'+localStorage.getItem(key)+'\n'); }
        //else
        //    j=1;
    }

    let fn=window.location.hostname+'_private-settings_'+
        currentDateTimeAsFileNamePart()+'.txt'
    saveBlobAs(new Blob(strArr,{type: 'text/plain'}),fn);
}

/**
   Saves the contents of blob <i>blob</i> to client file <i>fileName</i>.
*/
/**************************************************************************/
function saveBlobAs(blob,fileName)
/**************************************************************************/
{
    if (window.navigator && window.navigator.msSaveOrOpenBlob)
    {
	    /* special for Microsoft Edge */
	    window.navigator.msSaveOrOpenBlob(blob,fileName);
    }
    else
    {
	    let a=document.createElement("a");
	    document.body.appendChild(a); a.style="display: none";
	    let url=window.URL.createObjectURL(blob);
	    a.href=url; a.download=fileName; a.click();
	    window.URL.revokeObjectURL(url);
    }
}
