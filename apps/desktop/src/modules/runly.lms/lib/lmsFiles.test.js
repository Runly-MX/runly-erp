import test from 'node:test'
import assert from 'node:assert/strict'
import { guessMimeType, isOpenable, resourceInput, submissionFileInput, viewerItem } from './lmsFiles.js'

test('mime type falls back to the extension when missing or generic', () => {
  assert.equal(guessMimeType('guia.PDF', null), 'application/pdf')
  assert.equal(guessMimeType('clip.mp4', 'application/octet-stream'), 'video/mp4')
  assert.equal(guessMimeType('foto.png', 'image/webp'), 'image/webp')
  assert.equal(guessMimeType('raro.xyz', ''), '')
})

test('viewer items carry name, thumbnail for images and the Office id', () => {
  const image = viewerItem(submissionFileInput({ id: 'f1', name: 'foto.jpg', mimeType: 'image/jpeg', sizeBytes: 10, url: 'https://x/f1' }))
  assert.equal(image.id, 'f1')
  assert.equal(image.thumbnailUrl, 'https://x/f1')
  assert.equal(image.officeFileId, 'f1')
  const resource = viewerItem(resourceInput({ id: 'r1', title: 'Guía', fileName: 'guia.docx', url: 'https://x/r1' }))
  assert.equal(resource.originalName, 'guia.docx')
  assert.equal(resource.thumbnailUrl, null)
  assert.equal(resource.officeFileId, null)
  assert.equal(viewerItem({ key: 'k', name: '  ' }).originalName, 'Archivo')
  assert.equal(viewerItem({ name: 'sin-clave.pdf' }), null)
})

test('only items with a URL or a resolver can be opened', () => {
  assert.equal(isOpenable({ key: 'a', url: 'https://x' }), true)
  assert.equal(isOpenable({ key: 'a', resolveUrl: async () => 'u' }), true)
  assert.equal(isOpenable({ key: 'a' }), false)
  assert.equal(isOpenable({ url: 'https://x' }), false)
})
