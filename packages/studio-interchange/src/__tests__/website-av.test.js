import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { inspectWebsiteTemplate, WEBSITE_AV_POLICY, WEBSITE_MEDIA_POLICY, WEBSITE_TEMPLATE } from '../website-template.js'
import { exportWebsiteTemplate } from '../website-write.js'
import { blockCatalog, section } from './corpus.js'
import { readZip } from '../zip-reader.js'
import { writePackageZip } from '../write.js'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const mp4 = (seed) => { const b = Buffer.alloc(4096); b.writeUInt32BE(24, 0); b.write('ftypisom', 4); b.write(seed, 64); return b }
const wav = () => { const b = Buffer.alloc(2048); b.write('RIFF', 0); b.write('WAVEfmt ', 8); return b }
// Catalog of Atlas >= 0.11: VideoBlock gains `file` (video), AudioBlock is new.
function avCatalog() {
  const catalog = blockCatalog(), video = catalog.blocks.find((b) => b.type === 'VideoBlock')
  video.fields.file = { type: 'video', label: 'Archivo de video' }; video.defaultProps.file = ''
  catalog.blocks.push({ type: 'AudioBlock', label: 'Audio', category: 'media', group: 'base', slots: [], defaultProps: { file: '', title: '', caption: '', loop: false }, fields: { file: { type: 'audio', label: 'Archivo de audio' }, title: { type: 'text', label: 'Título' }, caption: { type: 'text', label: 'Pie' }, loop: { type: 'toggle', label: 'Repetir' } } })
  return catalog
}
const poster = () => sharp({ create: { width: 64, height: 36, channels: 3, background: '#203040' } }).webp().toBuffer()
const options = (catalog) => ({ builderCatalogs: { '0.3.5': catalog } })
async function avTemplate({ video = mp4('a'), audio = wav(), blocks, catalog = avCatalog() } = {}) {
  const children = blocks ?? [section('VideoBlock', { file: `asset:${sha(video)}` }), section('AudioBlock', { file: `asset:${sha(audio)}`, title: 'Tema' })]
  return { catalog, ...(await exportWebsiteTemplate({ title: 'Medios', catalog, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('SectionBlock', {}, { children })] }],
    assets: [{ data: video, mime: 'video/mp4', license: 'original', durationMs: 2000, width: 320, height: 180, poster: { data: await poster() } }, { data: audio, mime: 'audio/wav', license: 'original', durationMs: 1500 }],
    licenses: [{ id: 'original', redistribution: 'allowed', notice: 'Sintética.' }] })) }
}
async function edit(bytes, change) {
  const entries = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  const manifest = JSON.parse(entries.get('manifest.json'))
  await change(manifest, entries)
  manifest.document.files = [...entries].filter(([name]) => !['mimetype', 'manifest.json'].includes(name)).map(([path, data]) => ({ path, bytes: data.length, sha256: sha(data) }))
  entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
  return writePackageZip([...entries], { limit: 200 * 1024 * 1024 })
}
const codes = (result) => result.errors.map((e) => e.code)

test('v3: video with poster and audio round-trip; content carries bytes and poster', async () => {
  const { bytes, catalog, validation } = await avTemplate()
  assert.equal(validation.report.assetPolicy, WEBSITE_AV_POLICY.name)
  const result = await inspectWebsiteTemplate(bytes, options(catalog))
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  const [video, audio] = result.content.assets
  assert.deepEqual([video.kind, video.width, video.poster.width, audio.kind, audio.width], ['video', 320, 64, 'audio', undefined])
  assert.ok(video.posterData.length > 0 && video.data.equals(mp4('a')))
  assert.deepEqual(result.report.assets.map((a) => a.kind), ['video', 'audio'])
})

