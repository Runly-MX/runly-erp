import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {applyOps} from '../../../apps/shared/studio/operations.js'
import {findPage} from '../../../apps/shared/studio/pages.js'
const assert=(condition,message)=>{if(!condition)throw Error(message)}
window.studioMultipageVerification=async()=>{
  const canvas=document.createElement('canvas');document.body.append(canvas)
  let selected=[],authorized=true,changes=0
  const scene=appendObject(blankDocument(320,240),'rectangle',{id:'cover-shape',width:100,height:80})
  const editor=await createStudioEditor(canvas,{document:scene,onSelection:(_,ids)=>{selected=ids},onChange:()=>changes++,authorizePage:async()=>{if(!authorized)throw Object.assign(Error('revoked'),{status:403})}})
  try{
    for(let n=2;n<=5;n++)await editor.addPage({id:`p${n}`,width:n%2?320:240,height:n%2?240:320})
    assert(editor.listPages().length===5,'five pages')
    editor.select('cover-shape');editor.setViewport({zoom:0.5,panX:12,panY:13})
    await editor.selectPage('p2');await editor.add('text',{text:'Página dos',fontFamily:'Lato',fontVariant:'bold',fontSize:24})
    const textId=editor.activeScene().objects[0].id
    editor.patch({x:33});await editor.selectPage('page-1')
    assert(selected.includes('cover-shape'),'selection restored per page')
    assert(findPage(editor.snapshot(),'p2').objects[0].x===33,'pending edit survives page switch')
    await editor.selectPage('p2');assert(selected.includes(textId),'second page selection restored')
    editor.patch({text:'Texto local'})
    const remote=applyOps(editor.snapshot(),[{type:'patch',pageId:'page-1',id:'cover-shape',set:{fill:'#ff0000'}}])
    await editor.applyRemote(remote);await editor.undo()
    assert(editor.activeScene().objects[0].text==='Página dos','global undo on active page')
    assert(editor.snapshot().objects[0].fill==='#ff0000','remote other page preserved by undo')
    await editor.redo();assert(editor.activeScene().objects[0].text==='Texto local','global redo')
    const before=JSON.stringify(editor.snapshot()),count=changes
    editor.deselect();assert(!selected.length,'deselect clears active Fabric object')
    assert(JSON.stringify(editor.snapshot())===before&&changes===count,'deselect changes no document/history')
    editor.select(textId)
    const first=await editor.getPageThumbnail('page-1'),bitmap=await createImageBitmap(first)
    assert(bitmap.width===256&&bitmap.height===192,'bounded faithful cover thumbnail');bitmap.close()
    editor.patch({x:34})
    const cached=await editor.getPageThumbnail('page-1');assert(cached===first,'other page edits preserve cached thumbnail')
    authorized=false;let denied=false
    try{await editor.getPageThumbnail('page-1')}catch(error){denied=error.status===403}
    assert(denied,'revoked access cannot return cached private pixels');authorized=true
    const png=await editor.exportImage('png'),image=await createImageBitmap(png)
    assert(image.width===240&&image.height===320,'active page PNG dimensions');image.close()
    await editor.duplicatePage('p2','copy')
    assert(findPage(editor.snapshot(),'copy').objects[0].id!==textId,'duplicate regenerates object IDs')
    await editor.reorderPages(['p5','p4','p3','copy','p2','page-1'])
    assert(editor.snapshot().page.id==='p5'&&editor.activePageId()==='p2','reorder preserves active identity')
    const start=performance.now()
    for(const id of ['p5','p4','p3','p2','page-1'])await editor.selectPage(id)
    const switchingMs=performance.now()-start
    const saved=JSON.parse(JSON.stringify(editor.snapshot()))
    await editor.selectPage('p2')
    await editor.applyRemote(applyOps(editor.snapshot(),[{type:'removePage',pageId:'p2'}]))
    assert(editor.activePageId()==='p5'&&!editor.listPages().some(p=>p.id==='p2'),'deleted active page falls back safely')
    return {pages:saved.additionalPages.length+1,switchingMs,selectedRestored:true,selectiveHistory:true,thumbnailCache:true,privateCacheDenied:true,deselection:true,activeExport:true,reorder:true,deletedActive:true,saved}
  }finally{await editor.destroy();canvas.remove()}
}
window.studioMultipageBudgetVerification=async()=>{
  const canvas=document.createElement('canvas');document.body.append(canvas)
  const object=appendObject(blankDocument(320,240),'rectangle').objects[0]
  const scenes=Array.from({length:5},(_,p)=>({page:{id:p?`p${p+1}`:'page-1',width:320,height:240,background:'#ffffff'},objects:Array.from({length:400},(_,n)=>({...object,id:`budget-${p}-${n}`}))}))
  scenes[1].objects[0].groupId='other-group'
  const editor=await createStudioEditor(canvas,{document:{schemaVersion:7,unit:'px',...scenes[0],additionalPages:scenes.slice(1)}})
  try{
    const before=JSON.stringify(editor.snapshot())
    for(const extra of [{},{id:'budget-1-0'}]){
      let rejected=false;try{await editor.add('rectangle',extra)}catch{rejected=true}
      assert(rejected&&JSON.stringify(editor.snapshot())===before,'global quota/collision must fail before changing the active canvas')
    }
    editor.select('budget-0-0')
    let rejected=false;try{editor.patch({groupId:'other-group'})}catch{rejected=true}
    assert(rejected&&JSON.stringify(editor.snapshot())===before,'cross-page group assignment fails atomically')
    return {globalObjects:2000,addRejectedAtomically:true,groupRejectedAtomically:true}
  }finally{await editor.destroy();canvas.remove()}
}
window.setupStudioMultipageAbort=async()=>{
  const canvas=document.createElement('canvas');document.body.append(canvas)
  const documentData=blankDocument(320,240),fileId='00000000-0000-4000-8000-000000000001'
  const photo=appendObject(blankDocument(320,240),'rectangle',{fillPaint:{type:'image',fileAssetId:fileId}})
  documentData.additionalPages=[{page:{...photo.page,id:'private-page'},objects:photo.objects}]
  const editor=await createStudioEditor(canvas,{document:documentData,resolveImage:async()=>'/studio-test-private.png',authorizePage:async()=>{}})
  const controller=new AbortController(),before=JSON.stringify(editor.snapshot())
  window.multipageAbort={editor,controller,canvas,before,promise:editor.exportPage('private-page','png',1,editor.snapshot(),{signal:controller.signal}).then(()=>({accepted:true}),error=>({name:error.name}))}
}
window.studioMultipageAtomicRemoteVerification=async()=>{
  const canvas=document.createElement('canvas');document.body.append(canvas)
  let release,started
  const gate=new Promise(resolve=>{release=resolve}),seen=new Promise(resolve=>{started=resolve})
  const photo=document.createElement('canvas');photo.width=photo.height=8;const url=photo.toDataURL()
  let doc=appendObject(blankDocument(320,240),'rectangle',{id:'local-shape'})
  doc=applyOps(doc,[{type:'duplicatePage',pageId:'page-1',newId:'p2'}])
  const editor=await createStudioEditor(canvas,{document:doc,resolveImage:async()=>{started();await gate;return url}})
  try{
    editor.select('local-shape')
    const image={...doc.objects[0],id:'incoming-photo',type:'image',fileAssetId:'00000000-0000-4000-8000-000000000001'}
    const remote=editor.applyRemote(applyOps(doc,[{type:'upsert',pageId:'page-1',object:image},{type:'patchPage',pageId:'p2',set:{background:'#112233'}}]))
    await seen
    let guarded=false;try{editor.patch({x:111})}catch{guarded=true}
    assert(guarded,'cross-page I/O must not attribute foreign pages to a local undo entry')
    release();await remote
    editor.select('local-shape');editor.patch({x:123});await editor.undo()
    assert(editor.snapshot().objects[0].x===80,'local edit undone')
    assert(findPage(editor.snapshot(),'p2').page.background==='#112233'&&editor.snapshot().objects.some(o=>o.id==='incoming-photo'),'foreign changes preserved')
    return {crossPageAtomic:true,foreignUndoPreserved:true}
  }finally{release();await editor.destroy();canvas.remove();photo.remove()}
}
