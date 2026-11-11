import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { blankDocument, appendObject } from '../../../../../shared/studio/document.js'
import { exportNativePackage } from './package.js'
import { buildPreview } from './marketplace-preview.js'

const fileId = '00000000-0000-4000-8000-000000000001'

test('a package without a shipped PNG previews as the declarative page with its image as a data: URI', async () => {
  const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer()
  const document = appendObject(blankDocument(320, 240), 'image', { fileAssetId: fileId })
  const bytes = await exportNativePackage({ document, title: 'Con imagen', readAsset: async () => ({ bytes: image, mime: 'image/png' }) })
  const preview = await buildPreview(bytes)
  assert.equal(preview.png, null)
  assert.ok(preview.document?.page)
  assert.match(Object.values(preview.images)[0], /^data:image\/png;base64,/)
})

test('unreadable bytes give an empty preview instead of an error', async () => {
  assert.deepEqual(await buildPreview(Buffer.from('not a zip')), { png: null, document: null, images: {} })
})
