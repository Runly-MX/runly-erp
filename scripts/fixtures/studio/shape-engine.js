import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {blankDocument} from '../../../apps/shared/studio/document.js'
import {LINE_CAPS} from '../../../apps/shared/studio/shape-properties.js'
const check=(yes,message)=>{if(!yes)throw Error(message)}
const file='00000000-0000-4000-8000-000000000001',copy='00000000-0000-4000-8000-000000000002'
const element=()=>{const c=document.createElement('canvas');document.body.append(c);return c}
const same=async(a,b)=>{const x=new Uint8Array(await a.arrayBuffer()),y=new Uint8Array(await b.arrayBuffer());return x.length===y.length&&x.every((v,i)=>v===y[i])}
window.studioShapeVerification=async()=>{
 const image=element();image.width=120;image.height=80;const ctx=image.getContext('2d');ctx.fillStyle='#ef4444';ctx.fillRect(0,0,60,80);ctx.fillStyle='#2563eb';ctx.fillRect(60,0,60,80)
 const resolveImage=async()=>image.toDataURL(),authorized=[],options={resolveImage,authorizePaste:async objects=>{authorized.push(objects)}}
 let editor=await createStudioEditor(element(),{document:blankDocument(640,480),...options})
 const checks=[]
 for(const label of ['rectangle','circle','ellipse','vector']){
  const type=label==='circle'?'ellipse':label
  await editor.add(type,{x:40,y:40,width:label==='ellipse'?240:180,height:label==='ellipse'?140:180,fill:'#14b8a6',...(type==='vector'?{svgName:'triangle.svg',geometry:{width:24,height:24,paths:[{d:'M0 24L12 0L24 24Z',fill:'color',stroke:'none',strokeWidth:0,cap:'butt',join:'miter'}]}}:{})})
  const id=editor.snapshot().objects.at(-1).id
  await editor.setShapeStyle({strokeWidth:4,strokeColor:'#000000',dash:'dotted',...(type==='rectangle'?{radius:32}:{})})
  await Promise.all([editor.setShapeStyle({strokeColor:'#111111'}),editor.setShapeStyle({strokeWidth:5})]);check(editor.snapshot().objects.at(-1).shape.strokeColor==='#111111','Queued styles lost earlier change')
  await editor.patch({fillPaint:{type:'solid',color:'#abcdef'}})
  await editor.setShapeStyle({fillEnabled:false})
  const empty=await createImageBitmap(await editor.exportPng()),emptyCanvas=element();emptyCanvas.width=640;emptyCanvas.height=480;emptyCanvas.getContext('2d').drawImage(empty,0,0);empty.close();check([...emptyCanvas.getContext('2d').getImageData(130,130,1,1).data].slice(0,3).every(v=>v===255),'Disabled fill still paints pixels');emptyCanvas.remove()
  editor.select(id);await editor.setShapeStyle({fillEnabled:true})
  const solid=editor.snapshot().objects.at(-1)
  await editor.setPhotoFill(file,{zoom:1.2,offsetX:0.1,rotation:15,flipX:true})
  check(editor.snapshot().objects.at(-1).type===type,'Shape type replaced')
  check(editor.snapshot().objects.at(-1).id===id,'Shape ID changed')
  await editor.patch({width:220,height:160,rotation:12,opacity:0.8})
  const before=editor.snapshot(),png=await editor.exportPng(),jpg=await editor.exportImage('jpg',1)
  const bitmap=await createImageBitmap(png),probe=element();probe.width=bitmap.width;probe.height=bitmap.height;probe.getContext('2d').drawImage(bitmap,0,0);bitmap.close();const center=[...probe.getContext('2d').getImageData(130,130,1,1).data];check(center.slice(0,3).some(v=>v!==255),'Photo fill rendered empty');probe.remove()
  await editor.destroy();editor=await createStudioEditor(element(),{document:before,...options});editor.select(id)
  check(await same(png,await editor.exportPng()),'Shape PNG reopen mismatch');check(await same(jpg,await editor.exportImage('jpg',1)),'Shape JPG reopen mismatch')
  editor.select(id);await editor.beginInteraction();await editor.patchImage({zoom:2});await editor.patchImage({rotation:35,flipY:true});await editor.endInteraction()
  await editor.undo();check(JSON.stringify(editor.snapshot())===JSON.stringify(before),'Shape framing undo mismatch');await editor.redo()
  await editor.replaceImage(id,copy);check(editor.snapshot().objects.at(-1).fillPaint.fileAssetId===copy,'Shape replacement lost')
  await editor.removePhotoFill();check(editor.snapshot().objects.at(-1).fill===(solid.fillPaint?.color??solid.fill),'Original solid fill lost');check(!editor.snapshot().objects.at(-1).fillPaint,'Photo not removed')
  await editor.undo();check(editor.snapshot().objects.at(-1).fillPaint.fileAssetId===copy,'Remove photo undo lost')
  editor.select(id);await editor.duplicate();check(editor.snapshot().objects.at(-1).fillPaint.fileAssetId===copy,'Clipboard lost fill')
  checks.push(label+' solid/photo, styles, inner framing, replace, remove, history, clipboard, exact PNG/JPG reopen')
  editor.selectAll();editor.remove()
 }
 for(const [i,kind]of LINE_CAPS.entries())await editor.add('line',{x:40,y:30+i*55,width:300,height:20,points:[[0,0],[1,1]],strokeWidth:4,dash:i%2?'dashed':'solid',startCap:kind,endCap:LINE_CAPS.at(-1-i),rotation:5})
 const doc=editor.snapshot(),png=await editor.exportPng(),jpg=await editor.exportImage('jpg',1)
 await editor.destroy();editor=await createStudioEditor(element(),{document:doc,...options})
 check(await same(png,await editor.exportPng()),'Cap PNG mismatch');check(await same(jpg,await editor.exportImage('jpg',1)),'Cap JPG mismatch')
 checks.push('All seven rotated independent line cap kinds, exact PNG/JPG reopen')
 check(authorized.some(objects=>objects.some(o=>o.fillPaint?.type==='image')),'Authorization missed nested photo')
 await editor.destroy();image.remove();return {checks}
}
