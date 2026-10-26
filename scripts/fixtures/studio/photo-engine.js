import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {IMAGE_MASKS} from '../../../apps/shared/studio/image-properties.js'
import {exportImageDocument} from '../../../packages/ui/src/lib/imageDocumentExport.js'
import {renderTransformed,loadImageFromUrl,NO_ADJUST} from '../../../packages/ui/src/lib/imageEdit.js'

const check=(condition,message)=>{if(!condition)throw Error(message)}
const fileId='00000000-0000-4000-8000-000000000001',copyId='00000000-0000-4000-8000-000000000002'
const element=()=>{const c=document.createElement('canvas');document.body.append(c);return c}
const pixels=async blob=>{const img=await createImageBitmap(blob),c=element();c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);img.close();return c}
const same=async(a,b)=>{const x=new Uint8Array(await a.arrayBuffer()),y=new Uint8Array(await b.arrayBuffer());return x.length===y.length&&x.every((v,i)=>v===y[i])}

window.studioPhotoVerification=async()=>{
  const source=element();source.width=120;source.height=80;const ctx=source.getContext('2d');ctx.fillStyle='#ef4444';ctx.fillRect(0,0,60,80);ctx.fillStyle='#2563eb';ctx.fillRect(60,0,60,80)
  const resolveImage=async()=>source.toDataURL(),checks=[],benchmarks=[]
  let document=appendObject(blankDocument(640,480),'image',{fileAssetId:fileId,x:40,y:40,width:200,height:200}),editor=await createStudioEditor(element(),{document,resolveImage})
  for(const mask of IMAGE_MASKS){
    editor.select('object-1');await editor.setImageMask(mask)
    const png=await editor.exportPng(),canvas=await pixels(png)
    const at=(x,y)=>[...canvas.getContext('2d').getImageData(x,y,1,1).data]
    check(at(140,140).some((v,i)=>i<3&&v!==255),`${mask} center empty`)
    if(['circle','ellipse','star','triangle','arch','rounded'].includes(mask))check(at(41,41).slice(0,3).every(v=>v===255),`${mask} corner not clipped`)
    canvas.remove()
  }
  checks.push('Seven non-destructive masks use original FileAsset pixels')
  editor.select('object-1');await editor.patchImage({mask:'star',offsetX:0.15,offsetY:-0.1,rotation:25,zoom:1.5,flipX:true,crop:{x:0.1,y:0.1,width:0.8,height:0.8},border:{width:3,color:'#14b8a6'},shadow:{blur:4,offsetX:3,offsetY:2,color:'#000000'}})
  editor.patch({width:240,height:180,opacity:0.8})
  const start=performance.now();await editor.beginInteraction()
  await Promise.all(Array.from({length:30},(_,i)=>editor.updateImageAdjustments({brightness:i/100,contrast:0.1,saturation:-0.2,grayscale:true})))
  await editor.endInteraction();benchmarks.push({coalescedSliderMs:performance.now()-start})
  const adjusted=editor.snapshot();await editor.undo();check(!editor.snapshot().objects[0].image.adjustments.grayscale,'Slider undo created more than one step');await editor.redo()
  check(JSON.stringify(editor.snapshot())===JSON.stringify(adjusted),'Slider redo mismatch')
  const png=await editor.exportPng(),jpg=await editor.exportImage('jpg',1),saved=JSON.parse(JSON.stringify(editor.snapshot()))
  await editor.destroy();editor=await createStudioEditor(element(),{document:saved,resolveImage})
  check(await same(png,await editor.exportPng()),'PNG mismatch after reopen');check(await same(jpg,await editor.exportImage('jpg',1)),'JPG mismatch after reopen')
  checks.push('Inner transform, crop, resize, flips, border, shadow, opacity, filters: exact PNG/JPG after reopen; slider history atomic')
  editor.select('object-1');const capture=editor.captureImage();await editor.replaceImage('object-1',copyId,capture.fingerprint)
  check(editor.snapshot().objects[0].fileAssetId===copyId,'replace failed');await editor.undo();check(editor.snapshot().objects[0].fileAssetId===fileId,'replace undo failed');await editor.redo()
  editor.select('object-1');const stale=editor.captureImage();editor.patch({x:90});let rejected=false;try{await editor.replaceImage('object-1',fileId,stale.fingerprint)}catch{rejected=true}check(rejected,'stale edit replaced newer content')
  checks.push('Replace only selected reference, preserve frame, undo/redo, reject stale result')
  await editor.add('line',{x:30,y:280,width:320,height:80,points:[[0,0],[0.5,1],[1,0]],dash:'dashed',endArrow:true,strokeWidth:4})
  await editor.add('text',{x:30,y:340,width:480,fontSize:26,text:'Texto de prueba\nSegunda línea'})
  for(const [fontFamily,fontVariant]of [['Oswald','light'],['Oswald','medium'],['Oswald','semibold'],['Oswald','bold'],['Lato','bold'],['Lato','italic']])await editor.setTextStyle({fontFamily,fontVariant,textAlign:'justify',lineHeight:1.4,charSpacing:40,underline:true,linethrough:true})
  const firstText=editor.snapshot().objects.at(-1).id
  await editor.add('text',{text:'Segundo texto',fontSize:24,x:30,y:430,width:300});const secondText=editor.snapshot().objects.at(-1).id
  editor.select(firstText);const loading=editor.setTextStyle({fontFamily:'Playfair Display',fontVariant:'medium',textAlign:'center'})
  editor.select(secondText);await loading
  check(editor.snapshot().objects.find(o=>o.id===firstText).fontFamily==='Playfair Display'&&editor.snapshot().objects.find(o=>o.id===secondText).fontFamily==='sans-serif','Async font changed a later selection')
  editor.select('object-1');const beforeRace=JSON.stringify(editor.snapshot());const pendingFrame=editor.patchImage({zoom:2});editor.select(secondText)
  let stopped=false;try{await pendingFrame}catch{stopped=true}check(stopped&&JSON.stringify(editor.snapshot())===beforeRace,'Queued frame edit changed a later selection')
  const ids=editor.snapshot().objects.slice(-2).map(o=>o.id);editor.selectMany(ids);const group=editor.group()
  check(editor.groups().length===1,'group missing');editor.selectGroup(group.id);editor.ungroup();check(editor.groups().length===0,'ungroup failed');await editor.undo();check(editor.groups().length===1,'group undo failed')
  editor.selectGroup(group.id);await editor.duplicate();check(editor.groups().length===2,'duplicated group merged with original')
  await editor.importSvg('<svg viewBox="0 0 24 24"><path d="M0 0L24 0L12 24Z"/></svg>','test.svg')
  const composition=editor.snapshot(),composed=await editor.exportPng();await editor.destroy();editor=await createStudioEditor(element(),{document:composition,resolveImage})
  check(editor.groups().length===2,'groups lost on reopen');check(await same(composed,await editor.exportPng()),'line/text/group/SVG roundtrip pixels changed')
  checks.push('Real variable weights, Lato bold/italic, paragraph styles, lines, arrows, persistent groups, SVG; exact reopen pixels')
  const high=element();high.width=2400;high.height=1200;high.getContext('2d').fillStyle='#14b8a6';high.getContext('2d').fillRect(0,0,2400,1200)
  const image=await loadImageFromUrl(high.toDataURL()),preview=renderTransformed(image)
  const highDoc={transform:{quarterTurns:1,angle:0},adjust:NO_ADJUST,filter:{id:'none',amount:100},annotations:[],layers:[],cropN:{x:0,y:0,w:1,h:1}}
  const output=await exportImageDocument(image,highDoc,{originalResolution:true}),bitmap=await createImageBitmap(output)
  check(preview.width===1800,'legacy preview changed');check(bitmap.width===1200&&bitmap.height===2400,'original resolution lost');bitmap.close()
  checks.push('Shared photo export preserves 2400px original; legacy preview remains 1800px')
  await editor.destroy();return {checks,benchmarks,document:composition}
}
