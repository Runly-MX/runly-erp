import { loadFfmpeg } from '@runly/ui'
import { runly } from '../../../lib/runly.js'
import { directUpload } from './directUpload.js'
import { DIRECT_MAX_BYTES, chooseUploadPath, packageVideoAsHls, uploadHlsPackage } from './hlsPackage.js'

export const VIDEO_MAX_BYTES = DIRECT_MAX_BYTES

// Duration of a local video file, read from a detached <video> element.
// Resolves null when the browser cannot read the metadata.
export function readVideoDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      resolve(value)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null)
    video.onerror = () => finish(null)
    setTimeout(() => finish(null), 10_000)
    video.src = url
  })
}

// Lesson video upload. Up to 50 MB goes straight to Storage; up to 2 GB is
// remuxed into an HLS package first. `onStage` receives 'preparing' |
// 'uploading' | 'confirming'; `onProgress` 0..1 within the stage (package only).
export async function uploadLessonVideo(file, token, { onStage, onProgress, signal } = {}) {
  if (!file) throw new Error('Selecciona un video.')
  if (!String(file.type).startsWith('video/')) throw new Error('El archivo debe ser un video.')
  const path = chooseUploadPath(file.size)

  const durationSeconds = await readVideoDuration(file)
  if (path === 'direct') {
    const result = await directUpload(file, token, {
      presign: (data, t) => runly.lms.presignVideo(data, t),
      confirm: (fileId, t) => runly.lms.confirmVideo(fileId, t),
      onStage,
      signal,
      failMessage: 'No se pudo subir el video.',
    })
    return { ...result, durationSeconds }
  }

  onStage?.('preparing')
  onProgress?.(0)
  const pkg = await packageVideoAsHls(file, { loadFfmpeg, onProgress, signal })
  const result = await uploadHlsPackage(pkg, {
    fileName: file.name,
    sourceBytes: file.size,
    presign: (data) => runly.lms.presignVideoPackage(data, token),
    confirm: (fileId) => runly.lms.confirmVideo(fileId, token),
    onStage,
    onProgress,
    signal,
  })
  return { ...result, durationSeconds: result.durationSeconds ?? durationSeconds }
}
