import test from 'node:test'
import assert from 'node:assert/strict'
import {blankDocument,appendObject,validateDocument,STUDIO_LIMITS} from './document.js'
import {applyOps,checkOps,diffOps,compactOps} from './operations.js'
import {documentPages,findPage,pageDocument,replacePage} from './pages.js'
import {createDocumentHistory} from '../../desktop/src/modules/runly.studio/lib/document-history.js'
import {DEFAULT_GRADIENT} from './gradient.js'
import {documentAssetIds} from './shape-properties.js'

const update=(doc,ops)=>validateDocument(applyOps(doc,checkOps(ops)))
const five=()=>update(appendObject(blankDocument(320,240),'rectangle',{id:'original'}),[1,2,3,4].map(n=>({type:'duplicatePage',pageId:'page-1',newId:`p${n+1}`})))
test('v1-v6 upgrade logically to a stable page without mutating historical JSON',()=>{
  for(let schemaVersion=1;schemaVersion<=6;schemaVersion++){
    const input={schemaVersion,unit:'px',page:{width:320,height:240,background:'#ffffff'},objects:[]},serialized=JSON.stringify(input)
    const result=validateDocument(input)
    assert.equal(result.schemaVersion,7);assert.equal(result.page.id,'page-1');assert.deepEqual(result.additionalPages,[])
    assert.equal(JSON.stringify(input),serialized);assert.deepEqual(validateDocument(result),result)
  }
})
test('five pages duplicate paints, photos, groups and order with new globally unique identities',()=>{
  const asset='00000000-0000-4000-8000-000000000001'
  let doc=appendObject(blankDocument(),'rectangle',{id:'shape',groupId:'g',fillPaint:{type:'image',fileAssetId:asset}})
  doc=appendObject(doc,'text',{id:'caption',groupId:'g',text:'Crédito sintético',fontFamily:'Lato',fontVariant:'bold'})
  doc.page.backgroundPaint=structuredClone(DEFAULT_GRADIENT)
  const next=update(doc,[{type:'duplicatePage',pageId:'page-1',newId:'second'}])
  const second=findPage(next,'second');assert.deepEqual(second.page.backgroundPaint,doc.page.backgroundPaint)
  assert.equal(second.objects[0].fillPaint.fileAssetId,asset);assert.notEqual(second.objects[0].groupId,'g')
  assert.equal(second.objects[0].groupId,second.objects[1].groupId);assert.equal(second.objects[1].text,'Crédito sintético')
  assert.deepEqual(documentAssetIds(next),[asset])
  const pages=five(),reordered=update(pages,[{type:'pageOrder',ids:['p5','p4','p3','p2','page-1']}])
  assert.equal(documentPages(reordered).length,5);assert.equal(reordered.page.id,'p5')
  assert.deepEqual(applyOps(pages,diffOps(pages,reordered)),reordered)
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(reordered))),reordered)
})
test('page identity survives reorder; concurrent pages merge; deleted targets cannot resurrect',()=>{
  const doc=five(),a={type:'patch',pageId:'page-1',id:'original',set:{x:1}},b={type:'patch',pageId:'p2',id:'p2-o1',set:{x:2}}
  for(const ops of [[a,b],[b,a]]){
    const result=update(doc,[{type:'pageOrder',ids:['p2','page-1']},...ops])
    assert.equal(findPage(result,'page-1').objects[0].x,1);assert.equal(findPage(result,'p2').objects[0].x,2)
  }
  const removed=update(doc,[{type:'removePage',pageId:'p2'},b,{type:'upsert',pageId:'p2',object:findPage(doc,'p2').objects[0]}])
  assert.equal(findPage(removed,'p2'),undefined)
  assert.equal(update(blankDocument(),[{type:'removePage',pageId:'page-1'}]).page.id,'page-1')
  const legacy=update(doc,[{type:'pageOrder',ids:['p2','page-1']},{type:'patch',id:'original',set:{x:17}}])
  assert.equal(findPage(legacy,'page-1').objects[0].x,17)
})
test('copy and move are atomic, preserve groups, avoid duplicate IDs and produce replayable effective diffs',()=>{
  let doc=five()
  doc=replacePage(doc,{...findPage(doc,'page-1'),objects:[{...doc.objects[0],groupId:'group'}, {...doc.objects[0],id:'another',groupId:'group'}]})
  assert.throws(()=>update(doc,[{type:'transferObjects',pageId:'page-1',targetPageId:'p2',ids:['original'],copy:false}]),/grupo/)
  const moved=update(doc,[{type:'transferObjects',pageId:'page-1',targetPageId:'p2',ids:['original','another'],copy:false}])
  assert.equal(moved.objects.length,0);assert.equal(findPage(moved,'p2').objects.length,3)
  const ops=diffOps(doc,moved);assert.ok(ops.some(op=>op.type==='transferObjects'));assert.deepEqual(update(doc,ops),moved)
  const copied=update(moved,[{type:'transferObjects',pageId:'p2',targetPageId:'p3',ids:['original','another'],copy:true,copyId:'copy'}])
  assert.equal(findPage(copied,'p3').objects[1].groupId,'copy-g1');assert.equal(findPage(moved,'p2').objects.length,3)
})
test('selective page history preserves other users, ignores removed pages and undoes transfers',()=>{
  const doc=five(),history=createDocumentHistory(doc)
  const edited=update(doc,[{type:'patch',pageId:'p2',id:'p2-o1',set:{x:17}}]);history.commit(edited)
  history.rebase([{type:'patch',pageId:'p3',id:'p3-o1',set:{x:35}}])
  let next=history.move('undo');assert.equal(findPage(next,'p2').objects[0].x,80);assert.equal(findPage(next,'p3').objects[0].x,35)
  next=history.move('redo');assert.equal(findPage(next,'p2').objects[0].x,17)
  history.rebase([{type:'removePage',pageId:'p2'}]);assert.equal(findPage(history.move('undo'),'p2'),undefined)
  const moving=createDocumentHistory(doc),moved=update(doc,[{type:'transferObjects',pageId:'page-1',targetPageId:'p2',ids:['original'],copy:false}])
  moving.commit(moved);moving.rebase([{type:'patch',pageId:'p2',id:'original',set:{fill:'#ff0000'}}])
  const undone=moving.move('undo');assert.equal(undone.objects[0].fill,'#ff0000');assert.equal(findPage(undone,'p2').objects.length,1)
})
test('global and page budgets fail closed; extraction cannot change saved page ordering',()=>{
  const doc=five()
  for(const bad of [
    {...doc,additionalPages:Array(24).fill(doc.additionalPages[0])},
    {...doc,additionalPages:[{...doc.additionalPages[0],page:{...doc.page}}]},
    {...doc,additionalPages:[{...doc.additionalPages[0],objects:doc.objects}]},
    {...doc,page:{...doc.page,name:'x'.repeat(121)}},
    {...doc,padding:'á'.repeat(STUDIO_LIMITS.bytes/2+1)},
  ])assert.throws(()=>validateDocument(bad),{code:'STUDIO_INVALID'})
  const scene=pageDocument(doc,'p2');scene.page.name='Página interior'
  assert.equal(replacePage(doc,scene).page.id,'page-1')
  assert.equal(findPage(replacePage(doc,scene),'p2').page.name,'Página interior')
  const first={type:'patchPage',pageId:'page-1',set:{width:320}},second={...first,pageId:'p2',set:{width:640}}
  assert.equal(compactOps([first,second]).length,2)
  assert.throws(()=>checkOps([{type:'patchPage',pageId:'p2',set:{id:'forged'}}]))
})
