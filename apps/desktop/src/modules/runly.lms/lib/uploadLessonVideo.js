import { runly } from '../../../lib/runly.js'
import { directUpload } from './directUpload.js'

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const VIDEO_TOO_BIG = 'El video supera 50 MB. Para videos más largos usa una lección de tipo enlace (YouTube o Vimeo).'

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

// Lesson video through the shared direct upload. `onStage` receives
// 'uploading' | 'confirming' so the sheet can show where it is.
export async function uploadLessonVideo(file, token, { onStage } = {}) {
  if (!file) throw new Error('Selecciona un video.')
  if (!String(file.type).startsWith('video/')) throw new Error('El archivo debe ser un video.')
  if (file.size > VIDEO_MAX_BYTES) throw new Error(VIDEO_TOO_BIG)

  const durationSeconds = await readVideoDuration(file)
  const result = await directUpload(file, token, {
    presign: (data, t) => runly.lms.presignVideo(data, t),
    confirm: (fileId, t) => runly.lms.confirmVideo(fileId, t),
    onStage,
    failMessage: 'No se pudo subir el video.',
  })
  return { ...result, durationSeconds }
}
