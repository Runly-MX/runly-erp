import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawStage, pickRecordingType, recordingSize, recordingSupport } from './presentation-recorder.js'

test('recording type: only what the browser confirms, MP4 first, audio-aware', () => {
  const recorder = supported => ({ isTypeSupported: mime => supported.includes(mime) })
  assert.deepEqual(pickRecordingType(true, recorder(['video/webm;codecs=vp8,opus', 'video/mp4'])), { extension: 'mp4', mimeType: 'video/mp4' })
  assert.deepEqual(pickRecordingType(false, recorder(['video/webm;codecs=vp9'])), { extension: 'webm', mimeType: 'video/webm;codecs=vp9' })
  assert.equal(pickRecordingType(true, recorder([])), null)
  assert.equal(recordingSupport({}).supported, false, 'no MediaRecorder: honest refusal')
})

test('recording size keeps the slide proportions inside 1080p, even sides', () => {
  assert.deepEqual(recordingSize({ width: 1920, height: 1080 }), { width: 1920, height: 1080 })
  assert.deepEqual(recordingSize({ width: 4000, height: 3000 }), { width: 1440, height: 1080 })
  assert.deepEqual(recordingSize({ width: 1080, height: 1920 }), { width: 1080, height: 1920 })
  assert.deepEqual(recordingSize({ width: 801, height: 601 }), { width: 802, height: 602 })
})

test('stage drawing: black background, layers back to front, letterboxed per slide', () => {
  const calls = [], ctx = { save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, rect() {}, clip() {}, fillRect: () => calls.push('fill'), drawImage: source => calls.push(source) }
  const pages = [{ page: { width: 100, height: 100 } }, { page: { width: 200, height: 100 } }]
  const layers = { outgoing: { index: 0, kind: 'canvas', opacity: 1, dx: 0, dy: 0, scale: 1 }, incoming: { index: 1, kind: 'canvas', opacity: 1, dx: 0, dy: 0, scale: 1 }, front: 'outgoing' }
  drawStage(ctx, { width: 200, height: 100, layers, pages, sourceOf: layer => `slide-${layer.index}` })
  assert.deepEqual(calls, ['fill', 'slide-1', 'slide-0'], 'uncover-like order: outgoing on top')
})
