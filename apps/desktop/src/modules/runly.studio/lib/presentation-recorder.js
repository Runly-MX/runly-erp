// Grabar presentación. A compositor draws the player's current layers into a canvas of its
// own (same layer state and slide clock as the screen, same drawing as the video export)
// and MediaRecorder encodes canvas.captureStream() plus an optional microphone track. The
// screen, the controls and anything outside the slides are never captured, and nothing is
// uploaded: the result is a local Blob.
//
// Lessons kept from the chat voice notes (MessageComposer): MP4 first, then WebM; no
// timeslice (iOS Safari emits broken fragments when chunked); requestData() right before
// stop() and a watchdog in case `onstop` never fires.
import { drawLayer, layerOrder } from './stage-layers.js'
import { letterbox } from './motion-export-plan.js'

const VIDEO_TYPES = {
  audio: [['mp4', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2'], ['mp4', 'video/mp4'], ['webm', 'video/webm;codecs=vp9,opus'], ['webm', 'video/webm;codecs=vp8,opus'], ['webm', 'video/webm']],
  silent: [['mp4', 'video/mp4;codecs=avc1.42E01E'], ['mp4', 'video/mp4'], ['webm', 'video/webm;codecs=vp9'], ['webm', 'video/webm;codecs=vp8'], ['webm', 'video/webm']],
}
const STOP_GRACE = 3000
const even = value => Math.max(2, Math.round(value / 2) * 2)

// First container/codec the browser itself confirms (never assumed).
export function pickRecordingType(audio, Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return null
  const found = VIDEO_TYPES[audio ? 'audio' : 'silent'].find(([, mime]) => { try { return Recorder.isTypeSupported(mime) } catch { return false } })
  return found ? { extension: found[0], mimeType: found[1] } : null
}

export function recordingSupport(env = globalThis) {
  if (!env.MediaRecorder || typeof env.HTMLCanvasElement?.prototype?.captureStream !== 'function') return { supported: false, reason: 'Este navegador no permite grabar la presentación.' }
  const type = pickRecordingType(false, env.MediaRecorder)
  if (!type) return { supported: false, reason: 'Este navegador no puede codificar video MP4 ni WebM.' }
  return { supported: true, canPause: typeof env.MediaRecorder.prototype?.pause === 'function', microphone: typeof env.navigator?.mediaDevices?.getUserMedia === 'function', type }
}

// Output size: the first slide's proportions inside 1920 × 1080 (or 1080 × 1920), even sides.
export function recordingSize(page, max = 1920) {
  const scale = Math.min(1, max / Math.max(page.width, page.height), (max * 9 / 16) / Math.min(page.width, page.height))
  return { width: even(page.width * scale), height: even(page.height * scale) }
}

export async function requestMicrophone() {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
}

// Draws one frame of the player: black stage, then the two layers back to front.
// sourceOf(layer) returns a drawable (canvas or loaded image) or null.
export function drawStage(ctx, { width, height, layers, pages, sourceOf }) {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  for (const role of layerOrder(layers.front)) {
    const layer = layers[role], scene = layer ? pages[layer.index] : null, source = scene ? sourceOf(layer) : null
    if (source) drawLayer(ctx, source, letterbox(scene.page, width, height), layer)
  }
}

// One recording session. draw(ctx) paints the current frame; called on every animation frame.
export function createPresentationRecorder({ width, height, fps = 30, draw, microphone = null, type }) {
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  const stream = canvas.captureStream(fps)
  for (const track of microphone?.getAudioTracks() ?? []) stream.addTrack(track)
  const recorder = new MediaRecorder(stream, { mimeType: type.mimeType, videoBitsPerSecond: Math.round(Math.min(12e6, Math.max(2e6, width * height * fps * 0.1))), ...(microphone ? { audioBitsPerSecond: 128_000 } : {}) })
  const chunks = []
  let frame = 0, startedAt = 0, pausedAt = 0, pausedTotal = 0, released = false
  recorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data) }
  const paint = () => { draw(ctx); frame = requestAnimationFrame(paint) }
  function release() {
    if (released) return
    released = true
    cancelAnimationFrame(frame)
    for (const track of stream.getTracks()) track.stop()
    for (const track of microphone?.getTracks() ?? []) track.stop()
    canvas.width = canvas.height = 0
  }
  return {
    get state() { return recorder.state },
    // Wall-clock length without pauses (WebM from MediaRecorder carries no duration).
    elapsed(now = performance.now()) { return startedAt ? Math.max(0, (recorder.state === 'paused' ? pausedAt : now) - startedAt - pausedTotal) : 0 },
    start() { draw(ctx); paint(); startedAt = performance.now(); recorder.start() },
    pause() { if (recorder.state !== 'recording') return; draw(ctx); recorder.pause(); pausedAt = performance.now(); cancelAnimationFrame(frame) },
    resume() { if (recorder.state !== 'paused') return; pausedTotal += performance.now() - pausedAt; paint(); recorder.resume() },
    // Resolves with the complete file; the last frames are flushed before stopping.
    stop() {
      return new Promise((resolve, reject) => {
        const duration = this.elapsed()
        if (recorder.state === 'inactive') { release(); reject(Error('La grabación ya terminó.')); return }
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(watchdog)
          release()
          const blob = new Blob(chunks, { type: type.mimeType.split(';')[0] })
          if (!blob.size) reject(Error('La grabación quedó vacía. Inténtalo de nuevo.'))
          else resolve({ blob, duration, ...type })
        }
        recorder.onstop = finish
        const watchdog = setTimeout(finish, STOP_GRACE)
        draw(ctx)
        try { if (recorder.state === 'recording') recorder.requestData() } catch { /* not supported */ }
        recorder.stop()
      })
    },
    cancel() { recorder.ondataavailable = null; recorder.onstop = null; try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* already stopped */ } release() },
  }
}
