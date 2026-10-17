// Pure time helpers shared by VideoPlayer and captureVideoFrame.

// "m:ss" below an hour, "h:mm:ss" above. Invalid or negative input -> "0:00".
export function formatVideoTime(seconds) {
  const total = Number.isFinite(Number(seconds)) && Number(seconds) > 0 ? Math.floor(Number(seconds)) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

// Automatic thumbnail time: min(10% of the duration, 5 s), never past the end.
// Unknown duration -> 1 s (the seek clamps to what the file has).
export function chooseFrameTime(duration) {
  const d = Number(duration)
  if (!Number.isFinite(d) || d <= 0) return 1
  return Math.min(d * 0.1, 5, Math.max(0, d - 0.1))
}

// Resume position: the saved time unless it is within 3 s of the end (start
// over then). Unknown duration keeps the saved time.
export function resolveStartAt(startAt, duration) {
  const start = Number(startAt)
  if (!Number.isFinite(start) || start <= 0) return 0
  const d = Number(duration)
  if (Number.isFinite(d) && d > 0 && start >= d - 3) return 0
  return start
}

// Output size of a captured frame: at most `maxWidth` wide, keeping the ratio.
export function frameSize(videoWidth, videoHeight, maxWidth = 1280) {
  const w = Number(videoWidth) || 1280
  const h = Number(videoHeight) || Math.round(w * 9 / 16)
  const width = Math.min(w, maxWidth)
  return { width, height: Math.max(1, Math.round((width * h) / w)) }
}
