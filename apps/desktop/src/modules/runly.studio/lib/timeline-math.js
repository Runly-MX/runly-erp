// Timeline geometry (pure): zoom is pixels per second; times are integer milliseconds.
export const ZOOM_LIMITS = Object.freeze({ min: 20, max: 1200, step: 1.4 })
export const GRID = 100
const STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000]

export const msToPx = (ms, zoom) => (ms / 1000) * zoom
export const pxToMs = (px, zoom) => Math.round((px / zoom) * 1000)
export const clampZoom = zoom => Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, zoom))

// Zoom that shows the whole slide in `width` pixels.
export const fitZoom = (duration, width) => clampZoom((Math.max(120, width) - 24) / Math.max(0.5, duration / 1000))

// Ruler ticks: labelled steps at least 64 px apart, with minor ticks in between.
export function rulerTicks(end, zoom) {
  const major = STEPS.find(step => msToPx(step, zoom) >= 64) ?? STEPS.at(-1)
  const minor = STEPS.filter(step => step < major && major % step === 0).find(step => msToPx(step, zoom) >= 10) ?? major
  const ticks = []
  for (let at = 0; at <= end; at += minor) ticks.push({ at, major: at % major === 0 })
  return ticks
}

// Snap to the closest target within `threshold` px, else to the grid. Disabled: whole ms.
export function snapTime(ms, { zoom, targets = [], enabled = true, threshold = 8, grid = GRID }) {
  const value = Math.max(0, Math.round(ms))
  if (!enabled) return value
  let best = null
  for (const target of targets) {
    const distance = Math.abs(msToPx(target - value, zoom))
    if (distance <= threshold && (best === null || distance < best.distance)) best = { target, distance }
  }
  return best ? best.target : Math.max(0, Math.round(value / grid) * grid)
}

// Visible length: the slide plus room for anything that ends after it.
export function timelineEnd(duration, items) {
  let end = duration
  for (const item of items) {
    for (const key of ['enter', 'emphasis', 'exit']) if (item[key]) end = Math.max(end, item[key].delay + item[key].duration)
    for (const frame of item.keyframes ?? []) end = Math.max(end, frame.at)
  }
  return Math.ceil((Math.max(end, duration) * 1.15 + 500) / 500) * 500
}

// "1,5 s" for labels; "00:01,500" for the readout.
export const formatSeconds = ms => `${Number((ms / 1000).toFixed(ms % 100 ? 2 : 1)).toString().replace('.', ',')} s`
export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms)), minutes = Math.floor(total / 60000), seconds = Math.floor((total % 60000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(total % 1000).padStart(3, '0')}`
}
