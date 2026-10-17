import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPackageManifest, createLmsHls, manifestDurationSeconds, manifestSegmentNames, signHlsManifest, validateHlsPresign } from '../lms-hls.js'
import { LmsError } from '../lms-core.js'

const MB = 1024 * 1024
const seg = (i, sizeBytes = 4 * MB) => ({ name: `seg_${String(i).padStart(5, '0')}.ts`, sizeBytes })
const MANIFEST = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:6.006,\nseg_00000.ts\n#EXTINF:4.5,\nseg_00001.ts\n#EXT-X-ENDLIST\n'

test('validateHlsPresign accepts a valid package and sums sizes', () => {
  const pkg = validateHlsPresign({ fileName: 'clase.mp4', sourceBytes: 9 * MB, durationSeconds: 10.4, manifestBytes: 200, segments: [seg(0), seg(1)] })
  assert.equal(pkg.totalBytes, 8 * MB)
  assert.equal(pkg.durationSeconds, 10)
  assert.deepEqual(pkg.segments.map((s) => s.name), ['seg_00000.ts', 'seg_00001.ts'])
})

test('validateHlsPresign rejects bad names, duplicates, big segments, totals and counts', () => {
  const base = { fileName: 'v.mp4', manifestBytes: 100 }
  const status = (body) => { try { validateHlsPresign({ ...base, ...body }); return 'ok' } catch (e) { assert.ok(e instanceof LmsError); return e.status } }
  assert.equal(status({ segments: [{ name: '../x.ts', sizeBytes: 10 }] }), 400)
  assert.equal(status({ segments: [{ name: 'seg_1.ts', sizeBytes: 10 }] }), 400)
  assert.equal(status({ segments: [seg(0), seg(0)] }), 400)
  assert.equal(status({ segments: [seg(0, 51 * MB)] }), 413)
  assert.equal(status({ segments: Array.from({ length: 45 }, (_, i) => seg(i, 49 * MB)) }), 413)
  assert.equal(status({ segments: Array.from({ length: 2001 }, (_, i) => seg(i, 10)) }), 413)
  assert.equal(status({ segments: [] }), 400)
  assert.equal(status({ segments: [seg(0)], manifestBytes: 0 }), 400)
  assert.equal(status({ segments: [seg(0)], fileName: '' }), 400)
})

test('manifest helpers read names and duration; check rejects unknown segments', () => {
  assert.deepEqual(manifestSegmentNames(MANIFEST), ['seg_00000.ts', 'seg_00001.ts'])
  assert.equal(manifestDurationSeconds(MANIFEST), 11)
  assert.deepEqual(checkPackageManifest(MANIFEST, ['seg_00000.ts', 'seg_00001.ts', 'seg_00002.ts']), ['seg_00000.ts', 'seg_00001.ts'])
  assert.throws(() => checkPackageManifest(MANIFEST, ['seg_00000.ts']), /no coincide/)
  assert.throws(() => checkPackageManifest('hola', ['seg_00000.ts']), /inválido/)
  assert.throws(() => checkPackageManifest('#EXTM3U\n#EXT-X-ENDLIST\n', []), /no tiene segmentos/)
})

test('signHlsManifest rewrites each segment line to its signed URL', async () => {
  const calls = []
  const supabaseAdmin = { storage: { from: (bucket) => ({ createSignedUrls: async (paths, ttl) => { calls.push({ bucket, paths, ttl }); return { data: paths.map((path) => ({ path, signedUrl: `https://s/${path}?t=1` })) } } }) } }
  const out = await signHlsManifest({ supabaseAdmin, bucket: 'b', dir: 'd/p', manifestText: MANIFEST })
  assert.deepEqual(calls[0], { bucket: 'b', paths: ['d/p/seg_00000.ts', 'd/p/seg_00001.ts'], ttl: 3 * 3600 })
  assert.ok(out.includes('\nhttps://s/d/p/seg_00000.ts?t=1\n'))
  assert.ok(out.includes('#EXTINF:6.006,'))
  assert.ok(!/^seg_/m.test(out))
})

test('presign creates one pending asset with signed URLs per segment', async () => {
  let created = null
  const prisma = { fileAsset: { create: async ({ data }) => { created = data; return { id: 'f1' } } } }
  const supabaseAdmin = { storage: { from: () => ({ createSignedUploadUrl: async (key) => ({ data: { signedUrl: `up:${key}` } }) }) } }
  const hls = createLmsHls({ prisma, supabaseAdmin, bucket: 'runly-files' })
  const res = await hls.presign('c1', 'p1', { fileName: 'v.mp4', manifestBytes: 120, durationSeconds: 11, segments: [seg(0), seg(1)] })
  assert.equal(res.fileId, 'f1')
  assert.match(created.objectKey, /^modules\/runly-lms\/lmslesson\/c1\/[\w-]+\/index\.m3u8$/)
  assert.equal(res.manifestUploadUrl, `up:${created.objectKey}`)
  assert.deepEqual(res.segmentUploadUrls.map((s) => s.name), ['seg_00000.ts', 'seg_00001.ts'])
  assert.equal(created.mimeType, 'application/vnd.apple.mpegurl')
  assert.equal(created.metadata.pending, true)
  assert.deepEqual(created.metadata.hls.segments, ['seg_00000.ts', 'seg_00001.ts'])
})

test('confirmPackage requires every listed segment to be uploaded', async () => {
  let updated = null
  const asset = { id: 'f1', bucket: 'b', objectKey: 'd/index.m3u8', originalName: 'v.mp4', metadata: { companyId: 'c1', pending: true, hls: { dir: 'd', segments: ['seg_00000.ts', 'seg_00001.ts'], durationSeconds: 10 } } }
  const storage = (listed) => ({ storage: { from: () => ({ download: async () => ({ data: { text: async () => MANIFEST } }), list: async () => ({ data: listed.map((name) => ({ name })) }) }) } })
  const prisma = { fileAsset: { update: async ({ data }) => { updated = data } } }
  await assert.rejects(createLmsHls({ prisma, supabaseAdmin: storage(['seg_00000.ts']), bucket: 'b' }).confirmPackage(asset), /terminó de subirse/)
  const ok = await createLmsHls({ prisma, supabaseAdmin: storage(['seg_00000.ts', 'seg_00001.ts', 'index.m3u8']), bucket: 'b' }).confirmPackage(asset)
  assert.deepEqual(ok, { fileId: 'f1', fileName: 'v.mp4', durationSeconds: 11 })
  assert.equal(updated.metadata.pending, undefined)
  assert.equal(updated.metadata.hls.durationSeconds, 11)
})