test('v3: templates without audio/video keep v1/v2 policies', async () => {
  const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer()
  const raster = await exportWebsiteTemplate({ title: 'R', catalog: avCatalog(), pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('ImageBlock', { src: `asset:${sha(data)}`, alt: 'x' })] }], assets: [{ data, mime: 'image/png', license: 'o' }], licenses: [{ id: 'o', redistribution: 'allowed', notice: 'x' }] })
  assert.notEqual(raster.validation.report.assetPolicy, WEBSITE_AV_POLICY.name)
  assert.notEqual(raster.validation.report.assetPolicy, WEBSITE_MEDIA_POLICY.name)
})

test('v3: VideoBlock never carries third-party URLs and older catalogs keep excluding it', async () => {
  const { bytes, catalog } = await avTemplate()
  const linked = await edit(bytes, (m, entries) => { const page = JSON.parse(entries.get('pages/page-1.json')); page[0].children.children[0].props.src = 'https://youtu.be/x'; entries.set('pages/page-1.json', Buffer.from(JSON.stringify(page))) })
  assert.ok(codes(await inspectWebsiteTemplate(linked, options(catalog))).includes('prop_invalid'))
  // Atlas < 0.11 has no `file` field: VideoBlock stays excluded exactly as before.
  const old = blockCatalog()
  await assert.rejects(exportWebsiteTemplate({ title: 'Viejo', catalog: old, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [section('VideoBlock', { caption: 'x' })] }] }), { reason: 'block_unknown' })
})

test('v3: a field only takes its own media kind', async () => {
  const video = mp4('k'), audio = wav()
  await assert.rejects(avTemplate({ video, audio, blocks: [section('VideoBlock', { file: `asset:${sha(audio)}` }), section('AudioBlock', { file: `asset:${sha(video)}` })] }), { reason: 'prop_invalid' })
})

test('v3: policy, signature, poster and limits are enforced', async () => {
  const { bytes, catalog } = await avTemplate()
  const read = (b) => inspectWebsiteTemplate(b, options(catalog))
  assert.deepEqual(codes(await read(await edit(bytes, (m) => { m.assetPolicy = WEBSITE_MEDIA_POLICY.name }))), ['manifest_invalid'])
  const forged = await edit(bytes, (m, entries) => { const a = m.assets[0], fake = Buffer.from('<svg/>'.padEnd(64)); entries.set(a.path, fake); a.bytes = fake.length; a.sha256 = sha(fake); a.id = `asset-${a.sha256}`; const p = a.path; entries.delete(p); a.path = `assets/${a.sha256}.mp4`; entries.set(a.path, fake) })
  assert.ok(['av_asset_invalid', 'checksum_mismatch', 'asset_missing'].includes(codes(await read(forged))[0]))
  const noPoster = await edit(bytes, (m, entries) => { entries.delete(m.assets[0].poster.path); delete m.assets[0].poster })
  assert.deepEqual(codes(await read(noPoster)), ['av_poster_invalid'])
  const audioPicture = await edit(bytes, (m) => { m.assets[1].width = 10; m.assets[1].height = 10 })
  assert.deepEqual(codes(await read(audioPicture)), ['av_asset_invalid'])
  const five = await edit(bytes, (m, entries) => { for (let i = 0; i < 4; i++) { const data = mp4(`extra-${i}`), s = sha(data); entries.set(`assets/${s}.mp4`, data); m.assets.push({ id: `asset-${s}`, path: `assets/${s}.mp4`, mime: 'audio/mp4', kind: 'audio', durationMs: 1000, bytes: data.length, sha256: s, license: 'original' }) } })
  assert.deepEqual(codes(await read(five)), ['av_limit'])
})

test('v3: a v2-only reader refuses v3 instead of dropping media', async () => {
  const { bytes, catalog } = await avTemplate()
  const downgraded = await edit(bytes, (m) => { m.assetPolicy = 'packaged-media-v4' })
  assert.deepEqual(codes(await inspectWebsiteTemplate(downgraded, options(catalog))), ['format_unsupported'])
})
