// GIF / MP4 / WebM export. One frame loop for the three formats: every frame is
// sceneAt(document, page, t) drawn by the same read-only page renderer as Presentar
// (editor.createPlayer), composited with transitionAt like the player, at exactly
// k × 1000 / fps ms. Nothing is written to the design.
//
// Encoding (evaluated for this repository, no new dependency):
//   MP4/WebM  WebCodecs VideoEncoder (H.264 / VP9, VP8) frame by frame; only the
//             compressed chunks are kept, then ffmpeg.wasm (already shipped for LMS)
//             remuxes them with `-c copy` into MP4 or WebM.
//   fallback  browsers without the codec: JPEG frames → libx264 / libvpx in ffmpeg.wasm
//             (slower, frames held compressed in its virtual disk).
//   GIF       PNG frames → ffmpeg palettegen/paletteuse (256 colours per file).
import { loadFfmpeg } from '@runly/ui'
import { sceneAt, transitionAt } from '../../../../../shared/studio/motion.js'
import { documentPages, findPage, pageId } from '../../../../../shared/studio/pages.js'
import { abortable, checkAbort } from '../../../../../shared/studio/abort.js'
import { ensureStudioFont } from './studio-fonts.js'
import { frameTime, locate, planMotionExport } from './motion-export-plan.js'

const CODECS = { mp4: ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'], webm: ['vp09.00.10.08', 'vp8'] }
const REST = Object.freeze({ opacity: 1, dx: 0, dy: 0, scale: 1 })

// First encoder configuration the browser supports for this plan, or null (fallback).
export async function pickEncoder(plan) {
  if (plan.kind !== 'video' || typeof VideoEncoder === 'undefined') return null
  for (const codec of CODECS[plan.type]) {
    const config = { codec, width: plan.width, height: plan.height, bitrate: plan.bitrate, framerate: plan.fps, ...(codec.startsWith('avc') ? { avc: { format: 'annexb' } } : {}) }
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return config } catch { /* try the next codec */ }
  }
  return null
}

// One live page renderer at a time; the leaving page keeps its last frame for the transition.
function createPages(editor, document, signal) {
  let current = null, outgoing = null
  async function open(index, segment) {
    const canvas = window.document.createElement('canvas')
    const player = await editor.createPlayer(canvas, segment.pageId, document, signal)
    return { index, player, scene: findPage(document, segment.pageId) }
  }
  return {
    async show(index, plan) {
      if (current?.index === index) return current
      if (current) {
        const previous = plan.segments[current.index]
        current.player.renderFrame(sceneAt(document, previous.pageId, previous.duration))
        outgoing = { canvas: current.player.captureFrame(), box: previous.box }
        await current.player.destroy()
      }
      current = null
      current = await open(index, plan.segments[index])
      return current
    },
    get outgoing() { return outgoing },
    async destroy() {
      if (outgoing) outgoing.canvas.width = outgoing.canvas.height = 0
      await current?.player.destroy()
    },
  }
}

function draw(ctx, source, box, layer) {
  ctx.save()
  ctx.globalAlpha = layer.opacity
  // Same transform as the player's CSS: translate by a fraction of the slide, scale around its centre.
  ctx.translate(box.x + box.width / 2 + layer.dx * box.width, box.y + box.height / 2 + layer.dy * box.height)
  ctx.scale(layer.scale, layer.scale)
  ctx.drawImage(source, -box.width / 2, -box.height / 2, box.width, box.height)
  ctx.restore()
}

// IVF container for VP8/VP9 frames (what ffmpeg remuxes into WebM).
function ivf(chunks, plan, fourcc) {
  const header = new DataView(new ArrayBuffer(32))
  'DKIF'.split('').forEach((c, i) => header.setUint8(i, c.charCodeAt(0)))
  header.setUint16(6, 32, true); fourcc.split('').forEach((c, i) => header.setUint8(8 + i, c.charCodeAt(0)))
  header.setUint16(12, plan.width, true); header.setUint16(14, plan.height, true)
  header.setUint32(16, plan.fps, true); header.setUint32(20, 1, true); header.setUint32(24, chunks.length, true)
  const parts = [new Uint8Array(header.buffer)]
  chunks.forEach((chunk, index) => {
    const frame = new DataView(new ArrayBuffer(12))
    frame.setUint32(0, chunk.byteLength, true); frame.setUint32(4, index, true)
    parts.push(new Uint8Array(frame.buffer), chunk)
  })
  return concat(parts)
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.byteLength, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.byteLength }
  return out
}

