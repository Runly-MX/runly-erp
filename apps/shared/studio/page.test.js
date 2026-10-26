import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankDocument, appendObject } from './document.js'
import { resizeDocument, PAGE_PRESETS } from './page.js'

test('page presets and resize preserve v2 objects by default, with explicit uniform scaling', () => {
  const original = appendObject(appendObject(blankDocument(), 'text', { x: 80, y: 100, scaleX: 1.2, scaleY: 0.8 }), 'rectangle', { x: 900, y: 950, rotation: 45 })
  const page = { width: 540, height: 800, background: '#84cc16' }
  assert.deepEqual(resizeDocument(original, page).objects, original.objects)
  const scaled = resizeDocument(original, page, true)
  assert.equal(scaled.schemaVersion, 4)
  assert.equal(scaled.objects[0].x, 40); assert.equal(scaled.objects[0].scaleX, 0.6)
  assert.equal(scaled.objects[0].scaleY, 0.4); assert.equal(scaled.objects[1].width, 160)
  assert.equal(scaled.objects[1].rotation, 45)
  assert.equal(original.page.width, 1080)
  for (const preset of PAGE_PRESETS.filter(p => p.width)) assert.doesNotThrow(() => resizeDocument(original, { width: preset.width, height: preset.height, background: '#ffffff' }))
})
test('page mutation rejects invalid dimensions/background and unsafe scaled bounds atomically', () => {
  const document = blankDocument()
  for (const patch of [{width:31},{height:4097},{width:100.5},{width:NaN},{background:'transparent'}]) {
    assert.throws(() => resizeDocument(document, { ...document.page, ...patch }))
    assert.deepEqual(document, blankDocument())
  }
  const extreme = appendObject(blankDocument(), 'text', { scaleX: 8, scaleY: 8 })
  assert.throws(() => resizeDocument(extreme, { width: 4096, height: 4096, background: '#ffffff' }, true))
  assert.equal(resizeDocument({ ...document, schemaVersion: 1 }, document.page).schemaVersion, 4)
})
