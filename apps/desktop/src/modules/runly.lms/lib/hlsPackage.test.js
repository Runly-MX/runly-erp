import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PACKAGE_TOO_BIG, UNSUPPORTED_CODEC, assertRemuxable, chooseUploadPath, createByteProgress, manifestDurationSeconds,
  manifestSegmentNames, parseProbeLog, remuxArgs, remuxProgress, runPool, uploadHlsPackage,
} from './hlsPackage.js'

const MB = 1024 * 1024
const PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/input/clase.mp4':
  Duration: 01:02:03.50, start: 0.000000, bitrate: 5000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, 30 fps
  Stream #0:1[0x2](und): Audio: opus (Opus / 0x7375704F), 48000 Hz, stereo
  Stream #0:2: Video: mjpeg (Baseline), yuvj420p, 300x300 (attached pic)
At least one output file must be specified`

test('chooseUploadPath: direct up to 50 MB, package up to 2 GB', () => {
  assert.equal(chooseUploadPath(50 * MB), 'direct')
  assert.equal(chooseUploadPath(50 * MB + 1), 'package')
  assert.equal(chooseUploadPath(2048 * MB), 'package')
  assert.throws(() => chooseUploadPath(2048 * MB + 1), { message: PACKAGE_TOO_BIG })
  assert.throws(() => chooseUploadPath(0))
})

test('parseProbeLog reads codecs and duration; only H.264/HEVC pass', () => {
  const probe = parseProbeLog(PROBE)
  assert.deepEqual(probe, { video: 'h264', audio: 'opus', durationSeconds: 3724 })
  assert.doesNotThrow(() => assertRemuxable(probe))
  assert.doesNotThrow(() => assertRemuxable({ video: 'hevc' }))
  assert.throws(() => assertRemuxable(parseProbeLog(PROBE.replace('h264 (High)', 'vp9 (Profile 0)'))), { message: UNSUPPORTED_CODEC })
  assert.throws(() => assertRemuxable(parseProbeLog('garbage')), { message: UNSUPPORTED_CODEC })
})

test('remuxArgs copies video, copies AAC audio and re-encodes others', () => {
  const aac = remuxArgs('/input/a.mp4', { audio: 'aac' })
  assert.deepEqual(aac.slice(-11), ['-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_list_size', '0', '-hls_segment_filename', 'seg_%05d.ts', 'index.m3u8'])
  assert.ok(aac.join(' ').includes('-c:v copy -c:a copy'))
  assert.ok(remuxArgs('x', { audio: 'opus' }).join(' ').includes('-c:a aac -b:a 128k'))
  assert.ok(!remuxArgs('x', {}).includes('-c:a'))
})

test('remuxProgress uses time over duration, falls back to progress, clamps', () => {
  assert.equal(remuxProgress({ time: 30e6 }, 60), 0.5)
  assert.equal(remuxProgress({ progress: 0.25 }, null), 0.25)
  assert.equal(remuxProgress({ time: 90e6 }, 60), 1)
  assert.equal(remuxProgress({ progress: -3 }), 0)
  assert.equal(remuxProgress({}), 0)
})

test('manifest helpers and byte progress', () => {
  const m = '#EXTM3U\n#EXTINF:6.0,\nseg_00000.ts\n#EXTINF:2.4,\nseg_00001.ts\n#EXT-X-ENDLIST\n'
  assert.deepEqual(manifestSegmentNames(m), ['seg_00000.ts', 'seg_00001.ts'])
  assert.equal(manifestDurationSeconds(m), 8)
  const seen = []
  const p = createByteProgress(200, (v) => seen.push(v))
  p.add(50); p.add(150); p.add(10)
  assert.deepEqual(seen, [0.25, 1, 1])
})

test('runPool keeps at most `limit` workers and preserves order', async () => {
  let active = 0, peak = 0
  const out = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    active += 1; peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active -= 1
    return n * 2
  })
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14])
  assert.equal(peak, 3)
  await assert.rejects(runPool([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('x') }), /x/)
})

test('uploadHlsPackage presigns, uploads segments then manifest, confirms', async () => {
  const pkg = {
    manifestText: '#EXTM3U\nseg_00000.ts\nseg_00001.ts\n',
    segments: [{ name: 'seg_00000.ts', blob: new Blob(['aaaa']) }, { name: 'seg_00001.ts', blob: new Blob(['bb']) }],
    durationSeconds: 12,
  }
  let presignBody = null
  const puts = []
  const stages = []
  const progress = []
  const result = await uploadHlsPackage(pkg, {
    fileName: 'v.mp4',
    sourceBytes: 60 * MB,
    presign: async (data) => { presignBody = data; return { data: { fileId: 'f1', manifestUploadUrl: 'm', segmentUploadUrls: [{ name: 'seg_00000.ts', uploadUrl: 's0' }, { name: 'seg_00001.ts', uploadUrl: 's1' }] } } },
    confirm: async (id) => ({ data: { fileId: id, fileName: 'v.mp4', durationSeconds: 12 } }),
    onStage: (s) => stages.push(s),
    onProgress: (v) => progress.push(v),
    fetchImpl: async (url, init) => { puts.push([url, init.headers['Content-Type']]); return { ok: true, status: 200 } },
  })
  assert.deepEqual(presignBody.segments, [{ name: 'seg_00000.ts', sizeBytes: 4 }, { name: 'seg_00001.ts', sizeBytes: 2 }])
  assert.equal(presignBody.manifestBytes, pkg.manifestText.length)
  assert.deepEqual(puts.at(-1), ['m', 'application/vnd.apple.mpegurl'])
  assert.deepEqual(puts.slice(0, 2).map((p) => p[0]).sort(), ['s0', 's1'])
  assert.deepEqual(stages, ['uploading', 'confirming'])
  assert.equal(progress.at(-1), 1)
  assert.deepEqual(result, { fileId: 'f1', fileName: 'v.mp4', durationSeconds: 12 })
})
