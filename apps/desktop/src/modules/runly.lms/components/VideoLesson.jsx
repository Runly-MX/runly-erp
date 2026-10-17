import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyState, useHlsPlayback } from '@runly/ui'
import { FileVideo } from 'lucide-react'

const REPORT_EVERY_MS = 15_000
const PLAYBACK_ERROR = 'No se pudo reproducir el video. Recarga la lección e inténtalo de nuevo.'

// Blob URL of an HLS manifest (segments already signed), revoked on change/unmount.
function useManifestUrl(manifest) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!manifest) { setUrl(null); return undefined }
    const next = URL.createObjectURL(new Blob([manifest], { type: 'application/vnd.apple.mpegurl' }))
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [manifest])
  return url
}

// HTML5 player for uploaded videos: resumes at the saved position and reports
// progress every 15 s while playing, on pause, on end and when leaving.
// `media` ({ kind: 'file', url } | { kind: 'hls', manifest }) wins over `src`;
// HLS packages (videos over 50 MB) play through hls.js.
export function VideoLesson({ src, media = null, startAt = 0, onProgress }) {
  const ref = useRef(null)
  const lastSent = useRef(0)
  const onProgressRef = useRef(onProgress)
  const [failed, setFailed] = useState(false)
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])

  const isHls = media?.kind === 'hls'
  const hlsSrc = useManifestUrl(isHls ? media.manifest : null)
  const fileSrc = isHls ? null : media?.kind === 'file' ? media.url : src
  const playKey = isHls ? hlsSrc : fileSrc
  const onFatal = useCallback(() => setFailed(true), [])
  useHlsPlayback(ref, hlsSrc, onFatal)
  useEffect(() => { setFailed(false) }, [playKey])

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
  }, [playKey])

  function onLoadedMetadata(event) {
    const video = event.currentTarget
    const start = Number(startAt) || 0
    // Resume unless the saved position is at the very end (start over then).
    if (start > 0 && (!Number.isFinite(video.duration) || start < video.duration - 3)) video.currentTime = start
  }

  function onTimeUpdate(event) {
    if (Date.now() - lastSent.current >= REPORT_EVERY_MS) report(event.currentTarget)
  }

  if (isHls && (media.error || !media.manifest)) {
    return <EmptyState icon={FileVideo} title="Video no disponible" description={media.error || PLAYBACK_ERROR} />
  }
  if (failed) return <EmptyState icon={FileVideo} title="Video no disponible" description={PLAYBACK_ERROR} />

  return (
    <div className="overflow-hidden rounded-xl bg-black">
      <video
        key={playKey ?? 'empty'}
        ref={ref}
        src={fileSrc ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => { lastSent.current = Date.now() }}
        onTimeUpdate={onTimeUpdate}
        onPause={(event) => { if (!event.currentTarget.ended) report(event.currentTarget) }}
        onEnded={(event) => report(event.currentTarget, { force: true })}
        onError={isHls ? () => setFailed(true) : undefined}
      >
        Tu navegador no puede reproducir este video.
      </video>
    </div>
  )
}
