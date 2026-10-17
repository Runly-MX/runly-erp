import { useEffect, useRef } from 'react'

const REPORT_EVERY_MS = 15_000

// HTML5 player for uploaded videos: resumes at the saved position and reports
// progress every 15 s while playing, on pause, on end and when leaving.
export function VideoLesson({ src, startAt = 0, onProgress }) {
  const ref = useRef(null)
  const lastSent = useRef(0)
  const onProgressRef = useRef(onProgress)
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])

  function report(video, { force = false } = {}) {
    if (!video) return
    const positionSeconds = Math.floor(video.currentTime || 0)
    if (!positionSeconds && !force) return
    const durationSeconds = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : undefined
    lastSent.current = Date.now()
    onProgressRef.current?.({ positionSeconds, ...(durationSeconds ? { durationSeconds } : {}) })
  }

  // Report the last position when the lesson changes or the player closes.
  useEffect(() => {
    const video = ref.current
    return () => { if (video && !video.paused) report(video) }
  }, [src])

  function onLoadedMetadata(event) {
    const video = event.currentTarget
    const start = Number(startAt) || 0
    // Resume unless the saved position is at the very end (start over then).
    if (start > 0 && (!Number.isFinite(video.duration) || start < video.duration - 3)) video.currentTime = start
  }

  function onTimeUpdate(event) {
    if (Date.now() - lastSent.current >= REPORT_EVERY_MS) report(event.currentTarget)
  }

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <video
        key={src}
        ref={ref}
        src={src}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => { lastSent.current = Date.now() }}
        onTimeUpdate={onTimeUpdate}
        onPause={(event) => { if (!event.currentTarget.ended) report(event.currentTarget) }}
        onEnded={(event) => report(event.currentTarget, { force: true })}
      >
        Tu navegador no puede reproducir este video.
      </video>
    </div>
  )
}