function encoderSink(config, plan, ffmpeg) {
  const chunks = []
  let failure = null
  const encoder = new VideoEncoder({ output: chunk => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push(data) }, error: error => { failure = error } })
  encoder.configure(config)
  return {
    method: `WebCodecs ${config.codec}`,
    async add(canvas, k) {
      if (failure) throw failure
      const frame = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / plan.fps), duration: Math.round(1e6 / plan.fps) })
      encoder.encode(frame, { keyFrame: k % (plan.fps * 2) === 0 })
      frame.close()
      // Back-pressure: never queue more than a few frames in the encoder.
      while (encoder.encodeQueueSize > 4) await new Promise(resolve => setTimeout(resolve, 2))
    },
    async finish() {
      await encoder.flush()
      if (failure) throw failure
      const h264 = config.codec.startsWith('avc')
      await ffmpeg.writeFile(h264 ? 'in.h264' : 'in.ivf', h264 ? concat(chunks) : ivf(chunks, plan, config.codec.startsWith('vp09') ? 'VP90' : 'VP80'))
      chunks.length = 0
      return h264 ? ['-framerate', String(plan.fps), '-i', 'in.h264', '-c', 'copy', '-movflags', '+faststart', 'out.mp4'] : ['-i', 'in.ivf', '-c', 'copy', 'out.webm']
    },
    close() { if (encoder.state !== 'closed') encoder.close() },
  }
}

function frameSink(plan, ffmpeg) {
  const png = plan.type === 'gif', ext = png ? 'png' : 'jpg', name = k => `f${String(k).padStart(5, '0')}.${ext}`
  return {
    method: png ? 'ffmpeg palettegen' : `ffmpeg ${plan.type === 'mp4' ? 'libx264' : 'libvpx'}`,
    async add(canvas, k) {
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => (value ? resolve(value) : reject(Error('No se pudo generar un fotograma.'))), png ? 'image/png' : 'image/jpeg', 0.92))
      await ffmpeg.writeFile(name(k), new Uint8Array(await blob.arrayBuffer()))
    },
    async finish() {
      const input = ['-framerate', String(plan.fps), '-i', `f%05d.${ext}`]
      if (png) return [...input, '-filter_complex', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a', '-loop', plan.loop ? '0' : '-1', 'out.gif']
      if (plan.type === 'mp4') return [...input, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-b:v', String(plan.bitrate), '-movflags', '+faststart', 'out.mp4']
      return [...input, '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', '-b:v', String(plan.bitrate), 'out.webm']
    },
    close() {},
  }
}

// pages: page metadata in export order ({id, width, height, slide}); options: {type, side, fps, quality, loop}.
export async function exportMotion({ editor, document, pages, options, signal, onProgress = () => {}, forceFallback = false }) {
  const plan = planMotionExport(pages, options)
  if (plan.error) throw Error(plan.error)
  const output = window.document.createElement('canvas')
  output.width = plan.width; output.height = plan.height
  const ctx = output.getContext('2d', { willReadFrequently: false })
  // Fonts load before the first frame so text is measured and drawn with its real typeface.
  const included = new Set(plan.segments.map(segment => segment.pageId))
  for (const scene of documentPages(document)) if (included.has(pageId(scene))) for (const item of scene.objects) if (item.type === 'text') await abortable(ensureStudioFont(item.fontFamily, item.fontVariant), signal)
  onProgress(0, 'rendering')
  const config = forceFallback ? null : await pickEncoder(plan)
  const { ffmpeg } = await abortable(loadFfmpeg(), signal)
  const stop = () => { try { ffmpeg.terminate() } catch { /* already stopped */ } }
  signal?.addEventListener('abort', stop, { once: true })
  const log = []
  ffmpeg.on('log', ({ message }) => { log.push(message); if (log.length > 40) log.shift() })
  const sink = config ? encoderSink(config, plan, ffmpeg) : frameSink(plan, ffmpeg)
  const pagesRenderer = createPages(editor, document, signal)
  const started = performance.now()
  try {
    for (let k = 0; k < plan.frames; k++) {
      checkAbort(signal)
      const at = locate(plan, frameTime(plan, k)), segment = plan.segments[at.index]
      const page = await pagesRenderer.show(at.index, plan)
      page.player.renderFrame(sceneAt(document, segment.pageId, at.local))
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, plan.width, plan.height)
      if (at.transition) {
        const layers = transitionAt(at.transition, at.transition.progress, 1), leaving = pagesRenderer.outgoing
        if (leaving) draw(ctx, leaving.canvas, leaving.box, layers.outgoing)
        draw(ctx, page.player.frameCanvas(), segment.box, layers.incoming)
      } else draw(ctx, page.player.frameCanvas(), segment.box, REST)
      await sink.add(output, k)
      onProgress((k + 1) / plan.frames, 'rendering')
    }
    checkAbort(signal)
    onProgress(0, 'encoding')
    ffmpeg.on('progress', ({ progress }) => { if (Number.isFinite(progress)) onProgress(Math.min(1, Math.max(0, progress)), 'encoding') })
    const args = await sink.finish()
    const code = await ffmpeg.exec(args)
    checkAbort(signal)
    if (code !== 0) throw Object.assign(Error('No se pudo codificar el archivo.'), { detail: log.slice(-6).join('\n') })
    const bytes = await ffmpeg.readFile(`out.${plan.type}`)
    const mime = { gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm' }[plan.type]
    return { blob: new Blob([bytes], { type: mime }), extension: plan.type, plan, method: sink.method, elapsed: Math.round(performance.now() - started) }
  } finally {
    signal?.removeEventListener('abort', stop)
    sink.close()
    await pagesRenderer.destroy().catch(() => {})
    stop()
    output.width = output.height = 0
  }
}
