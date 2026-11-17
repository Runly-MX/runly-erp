// Timing and size of a GIF/MP4/WebM export (pure). The video follows Presentar with
// autoplay: pages play back to back for their slide duration; a page's entry transition
// runs during its first milliseconds over the last frame of the previous page. Frame k
// is evaluated at exactly k × 1000 / fps ms (virtual clock, never wall time).
import { NO_TRANSITION, slideDuration } from '../../../../../shared/studio/motion.js'

export const MOTION_TYPES = Object.freeze(['gif', 'mp4', 'webm'])
export const MOTION_EXPORT_LIMITS = Object.freeze({
  video: Object.freeze({ sides: [640, 1280, 1920], fps: [24, 30], maxDuration: 120_000 }),
  gif: Object.freeze({ sides: [320, 480, 640, 800], fps: [10, 12, 15], maxDuration: 20_000 }),
})
export const DEFAULT_MOTION_EXPORT = Object.freeze({ gif: { side: 640, fps: 12, loop: true }, mp4: { side: 1280, fps: 30, quality: 'standard' }, webm: { side: 1280, fps: 30, quality: 'standard' } })
const BITS_PER_PIXEL = { standard: 0.08, high: 0.16 }
const even = value => Math.max(2, Math.round(value / 2) * 2)
const seconds = ms => `${Number((ms / 1000).toFixed(1)).toString().replace('.', ',')} s`

// Largest centred rectangle with the page's aspect ratio inside the output (black bars like Presentar).
export function letterbox(page, width, height) {
  const fit = Math.min(width / page.width, height / page.height), w = page.width * fit, h = page.height * fit
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h }
}

export function planMotionExport(pages, options) {
  const type = options.type, kind = type === 'gif' ? 'gif' : 'video', limits = MOTION_EXPORT_LIMITS[kind]
  const defaults = DEFAULT_MOTION_EXPORT[type] ?? {}
  const side = options.side ?? defaults.side, fps = options.fps ?? defaults.fps
  if (!MOTION_TYPES.includes(type)) return { error: 'Formato de animación no válido.' }
  if (!pages.length) return { error: 'Elige al menos una página.' }
  if (!limits.sides.includes(side) || !limits.fps.includes(fps)) return { error: 'Resolución o fotogramas por segundo no válidos.' }
  const first = pages[0], scale = side / Math.max(first.width, first.height)
  const width = even(first.width * scale), height = even(first.height * scale)
  let start = 0
  const segments = pages.map((page, index) => {
    const duration = slideDuration(page), transition = index ? (page.slide?.transition ?? NO_TRANSITION) : NO_TRANSITION
    const segment = { pageId: page.id, start, duration, transition, box: letterbox(page, width, height) }
    start += duration
    return segment
  })
  const duration = start, frames = Math.max(1, Math.round(duration * fps / 1000))
  const label = type === 'gif' ? 'GIF' : type.toUpperCase()
  if (duration > limits.maxDuration) return { error: `El ${label} admite como máximo ${seconds(limits.maxDuration)}; esta selección dura ${seconds(duration)}. Elige menos páginas o acorta sus duraciones.` }
  const bitrate = kind === 'video' ? Math.round(Math.min(16e6, Math.max(1e6, width * height * fps * BITS_PER_PIXEL[options.quality ?? defaults.quality ?? 'standard']))) : null
  // Rough size for the summary: bitrate for video; GIF depends on the content.
  const estimatedBytes = kind === 'video' ? Math.round(bitrate * duration / 8000) : Math.round(width * height * frames * 0.1)
  return { type, kind, width, height, fps, frames, duration, segments, bitrate, loop: type === 'gif' ? options.loop ?? true : undefined, estimatedBytes }
}

export const frameTime = (plan, k) => (k * 1000) / plan.fps

// Which page and local instant a global time falls on, and the entry transition's progress.
export function locate(plan, ms) {
  const time = Math.min(Math.max(0, ms), plan.duration)
  let index = plan.segments.findIndex(segment => time < segment.start + segment.duration)
  if (index < 0) index = plan.segments.length - 1
  const segment = plan.segments[index], local = Math.min(segment.duration, time - segment.start)
  const { transition } = segment
  const active = index > 0 && transition.type !== 'none' && transition.duration > 0 && local < transition.duration
  return { index, local, transition: active ? { ...transition, progress: local / transition.duration } : null }
}
