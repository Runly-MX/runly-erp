// Evidence photo from the front camera: one JPEG frame, small enough to queue
// offline and upload later.
export const SELFIE_MAX_SIDE = 480
export const SELFIE_START_QUALITY = 0.6
export const SELFIE_MIN_QUALITY = 0.2
export const SELFIE_TARGET_BYTES = 150 * 1024
export const SELFIE_HARD_CAP_BYTES = 380 * 1024
export const SELFIE_SMILE_MS = 1_000

// encode(quality) -> Promise<Blob|null>. Lowers quality until the blob fits the
// target; if none does, returns the smallest one that fits the hard cap, else null.
export async function encodeUnderCap(encode, { start = SELFIE_START_QUALITY, min = SELFIE_MIN_QUALITY, step = 0.1, target = SELFIE_TARGET_BYTES, hardCap = SELFIE_HARD_CAP_BYTES } = {}) {
  let best = null
  for (let q = start; q >= min - 1e-9; q -= step) {
    const quality = Math.round(q * 100) / 100
    const blob = await encode(quality)
    if (!blob) continue
    if (!best || blob.size < best.blob.size) best = { blob, quality }
    if (blob.size <= target) break
  }
  return best && best.blob.size <= hardCap ? best : null
}

export function scaleToFit(width, height, maxSide = SELFIE_MAX_SIDE) {
  const ratio = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) }
}

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), ms)
  promise.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
})

export const selfieSupported = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

let busy = false

// Opens the front camera, waits `smileMs` so the person can look at it, grabs a
// frame and releases the camera. Resolves { blob, quality }; rejects when the
// camera is unavailable/denied or already in use by another capture.
export async function captureSelfie({ smileMs = SELFIE_SMILE_MS, openTimeoutMs = 8_000 } = {}) {
  if (!selfieSupported() || busy) throw new Error('unavailable')
  busy = true
  let stream = null
  let timedOut = false
  let video = null
  try {
    const opening = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: SELFIE_MAX_SIDE }, height: { ideal: SELFIE_MAX_SIDE } }, audio: false })
    // A prompt answered after the timeout must still release the camera.
    opening.then((s) => { if (timedOut) s.getTracks().forEach((t) => t.stop()) }, () => {})
    try { stream = await withTimeout(opening, openTimeoutMs) } catch (error) { timedOut = true; throw error }
    video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    await withTimeout(video.play(), openTimeoutMs)
    await new Promise((resolve) => setTimeout(resolve, smileMs))
    if (!video.videoWidth) throw new Error('no_frame')
    const { width, height } = scaleToFit(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(video, 0, 0, width, height)
    const result = await encodeUnderCap((quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality)))
    if (!result) throw new Error('too_large')
    return result
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
    if (video) video.srcObject = null
    busy = false
  }
}
