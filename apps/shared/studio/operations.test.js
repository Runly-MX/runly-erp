import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject, blankDocument, validateDocument } from './document.js'
import { applyOps, compactOps, diffOps, orderSlots, checkOps } from './operations.js'

const base = () => {
  let doc = blankDocument(800, 600)
  for (const [type, x] of [['rectangle', 10], ['ellipse', 200], ['rectangle', 400]]) doc = appendObject(doc, type, { x })
  return doc
}
const ids = doc => doc.objects.map(object => object.id)

test('diff then apply reproduces any edit: change, add, remove, reorder, page', () => {
  const a = base()
  let b = { ...a, page: { ...a.page, background: '#000000' }, objects: [a.objects[2], { ...a.objects[0], x: 99 }] }
  b = appendObject(validateDocument(b), 'ellipse', { x: 5 })
  assert.deepEqual(applyOps(a, diffOps(a, b)), b)
  assert.deepEqual(diffOps(b, b), [])
})

test('concurrent batches on different objects both survive in server order', () => {
  const a = base()
  const mine = diffOps(a, { ...a, objects: a.objects.map((o, i) => (i === 0 ? { ...o, x: 111 } : o)) })
  const theirs = diffOps(a, { ...a, objects: a.objects.map((o, i) => (i === 1 ? { ...o, fill: '#123456' } : o)) })
  const server = applyOps(applyOps(a, theirs), mine)
  assert.equal(server.objects[0].x, 111); assert.equal(server.objects[1].fill, '#123456')
})

test('order fills only the listed slots; reapplying is idempotent', () => {
  const objects = ['a', 'b', 'c', 'd'].map(id => ({ id }))
  assert.deepEqual(ids({ objects: orderSlots(objects, ['c', 'a', 'zz']) }), ['c', 'b', 'a', 'd'])
  const a = base(), b = { ...a, objects: [...a.objects].reverse() }, ops = diffOps(a, b)
  assert.deepEqual(applyOps(applyOps(a, ops), ops), b)
})

test('compaction keeps the final effect of a long local burst', () => {
  const a = base()
  let doc = a, ops = []
  for (const x of [1, 2, 3]) { const next = { ...doc, objects: doc.objects.map((o, i) => (i === 0 ? { ...o, x } : o)) }; ops.push(...diffOps(doc, next)); doc = next }
  const added = appendObject(doc, 'text', { text: 'Hola' }); ops.push(...diffOps(doc, added)); doc = added
  const removed = { ...doc, objects: doc.objects.filter(o => o.id !== a.objects[1].id) }; ops.push(...diffOps(doc, removed)); doc = removed
  const compact = compactOps(ops)
  assert.ok(compact.length < ops.length)
  assert.deepEqual(applyOps(a, compact), doc)
})

test('independent properties merge, atomic paints/text use sequenced LWW, deletion beats stale patch',()=>{
  const doc=base(),a={...doc,objects:doc.objects.map((o,i)=>i?o:{...o,fill:'#abcdef'})},b={...doc,objects:doc.objects.map((o,i)=>i?o:{...o,x:95})}
  const opsA=diffOps(doc,a),opsB=diffOps(doc,b)
  assert.equal(opsA[0].type,'patch')
  for(const ops of [[...opsA,...opsB],[...opsB,...opsA]]){
    const result=applyOps(doc,ops);assert.equal(result.objects[0].fill,'#abcdef');assert.equal(result.objects[0].x,95)
  }
  assert.equal(applyOps(doc,[{type:'remove',id:doc.objects[0].id},...opsB]).objects.length,2)
  const pageA=diffOps(doc,{...doc,page:{...doc.page,width:1000}}),pageB=diffOps(doc,{...doc,page:{...doc.page,background:'#111111'}})
  assert.deepEqual(applyOps(doc,[...pageA,...pageB]).page,{width:1000,height:600,background:'#111111'})
})
test('compaction preserves remove/re-add slot effects and every intervening order operation',()=>{
  const doc=base(),[a,b,c]=doc.objects
  const ops=[{type:'remove',id:a.id},{type:'upsert',object:a},{type:'order',ids:[c.id,b.id]},{type:'order',ids:[a.id,b.id]}]
  assert.deepEqual(applyOps(doc,compactOps(ops)),applyOps(doc,ops))
  for(const bad of [[{type:'patch',id:a.id,set:{id:'forged'}}],[{type:'patch',id:a.id,set:[]}],[{type:'patch',id:a.id,set:{x:1},unset:['x']}],[{type:'order',ids:[a.id,a.id]}],[{type:'patchPage',set:{__proto__:null,unknown:1}}]])assert.throws(()=>checkOps(bad))
})
