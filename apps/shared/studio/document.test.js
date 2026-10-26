import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject, blankDocument, validateDocument } from './document.js'
import { STUDIO_TEMPLATES, templateDocument } from './templates.js'

test('canonical roundtrip keeps editable data and drops renderer and viewport metadata', () => {
  const doc = appendObject(blankDocument(), 'text', { text: 'Diseño español\nSegunda línea' })
  const roundtrip = validateDocument(JSON.parse(JSON.stringify({ ...doc, viewport: { zoom: 4 }, fabricVersion: 'test' })))
  assert.deepEqual(roundtrip, doc)
  assert.equal(roundtrip.objects[0].text, 'Diseño español\nSegunda línea')
})
test('all original templates are canonical, distinct and editable', () => {
  for (const template of STUDIO_TEMPLATES) {
    const doc = templateDocument(template.key)
    assert.deepEqual(validateDocument(doc), doc)
    assert.equal(doc.page.width, template.width)
    assert.ok(doc.objects.some(o => o.type === 'text'))
  }
})
test('invalid scenes, binary URLs, oversized scenes and duplicate ids fail closed', () => {
  const doc = appendObject(blankDocument(), 'rectangle')
  for (const invalid of [null, {}, { ...doc, schemaVersion: 999 }, { ...doc, unit: 'mm' },
    { ...doc, page: { ...doc.page, width: 100000 } },
    { ...doc, objects: [doc.objects[0], doc.objects[0]] },
    { ...doc, objects: [{ ...doc.objects[0], x: Infinity }] },
    { ...doc, objects: [{ ...doc.objects[0], fill: 'url(https://example.com)' }] },
    { ...doc, objects: [{ ...doc.objects[0], fill: {toString:'invalid'} }] },
    { ...doc, objects: [{ ...doc.objects[0], type: 'image', fileAssetId: 'data:image/png;base64,test' }] },
    { ...doc, objects: Array.from({ length: 501 }, (_, n) => ({ ...doc.objects[0], id: `o${n}` })) }]) {
    assert.throws(() => validateDocument(invalid), { code: 'STUDIO_INVALID' })
  }
})
test('object ids remain unique after deleting and appending', () => {
  const doc = appendObject(appendObject(blankDocument(), 'rectangle'), 'ellipse')
  doc.objects.shift()
  const next = appendObject(doc, 'text')
  assert.equal(new Set(next.objects.map(o => o.id)).size, 2)
})
