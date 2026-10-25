import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createScopedClipboard } from './scoped-clipboard.js'
import { blankDocument, appendObject } from '../../../../../shared/studio/document.js'

test('clipboard canonicalizes v2, bounds memory, expires and rejects other company/user scope', () => {
  let now = 1000
  const a = createScopedClipboard('company-a:user-a', () => now)
  const document = appendObject(blankDocument(), 'text', { text: 'Texto de prueba', signedUrl: 'never-retained' })
  a.write(document, document.objects)
  assert.equal(a.read()[0].text, 'Texto de prueba')
  assert.ok(!JSON.stringify(a.read()).includes('signedUrl'))
  assert.equal(createScopedClipboard('company-b:user-a').read().length, 0)
  assert.equal(a.read().length, 0)
  a.write(document, document.objects)
  assert.equal(createScopedClipboard('company-a:user-b').read().length, 0)
  a.write(document, document.objects); now += 600001
  assert.equal(a.read().length, 0)
  assert.throws(() => a.write({ ...document, schemaVersion: 999 }, document.objects))
  const large = { ...document, objects: Array.from({ length: 70 }, (_, n) => ({ ...document.objects[0], id: `object-${n}`, text: 'x'.repeat(10000) })) }
  assert.throws(() => a.write(large, large.objects), /límite/)
})
