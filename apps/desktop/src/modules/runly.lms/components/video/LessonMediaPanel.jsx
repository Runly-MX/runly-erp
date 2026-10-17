import { useRef } from 'react'
import { captureVideoFrame } from '@runly/ui'
import { LessonCoverField } from './LessonCoverField.jsx'
import { VideoUploadField } from './VideoUploadField.jsx'

// "Usar este fotograma": the preview's current frame. Drawing the live element
// works for local files and HLS; a signed MP4 without CORS taints the canvas,
// so that case re-opens the URL with CORS at the same time.
async function captureCurrentFrame(video) {
  if (!video || !video.videoWidth) throw new Error('Reproduce el video hasta el fotograma que quieres usar.')
  try {
    return await captureVideoFrame(video)
  } catch {
    return captureVideoFrame(video, video.currentTime)
  }
}

// Video lesson media: the video and its thumbnail side by side, 16:9 each.
// `form.upload` is the video ({ fileId, fileName, durationSeconds }) and
// `form.cover` the thumbnail ({ fileId, url, auto? }). A frame captured on
// upload becomes the cover unless the author chose one (auto covers are replaced).
export function LessonMediaPanel({ form, setForm, error, lesson, readOnly, onBusyChange }) {
  const playerRef = useRef(null)
  const cover = form.cover ?? null
  const keepCover = Boolean(cover && !cover.auto)
  // Both cards can transfer at once; saving stays blocked until both finish.
  const busyCount = useRef(0)
  const trackBusy = (on) => {
    busyCount.current = Math.max(0, busyCount.current + (on ? 1 : -1))
    onBusyChange?.(busyCount.current > 0)
  }

  function changeVideo(upload) {
    setForm((current) => {
      const next = { ...current, upload: upload ? { fileId: upload.fileId, fileName: upload.fileName, durationSeconds: upload.durationSeconds } : null }
      if (upload?.durationSeconds) next.durationMinutes = String(Math.max(1, Math.round(upload.durationSeconds / 60)))
      if (upload?.coverFileId && (!current.cover || current.cover.auto)) next.cover = { fileId: upload.coverFileId, url: upload.coverUrl ?? null, auto: true }
      return next
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <VideoUploadField
        value={form.upload} onChange={changeVideo} error={error} disabled={readOnly} onBusyChange={trackBusy}
        lessonId={lesson?.id ?? null} savedFileId={lesson?.fileId ?? null} poster={cover?.url ?? null}
        keepCover={keepCover} playerRef={playerRef}
      />
      <LessonCoverField
        value={cover} disabled={readOnly} lessonId={lesson?.id ?? null} onBusyChange={trackBusy}
        onChange={(next) => setForm((current) => ({ ...current, cover: next }))}
        captureFrame={form.upload ? () => captureCurrentFrame(playerRef.current) : null}
      />
    </div>
  )
}
