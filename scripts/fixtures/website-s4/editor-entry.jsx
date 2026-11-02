// Browser acceptance fixture, not a Website UI or an authentication integration.
import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AtlasWebBuilderEditor,baseBlocks,parsePage,serializePage,version} from '@raulbellosom/atlas-web-builder'
import '@raulbellosom/atlas-web-builder/styles'
import {buildRunlyBlocks,buildRunlyTemplates} from '../../../apps/desktop/src/website/runlyBlocks/index.js'
const state=await(await fetch('/lab/state')).json()
localStorage.setItem('runly-lab-admin-session','synthetic-admin-only')
function Fixture(){
 const[status,setStatus]=useState(`Editor ${version}; revision ${state.revision}`)
 async function save(page,publish=false){try{const wire=serializePage(page);parsePage(wire);const response=await fetch('/lab/'+(publish?'publish':'save'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document:JSON.parse(wire),expectedRevision:state.revision})});const result=await response.json();if(!response.ok)throw Error(result.code??'save_failed');state.revision=result.revision;state.document=JSON.parse(wire);setStatus(`${publish?'PUBLISHED':'SAVED'} ${version}; revision ${result.revision}; ${result.title}`)}catch(e){setStatus(`FAILED ${e.message}`)}}
 return <><AtlasWebBuilderEditor blocks={[...baseBlocks,...buildRunlyBlocks('website')]} templates={buildRunlyTemplates('website')} initialPage={parsePage(JSON.stringify(state.document))} brandName={`S4 lab ${version}`} onSaveDraft={page=>save(page)} onPublish={page=>save(page,true)}/><output role="status" style={{position:'fixed',bottom:0,left:0,zIndex:2147483647,background:'white',color:'black',padding:8}}>{status}</output></>
}
createRoot(document.getElementById('editor')).render(<Fixture/> )
