import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { Hono } from 'hono'
import { exportWebsiteTemplate } from '@runly/studio-interchange/website-write'
import { createWebsiteTemplatePreparationService } from '../website-template-preparation-service.js'
import { createWebsiteAccess } from '../website-authorization-service.js'
import { isWebsiteAudiovisual } from '../files-service.js'
import { audiovisualSignatureMatches } from '../website-image-signature.js'
import { sendBytes } from '../../routes/website/public-release-routes.js'

const require = createRequire(new URL('../../../../../packages/studio-interchange/package.json', import.meta.url))
const sharp = require('sharp')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const companyId = '00000000-0000-4000-8000-000000000001', siteId = '00000000-0000-4000-8000-000000000002', actorId = '00000000-0000-4000-8000-000000000004'
const ids = { video: '00000000-0000-4000-8000-0000000000a1', poster: '00000000-0000-4000-8000-0000000000a2', audio: '00000000-0000-4000-8000-0000000000a3' }
const mp4 = () => { const b = Buffer.alloc(4096); b.writeUInt32BE(24, 0); b.write('ftypisom', 4); return b }
const mp3 = () => Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), Buffer.alloc(2048)])
// Catalog of Atlas >= 0.11 (VideoBlock.file, AudioBlock), built from the shipped 0.3.5 snapshot.
function avCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('../../routes/website/builder-catalogs/0.3.5.json', import.meta.url), 'utf8'))
  const video = catalog.blocks.find((b) => b.type === 'VideoBlock'); video.fields.file = { type: 'video', label: 'Archivo' }; video.defaultProps.file = ''
  catalog.blocks.push({ type: 'AudioBlock', label: 'Audio', category: 'media', group: 'base', slots: [], defaultProps: { file: '', title: '' }, fields: { file: { type: 'audio', label: 'Archivo' }, title: { type: 'text', label: 'Título' } } })
  return catalog
}

test('a v3 template installs video, poster and audio as site files and fills an empty poster', async () => {
  const catalog = avCatalog(), video = mp4(), audio = mp3(), poster = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#123' } }).webp().toBuffer()
  const { bytes } = await exportWebsiteTemplate({ title: 'Medios', catalog, pages: [{ path: '/', title: 'Inicio', isHome: true, sections: [{ type: 'VideoBlock', props: { file: `asset:${sha(video)}` } }, { type: 'AudioBlock', props: { file: `asset:${sha(audio)}`, title: 'Tema' } }] }],
    assets: [{ data: video, mime: 'video/mp4', license: 'o', durationMs: 2000, width: 320, height: 180, poster: { data: poster } }, { data: audio, mime: 'audio/mpeg', license: 'o', durationMs: 1000 }], licenses: [{ id: 'o', redistribution: 'allowed', notice: 'x' }] })
  const files = {
    [ids.video]: { data: video, mimeType: 'video/mp4' }, [ids.poster]: { data: poster, mimeType: 'image/webp' }, [ids.audio]: { data: audio, mimeType: 'audio/mpeg' },
  }
  const row = (id) => files[id] && { id, entityId: siteId, moduleKey: 'runly.website', mimeType: files[id].mimeType, sizeBytes: files[id].data.length, checksum: sha(files[id].data), contentRevision: 1, objectKey: id, enabled: true }
  const prisma = { websiteSite: { findFirst: async () => ({ id: siteId, draftRevision: 3 }) }, fileAsset: { findFirst: async ({ where }) => row(where.id) } }
  const service = createWebsiteTemplatePreparationService({ prisma, files: { assertAccess: async () => {} }, readFile: async (file) => files[file.id].data, builderCatalogs: { '0.3.5': catalog } })
  const access = createWebsiteAccess({ companyId, actorId, can: (p) => p === 'website.pages.create' })
  const pending = await service.prepare({ bytes, companyId, siteId, access })
  assert.deepEqual(pending.missingAssets.sort(), [sha(video), sha(poster), sha(audio)].sort(), 'the poster is a bound file too')
  const bound = await service.prepare({ bytes, companyId, siteId, access, bindings: { [sha(video)]: ids.video, [sha(poster)]: ids.poster, [sha(audio)]: ids.audio } })
  assert.equal(bound.readyForDraft, true)
  const blocks = Object.values(bound.pages[0].document.blocks)
  const videoBlock = blocks.find((b) => b.type === 'VideoBlock'), audioBlock = blocks.find((b) => b.type === 'AudioBlock')
  assert.deepEqual([videoBlock.props.file, videoBlock.props.poster, audioBlock.props.file], [`file:${ids.video}`, `file:${ids.poster}`, `file:${ids.audio}`])
})

test('Files opens audio/video only to Website, and publication checks the container signature', () => {
  assert.equal(isWebsiteAudiovisual('video/mp4', 'runly.website'), true)
  assert.equal(isWebsiteAudiovisual('video/mp4', 'runly.files'), false)
  assert.equal(isWebsiteAudiovisual('application/pdf', 'runly.website'), false)
  assert.equal(audiovisualSignatureMatches('video/mp4', mp4()), true)
  assert.equal(audiovisualSignatureMatches('audio/mpeg', mp4()), false)
})

test('public assets answer single byte ranges for media seeking', async () => {
  const app = new Hono(), body = Buffer.from('0123456789')
  app.get('/', (c) => sendBytes(c, body, 'video/mp4'))
  const get = (range) => app.request('/', { headers: range ? { range } : {} })
  const full = await get(); assert.equal(full.status, 200); assert.equal(full.headers.get('accept-ranges'), 'bytes')
  const part = await get('bytes=2-4'); assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), 'bytes 2-4/10'); assert.equal(await part.text(), '234')
  assert.equal(await (await get('bytes=-3')).text(), '789')
  assert.equal((await get('bytes=10-')).status, 416)
  assert.equal((await get('bytes=0-1,3-4')).status, 416)
})
