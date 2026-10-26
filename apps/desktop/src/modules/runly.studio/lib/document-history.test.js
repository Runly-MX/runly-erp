import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentHistory } from './document-history.js'
import { blankDocument, appendObject, validateDocument } from '../../../../../shared/studio/document.js'
import { transformStudioGroup } from '../../../../../shared/studio/group-transform.js'

test('v1 upgrades without mutating its input and v2 flags survive roundtrip', () => {
  const v1 = { ...appendObject(blankDocument(), 'rectangle'), schemaVersion: 1 }
  delete v1.objects[0].locked; delete v1.objects[0].hidden
  const upgraded = validateDocument(v1)
  assert.equal(upgraded.schemaVersion, 6); assert.equal(upgraded.objects[0].locked, false)
  assert.equal(v1.objects[0].locked, undefined)
  upgraded.objects[0].locked = true; upgraded.objects[0].hidden = true
  assert.deepEqual(validateDocument(upgraded), upgraded)
  assert.throws(() => validateDocument({ ...upgraded, schemaVersion: 999 }))
})

test('history restores all object properties, branches safely and bounds retention', () => {
  const doc = appendObject(blankDocument(), 'text'), history = createDocumentHistory(doc, { limit: 2 })
  assert.equal(history.commit(doc), false)
  const modified = structuredClone(doc); modified.objects[0].text = 'Edited'; modified.objects[0].x = 250
  history.commit(modified)
  assert.deepEqual(history.peek('undo'), doc)
  assert.deepEqual(history.move('undo'), doc)
  assert.deepEqual(history.move('redo'), modified)
  history.move('undo'); history.commit(appendObject(doc, 'ellipse'))
  assert.equal(history.state().canRedo, false)
  for (let n = 0; n < 5; n++) history.commit({ ...modified, page: { ...modified.page, width: 100 + n } })
  assert.equal(history.state().entries, 2)
  const tiny = createDocumentHistory(doc, { maxBytes: 1 }); tiny.commit(modified)
  assert.equal(tiny.state().entries, 0)
})

test('undo reverts only local changes and keeps a collaborator change made meanwhile', () => {
  let doc = appendObject(appendObject(blankDocument(), 'rectangle', { x: 10 }), 'ellipse', { x: 300 })
  const history = createDocumentHistory(doc)
  const mine = structuredClone(doc); mine.objects[0].x = 99; history.commit(mine)
  const theirs = structuredClone(mine); theirs.objects[1].fill = '#123456'
  history.rebase([{ type: 'upsert', object: theirs.objects[1] }])
  const undone = history.move('undo')
  assert.equal(undone.objects[0].x, 10); assert.equal(undone.objects[1].fill, '#123456')
  assert.equal(history.move('redo').objects[0].x, 99)
})

test('selective undo preserves remote properties on the same object and does not resurrect remote deletions',()=>{
  const doc=appendObject(blankDocument(),'rectangle'),history=createDocumentHistory(doc),id=doc.objects[0].id
  history.commit({...doc,objects:[{...doc.objects[0],x:123,fill:'#123456'}]})
  history.rebase([{type:'patch',id,set:{fill:'#abcdef',y:222}}])
  let next=history.move('undo');assert.equal(next.objects[0].x,80);assert.equal(next.objects[0].fill,'#abcdef');assert.equal(next.objects[0].y,222)
  next=history.move('redo');assert.equal(next.objects[0].x,123);assert.equal(next.objects[0].fill,'#abcdef')
  history.rebase([{type:'remove',id}]);assert.deepEqual(history.move('undo').objects,[]);assert.equal(history.state().canRedo,false)
})
test('gradient/photo/group properties remain atomic; undo of creation never deletes a remotely edited object',()=>{
  const doc=appendObject(blankDocument(),'rectangle'),id=doc.objects[0].id,history=createDocumentHistory(blankDocument())
  history.commit(doc);history.rebase([{type:'patch',id,set:{groupId:'remote-group'}}])
  assert.equal(history.move('undo').objects[0].groupId,'remote-group')
  const h=createDocumentHistory(doc),paint={type:'gradient',gradientType:'linear',angle:0,stops:[{offset:0,color:'#000000',opacity:1},{offset:1,color:'#ffffff',opacity:1}]}
  h.commit({...doc,objects:[{...doc.objects[0],fillPaint:paint,groupId:'local'}]})
  h.rebase([{type:'patch',id,set:{fillPaint:{...paint,angle:45}}}])
  const undone=h.move('undo');assert.equal(undone.objects[0].fillPaint.angle,45);assert.equal(undone.objects[0].groupId,undefined)
})
test('group transform undo preserves remote photo framing and text color without adding remote history steps',()=>{
  const fileAssetId='00000000-0000-4000-8000-000000000001'
  let doc=appendObject(blankDocument(),'rectangle',{groupId:'g',fillPaint:{type:'image',fileAssetId,image:{zoom:1.2,offsetX:0.1}}})
  doc=appendObject(doc,'text',{groupId:'g',x:400,text:'Group test'})
  const history=createDocumentHistory(doc),next=transformStudioGroup(doc,'g',{scale:1.2,rotation:20,origin:{x:0,y:0}})
  history.commit(next)
  const framing={...next.objects[0].fillPaint,image:{...next.objects[0].fillPaint.image,offsetX:0.3}}
  history.rebase([{type:'patch',id:doc.objects[0].id,set:{fillPaint:framing}},{type:'patch',id:doc.objects[1].id,set:{fill:'#abcdef'}}])
  assert.equal(history.state().entries,1)
  const undone=history.move('undo');assert.equal(undone.objects[0].width,doc.objects[0].width);assert.equal(undone.objects[0].rotation,0)
  assert.equal(undone.objects[0].fillPaint.fileAssetId,fileAssetId);assert.equal(undone.objects[0].fillPaint.image.offsetX,0.3);assert.equal(undone.objects[1].fill,'#abcdef')
  assert.equal(history.move('redo').objects[0].fillPaint.image.offsetX,0.3)
})
