import { chooseFrameTime, frameSize } from './videoTime.js'

const TIMEOUT_MS = 20_000

function drawFrame(video, maxWidth) {
  const { width, height } = frameSize(video.videoWidth, video.videoHeight, maxWidth)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(video, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo capturar el fotograma.'))), 'image/jpeg', 0.85)
    } catch (error) {
      // A cross-origin video without CORS taints the canvas.
      reject(error)
    }
  })
}

// One JPEG frame (Blob, at most 1280 px wide) of a video.
// - `source`: a File/Blob, a URL (must allow CORS), or a <video> element that
//   is already loaded (then the current frame is used unless `seconds` is given).
// - `seconds`: the time to capture; omitted -> min(10% of the duration, 5 s).
// Rejects when the browser cannot decode the video or the frame is tainted.
export async function captureVideoFrame(source, seconds, { maxWidth = 1280 } = {}) {
  const isElement = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement
  if (isElement && (seconds === undefined || seconds === null)) return drawFrame(source, maxWidth)
  const isBlob = typeof Blob !== 'undefined' && source instanceof Blob
  const url = isBlob ? URL.createObjectURL(source) : isElement ? source.currentSrc : String(source || '')
  if (!url) throw new Error('No hay video para capturar.')
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  if (!isBlob) video.crossOrigin = 'anonymous'
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('El video tardó demasiado en cargar.')), TIMEOUT_MS)
      const fail = (error) => { clearTimeout(timer); reject(error) }
      video.addEventListener('loadedmetadata', () => {
        const d = Number.isFinite(video.duration) ? video.duration : null
        const wanted = seconds === undefined || seconds === null ? chooseFrameTime(d) : Number(seconds) || 0
        video.currentTime = d ? Math.min(Math.max(0, wanted), Math.max(0, d - 0.05)) : Math.max(0, wanted)
      }, { once: true })
      video.addEventListener('seeked', () => {
        drawFrame(video, maxWidth).then((blob) => { clearTimeout(timer); resolve(blob) }, fail)
      }, { once: true })
      video.addEventListener('error', () => fail(new Error('El navegador no pudo leer el video.')), { once: true })
      video.src = url
    })
  } finally {
    video.removeAttribute('src')
    video.load()
    if (isBlob) URL.revokeObjectURL(url)
  }
}
