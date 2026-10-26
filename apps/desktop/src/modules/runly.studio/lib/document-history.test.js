import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentHistory } from './document-history.js'
import { blankDocument, appendObject, validateDocument } from '../../../../../shared/studio/document.js'

test('v1 upgrades without mutating its input and v2 flags survive roundtrip', () => {
  const v1 = { ...appendObject(blankDocument(), 'rectangle'), schemaVersion: 1 }
  delete v1.objects[0].locked; delete v1.objects[0].hidden
  const upgraded = validateDocument(v1)
  assert.equal(upgraded.schemaVersion, 4); assert.equal(upgraded.objects[0].locked, false)
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
