import React,{useEffect,useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {TooltipProvider} from '@runly/ui'
import {TextSelectionControls} from '../../../apps/desktop/src/modules/runly.studio/components/editor/TextSelectionControls.jsx'
import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {ensureStudioFont} from '../../../apps/desktop/src/modules/runly.studio/lib/studio-fonts.js'
import {STUDIO_FONTS,STUDIO_FONT_VARIANTS,studioFontStyle} from '../../../apps/shared/studio/fonts.js'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'

function Fixture() {
  const ref=useRef(null),[selection,setSelection]=useState(null)
  useEffect(()=>{
    let editor,cancelled=false
    createStudioEditor(ref.current,{document:appendObject(blankDocument(1000,300),'text',{fontFamily:'Inter',text:'Árbol, pingüino y NIÑEZ',fontSize:64,x:20,y:20,width:940}),onSelection:item=>setSelection(item)}).then(value=>{
      editor=value;if(cancelled){editor.destroy();return}
      editor.select(editor.snapshot().objects[0].id);window.fontWeightsEditor=editor
    })
    return()=>{cancelled=true;editor?.destroy()}
  },[])
  return <><div style={{padding:16,minHeight:100}}>{selection?<TextSelectionControls selection={selection} onPatch={patch=>window.fontWeightsEditor.patch(patch)}/>:null}</div><canvas ref={ref}/></>
}
createRoot(document.getElementById('root')).render(<TooltipProvider><Fixture/></TooltipProvider>)

window.verifyFontFaces=async()=>{
  let count=0
  for(const font of STUDIO_FONTS)for(const variant of Object.keys(font.variants)){
    await ensureStudioFont(font.family,variant)
    const style=studioFontStyle(font.family,variant)
    if(!document.fonts.check(`${style.style} ${style.weight} 48px "${font.family}"`,'Árbol, NIÑEZ ¿Sí?'))throw Error(`Missing loaded face ${font.family}/${variant}`)
    count++
  }
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=150
  const ctx=canvas.getContext('2d'),samples=[]
  for(const family of ['Lato','Poppins','Inter','Montserrat']){
    const rows=[]
    for(const variant of ['thin','regular','bold','extrabold','black','boldItalic']){
      const style=STUDIO_FONT_VARIANTS[variant]
      ctx.clearRect(0,0,canvas.width,canvas.height)
      ctx.font=`${style.style} ${style.weight} 64px "${family}"`;ctx.fillText('Árbol, NIÑEZ 0123',10,90)
      const data=ctx.getImageData(0,0,canvas.width,canvas.height).data
      let ink=0,signature=2166136261
      for(let n=3;n<data.length;n+=4){ink+=data[n];signature=Math.imul(signature^data[n],16777619)>>>0}
      rows.push({variant,ink,signature})
    }
    if(rows[4].ink<=rows[0].ink*1.5)throw Error(`Thin/Black did not render different real strokes: ${family}`)
    if(new Set(rows.map(r=>r.signature)).size!==rows.length)throw Error(`Repeated weight/italic raster: ${family}`)
    samples.push({family,rows})
  }
  return {faces:count,samples}
}
window.verifyReopenedWeight=async()=>{
  const saved=window.fontWeightsEditor.snapshot(),first=await window.fontWeightsEditor.exportPng()
  const canvas=document.createElement('canvas');document.body.append(canvas)
  const editor=await createStudioEditor(canvas,{document:JSON.parse(JSON.stringify(saved))})
  try{
    const second=await editor.exportPng(),a=new Uint8Array(await first.arrayBuffer()),b=new Uint8Array(await second.arrayBuffer())
    if(a.length!==b.length||!a.every((byte,index)=>byte===b[index]))throw Error('Font weight/style changed after reopening')
    return {identicalPng:true,font:editor.snapshot().objects[0].fontFamily,variant:editor.snapshot().objects[0].fontVariant}
  }finally{await editor.destroy();canvas.remove()}
}
