"use strict"

/****************************************************************************
**
** Copyright (C) 2018-2022 Reiner Schlitzer. All rights reserved.
**
** This file is provided AS IS with NO WARRANTY OF ANY KIND, INCLUDING THE
** WARRANTY OF DESIGN, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
**
****************************************************************************/

/* on load event handler */
window.addEventListener('load',onPageLoad);

/**
  Installs a click-event handler for all tree-group-node elements.
*/
/**************************************************************************/
function activateTree(elId,onTreeItemClickFct)
/**************************************************************************/
{
    let treeEl=document.getElementById(elId);
    let treeGroups=treeEl.getElementsByClassName('tree-group-node');
    for (let i=0; i<treeGroups.length; ++i)
	treeGroups[i].addEventListener('click',function(){ this.parentElement.querySelector('.tree-nested-list').classList.toggle('tree-nested-list-open'); this.classList.toggle('tree-group-node-open'); });

    let treeItems=treeEl.getElementsByClassName('tree-item-node');
    for (let i=0; i<treeItems.length; ++i)
	treeItems[i].addEventListener('click',onTreeItemClickFct);

    //treeGroups[0].click();
}

/**************************************************************************/
function onPageLoad()
/**************************************************************************/
{
    activateTree('oceanTree',onDatasetSelect);
    activateTree('atmosTree',onDatasetSelect);
    activateTree('riversTree',onDatasetSelect);
    activateTree('iceTree',onDatasetSelect);
    activateTree('sedimTree',onDatasetSelect);
    window.name='explore-root-'+Math.floor(Math.random()*10001);
}

/**************************************************************************/
function onDatasetSelect()
/**************************************************************************/
{
    let v=this.attributes.value;
    //let url=extPrms.exploreRootUrl+v.nodeValue+extPrms.gcubeSuffix;
    let url=extPrms.exploreRootUrl+v.nodeValue;
    window.open(url,'_blank');
}
