import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {blankDocument} from '../../../apps/shared/studio/document.js'
import {DEFAULT_GRADIENT,canvasGradient} from '../../../apps/shared/studio/gradient.js'
import {renderThumbnailItem} from '../../../apps/desktop/src/modules/runly.studio/lib/thumbnail-renderer.js'
import {createSnapIndex,snapBounds} from '../../../apps/shared/studio/snapping.js'
const check=(ok,message)=>{if(!ok)throw Error(message)}
const element=()=>{const c=document.createElement('canvas');document.body.append(c);return c}
const bytes=async blob=>new Uint8Array(await blob.arrayBuffer())
const same=async(a,b)=>{const x=await bytes(a),y=await bytes(b);return x.length===y.length&&x.every((v,i)=>v===y[i])}
async function raster(blob){const bitmap=await createImageBitmap(blob),c=element();c.width=bitmap.width;c.height=bitmap.height;c.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return c}
window.studioAdvancedVerification=async()=>{
  const checks=[],file='00000000-0000-4000-8000-000000000001',image=element();image.width=100;image.height=60
  image.getContext('2d').fillStyle='#84cc16';image.getContext('2d').fillRect(0,0,100,60)
  const options={resolveImage:async()=>image.toDataURL()}
  let editor=await createStudioEditor(element(),{document:blankDocument(640,480),...options})
  const linear={...DEFAULT_GRADIENT,angle:37,stops:[{offset:0,color:'#ff0000',opacity:0.2},{offset:0.4,color:'#00ff00',opacity:0.6},{offset:1,color:'#0000ff',opacity:1}]}
  const radial={type:'gradient',gradientType:'radial',centerX:0.3,centerY:0.6,radius:0.8,stops:linear.stops}
  await editor.setPageGradient({...DEFAULT_GRADIENT,angle:90})
  for(const [i,type]of ['rectangle','ellipse','vector'].entries()){
    await editor.add(type,{x:60+i*170,y:50,width:140,height:90,rotation:i*15,opacity:i===0?0.7:1,fillPaint:i===1?radial:linear,...(type==='vector'?{svgName:'triangle.svg',geometry:{width:24,height:24,paths:[{d:'M0 24L12 0L24 24Z',fill:'color',stroke:'none',strokeWidth:0,cap:'butt',join:'miter'}]}}:{})})
  }
  const first=editor.snapshot().objects[0].id
  await editor.add('image',{x:80,y:250,width:140,height:100,fileAssetId:file,image:{mask:'star',zoom:1.3}})
  await editor.add('text',{x:320,y:250,width:200,height:70,text:'Gradient scene',fill:'#ffffff',fontSize:24})
  await editor.add('rectangle',{x:430,y:350,width:120,height:80,rotation:12,shape:{radius:16,strokeWidth:2},fillPaint:{type:'image',fileAssetId:file,image:{zoom:1.2,offsetX:0.1,rotation:25}}})
  await editor.add('line',{x:80,y:400,width:200,height:20,rotation:5,strokeWidth:3,startCap:'circle',endCap:'diamond'})
  const doc=editor.snapshot(),png=await editor.exportPng(),jpg=await editor.exportImage('jpg',1)
  await editor.destroy();editor=await createStudioEditor(element(),{document:JSON.parse(JSON.stringify(doc)),...options})
  check(await same(png,await editor.exportPng()),'Gradient PNG changed after reopening');check(await same(jpg,await editor.exportImage('jpg',1)),'Gradient JPG changed after reopening')
  checks.push('Linear/radial/transparent/rotated/vector/page/text/photo scene: byte-identical PNG and JPG after JSON reopen')
  // Interior pixel oracle: same canonical paint independently drawn in Canvas2D.
  const output=await raster(png),ctx=output.getContext('2d'),oracle=element();oracle.width=640;oracle.height=480
  const oc=oracle.getContext('2d');oc.fillStyle=canvasGradient(oc,doc.page.backgroundPaint,640,480);oc.fillRect(0,0,640,480)
  oc.save();oc.globalAlpha=0.7;oc.translate(60,50);oc.fillStyle=canvasGradient(oc,linear,140,90);oc.fillRect(0,0,140,90);oc.restore()
  let maxError=0
  for(const [x,y]of [[80,80],[120,100],[170,110],[600,400]]){
    const a=ctx.getImageData(x,y,1,1).data,b=oc.getImageData(x,y,1,1).data
    a.forEach((n,i)=>{maxError=Math.max(maxError,Math.abs(n-b[i]))})
  }
  check(maxError<=2,`Gradient pixel deviation ${maxError} > 2`)
  const preview=await renderThumbnailItem(doc.objects[0]),previewBlob=await (await fetch(preview.url)).blob(),thumb=await raster(previewBlob)
  const local=element();local.width=140;local.height=90;const lc=local.getContext('2d');lc.fillStyle=canvasGradient(lc,linear,140,90);lc.fillRect(0,0,140,90)
  const ta=thumb.getContext('2d').getImageData(50+preview.padding,40+preview.padding,1,1).data,tb=lc.getImageData(50,40,1,1).data
  check([...ta].every((v,i)=>Math.abs(v-tb[i])<=2),'Thumbnail paint mismatch')
  checks.push('Independent Canvas2D and thumbnail interior pixel tolerance ≤2 per channel')
  editor.select(first);const before=editor.snapshot();await editor.beginInteraction();await editor.addGradientStop({offset:0.7,color:'#abcdef',opacity:0.8});await editor.updateGradientStop(1,{opacity:0.3});await editor.reverseGradient();await editor.endInteraction();await editor.undo()
  check(JSON.stringify(editor.snapshot())===JSON.stringify(before),'Gradient gesture undo not atomic');await editor.redo()
  await editor.setSolidFill('#123456');check(editor.snapshot().objects[0].fillPaint.type==='solid','Solid conversion failed');await editor.undo()
  await editor.duplicate();check(editor.snapshot().objects.at(-1).fillPaint.type==='gradient','Gradient clipboard lost paint')
  checks.push('Stop editing/reverse/conversion/clipboard/one-entry gesture undo')
  editor.selectMany(editor.snapshot().objects.slice(0,7).map(o=>o.id));const group=editor.group(),original=editor.snapshot()
  await editor.align('center','page');await editor.undo();check(JSON.stringify(editor.snapshot())===JSON.stringify(original),'Group alignment undo changed members')
  await editor.transformGroup(group.id,{scale:1.2,rotation:25,origin:{x:100,y:100}})
  const transformed=editor.snapshot(),groupPng=await editor.exportPng();await editor.undo();check(JSON.stringify(editor.snapshot())===JSON.stringify(original),'Group undo not atomic');await editor.redo()
  check(JSON.stringify(editor.snapshot())===JSON.stringify(transformed),'Group redo mismatch');editor.selectGroup(group.id);editor.ungroup();check(await same(groupPng,await editor.exportPng()),'Ungroup changed pixels')
  checks.push('Flat group proportional scaling/rotation, undo/redo and byte-identical ungroup')
  const prefsBefore=JSON.stringify(editor.snapshot());editor.setGridOptions({visible:true,rulers:true,size:16});editor.setViewport({zoom:0.5,panX:22,panY:-12});editor.setSnappingEnabled(false)
  check(JSON.stringify(editor.snapshot())===prefsBefore,'Preferences entered document')
  const unchanged=await editor.exportPng();editor.setGridOptions({visible:false,rulers:false});check(await same(unchanged,await editor.exportPng()),'Grid entered export')
  const boxes=Array.from({length:500},(_,i)=>({id:String(i),left:i%25*100,top:Math.floor(i/25)*100,width:60,height:60}))
  const start=performance.now(),index=createSnapIndex({width:4096,height:4096},boxes)
  for(let i=0;i<1000;i++)snapBounds(index,{left:i,top:i/2,width:60,height:60})
  const snapping1000ms=performance.now()-start
  checks.push('Preferences/ruler coordinates isolated from document/export; bounded 500-object index')
  editor.setReadOnly(true);let rejected=false;try{await editor.setGradient()}catch{rejected=true}check(rejected,'Read-only paint mutation allowed')
  await editor.destroy();for(const c of [image,output,oracle,thumb,local])c.remove()
  return {checks,maxPixelError:maxError,snapping1000ms}
}
window.setupStudioSnap=async(zoom=1)=>{
  const canvas=element(),guides=[],editor=await createStudioEditor(canvas,{document:blankDocument(640,480),onGuides:g=>guides.push(g)})
  await editor.add('rectangle',{x:100,y:100,width:100,height:80,fillPaint:{type:'solid',color:'#123456'}})
  const wrapper=canvas.parentElement;wrapper.style.transformOrigin='top left';wrapper.style.transform=`scale(${zoom})`;wrapper.style.marginLeft='40px'
  window.snapTest={editor,guides,canvas}
  canvas.scrollIntoView({block:'start'})
  return canvas.parentElement.querySelector('.upper-canvas').getBoundingClientRect().toJSON()
}
window.setupCanonicalSnap=async({zoom=1,width=300,rotation=0,pan=0}={})=>{
  const canvas=element(),editor=await createStudioEditor(canvas,{document:blankDocument(1080,720)})
  await editor.add('ellipse',{x:80,y:80,width,height:180,rotation})
  const wrapper=canvas.parentElement;wrapper.style.transformOrigin='top left';wrapper.style.transform=`scale(${zoom})`;wrapper.style.marginLeft=`${40+pan}px`
  window.snapTest={editor,canvas};canvas.scrollIntoView({block:'start'})
  const bounds=wrapper.querySelector('.upper-canvas').getBoundingClientRect().toJSON(),a=rotation*Math.PI/180
  return {bounds,cx:80+width/2*Math.cos(a)-90*Math.sin(a),cy:80+width/2*Math.sin(a)+90*Math.cos(a)}
}
