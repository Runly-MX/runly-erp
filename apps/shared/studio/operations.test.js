import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject, blankDocument, validateDocument } from './document.js'
import { applyOps, compactOps, diffOps, orderSlots } from './operations.js'

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
