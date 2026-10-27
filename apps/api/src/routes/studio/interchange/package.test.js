import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import JSZip from 'jszip'
import { blankDocument, appendObject } from '../../../../../shared/studio/document.js'
import { exportNativePackage, inspectNativePackage, mapReferences, renameContent, hash } from './package.js'
import { readPackageZip, writePackageZip, PACKAGE_MIME } from './zip.js'
import { importSvgPage } from './svg.js'

const fileId = '00000000-0000-4000-8000-000000000001'
async function fixture() {
  const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer()
  let document = appendObject(blankDocument(320, 240), 'image', { fileAssetId: fileId, groupId: 'group' })
  document = appendObject(document, 'text', { text: 'Multilínea\neditable', height: 175, fontFamily: 'Lato', fontVariant: 'bold', groupId: 'group' })
  document.additionalPages = [{ page: { id: 'p2', width: 240, height: 320, background: '#ffffff' }, objects: [] }]
  const bytes = await exportNativePackage({ document, title: 'Portátil', readAsset: async () => ({ bytes: image, mime: 'image/png' }), licenseFiles: { 'licenses/notice.txt': 'Declaración de licencia como datos.' } })
  return { bytes, document, image }
}
async function mutate(bytes, change) {
  const entries = await readPackageZip(bytes)
  await change(entries)
  return writePackageZip(entries)
}
test('portable native preserves editable v7, all pages and private bytes without origin FileAsset IDs', async () => {
  const { bytes, document, image } = await fixture(), before = JSON.stringify(document)
  const result = await inspectNativePackage(bytes)
  assert.equal(result.report.pages.length, 2); assert.ok(result.report.fonts.every(f => f.available)); assert.ok(result.report.requiresWarningAcceptance)
  assert.equal(JSON.stringify(result.manifest).includes(fileId), false)
  assert.equal(JSON.stringify(result.portable).includes(fileId), false)
  assert.deepEqual(result.files.get(result.manifest.resources[0].path), image)
  assert.equal(result.portable.objects[1].height, 175)
  const restored = mapReferences(result.portable, () => fileId)
  assert.deepEqual(restored, document)
  const renamed = renameContent(restored, 'new-installation')
  assert.notEqual(renamed.page.id, restored.page.id); assert.notEqual(renamed.objects[0].id, restored.objects[0].id)
  assert.equal(renamed.objects[0].groupId, renamed.objects[1].groupId)
  assert.equal(JSON.stringify(document), before)
})
test('future versions, missing assets, bad digest, unknown fields and missing fonts fail closed', async () => {
  const { bytes } = await fixture()
  for (const change of [
    entries => entries.delete([...entries.keys()].find(k => k.startsWith('assets/'))),
    entries => entries.set('document.json', Buffer.from('{}')),
    entries => { const m = JSON.parse(entries.get('manifest.json')); m.formatVersion = 2; entries.set('manifest.json', Buffer.from(JSON.stringify(m))) },
    entries => { const m = JSON.parse(entries.get('manifest.json')); m.companyId = fileId; entries.set('manifest.json', Buffer.from(JSON.stringify(m))) },
    entries => { const d = JSON.parse(entries.get('document.json')); d.objects[1].fontFamily = 'Commercial missing font'; const content = Buffer.from(JSON.stringify(d)); entries.set('document.json', content); const m = JSON.parse(entries.get('manifest.json')); m.document = { ...m.document, bytes: content.length, sha256: hash(content) }; entries.set('manifest.json', Buffer.from(JSON.stringify(m))) },
  ]) await assert.rejects(inspectNativePackage(await mutate(bytes, change)))
})
test('ZIP traversal, collisions, symlinks, special entries, bombs, encryption and corruption reject before use', async () => {
  for (const [name, content, settings] of [
    ['../escape', 'bad', {}], ['/absolute', 'bad', {}], ['C:/drive', 'bad', {}], ['assets/../../escape', 'bad', {}],
    ['link', 'target', { unixPermissions: 0o120777 }], ['device', '', { unixPermissions: 0o020600 }],
    ['bomb', 'x'.repeat(2_000_000), { compression: 'DEFLATE' }],
  ]) {
    const zip = new JSZip(); zip.file('mimetype', PACKAGE_MIME); zip.file(name, content, { ...settings, createFolders: false })
    await assert.rejects(readPackageZip(await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' })))
  }
  const zip = new JSZip(); zip.file('mimetype', PACKAGE_MIME); zip.file('case.txt', 'one'); zip.file('CASE.txt', 'two')
  await assert.rejects(readPackageZip(await zip.generateAsync({ type: 'nodebuffer' })))
  const { bytes } = await fixture()
  const corrupt = Buffer.from(bytes); corrupt[40] ^= 1; await assert.rejects(readPackageZip(corrupt))
  const encrypted = Buffer.from(bytes); encrypted[6] |= 1; await assert.rejects(readPackageZip(encrypted))
  await assert.rejects(readPackageZip(Buffer.concat([bytes, Buffer.from('suffix')])))
})
test('image content and dimensions are checked independently of declared MIME', async () => {
  await assert.rejects(exportNativePackage({ document: appendObject(blankDocument(), 'image', { fileAssetId: fileId }), title: 'Wrong image', readAsset: async () => ({ bytes: Buffer.from('<svg/>'), mime: 'image/png' }) }))
})
test('optional standard directories and structured missing-font report remain interoperable', async () => {
  const { bytes } = await fixture(), entries = await readPackageZip(bytes), zip = new JSZip()
  for (const [name, data] of entries) zip.file(name, data, { createFolders: false })
  for (const name of ['assets', 'previews', 'licenses']) zip.folder(name)
  assert.equal((await inspectNativePackage(await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }))).manifest.pageCount, 2)
  await assert.rejects(inspectNativePackage(await mutate(bytes, entries => {
    const m = JSON.parse(entries.get('manifest.json')); m.fonts[0].family = 'Unavailable family'; entries.set('manifest.json', Buffer.from(JSON.stringify(m)))
  })), error => error.details.fonts[0].available === false)
})
test('deduplication cannot bypass a second resource redistribution restriction', async () => {
  const { document, image } = await fixture(), other = '00000000-0000-4000-8000-000000000002'
  const d = appendObject(document, 'image', { fileAssetId: other })
  await assert.rejects(exportNativePackage({ document: d, title: 'Rights', readAsset: async id => ({ bytes: image, mime: 'image/png', license: { id: 'custom', redistribution: id === other ? 'forbidden' : 'allowed' } }) }), /derechos/)
})
test('SVG editable subset preserves paints, gradients, translation and flat groups', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs>
    <linearGradient id="paint"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
  </defs><g transform="translate(20,30)"><rect x="10" y="5" width="80" height="40" fill="url(#paint)"/><circle cx="150" cy="50" r="20" fill="#00ff00" stroke="#000000" stroke-width="2"/></g></svg>`
  const result = importSvgPage(Buffer.from(svg)), objects = result.document.objects
  assert.equal(objects.length, 3); assert.equal(objects[0].x, 30); assert.equal(objects[0].y, 35)
  assert.equal(objects[0].fillPaint.type, 'gradient'); assert.equal(objects[1].fill, '#00ff00')
  assert.equal(new Set(objects.map(o => o.groupId)).size, 1)
})
test('SVG active content and unsupported layout are never executed or silently dropped', () => {
  for (const body of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/image.png"/>', '<text>Unreliable layout</text>', '<rect width="20" height="20" onclick="alert(1)"/>', '<g transform="skewX(30)"><rect width="20" height="20"/></g>', '<style>rect{fill:red}</style>']) assert.throws(() => importSvgPage(Buffer.from(`<svg width="320" height="240">${body}</svg>`)))
  assert.throws(() => importSvgPage(Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg width="320" height="240"/>')))
})
