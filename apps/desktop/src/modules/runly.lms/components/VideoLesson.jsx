import { useEffect, useRef } from 'react'
import { EmptyState, VideoPlayer } from '@runly/ui'
import { FileVideo } from 'lucide-react'

const REPORT_EVERY_MS = 15_000

// Uploaded-video lesson on the shared VideoPlayer. Resumes at the saved
// position and reports progress every 15 s while playing, on pause, on end
// and when leaving (the server auto-completes at 90 %).
// - `lesson`: { media ({ kind: 'file', url } | { kind: 'hls', manifest, error? }), mediaUrl, poster, durationSeconds }
// - `progress`: { positionSeconds } of the learner; `preview` (manager without
//   enrollment) plays without reporting.
// - `theater` / `onTheaterChange(bool)` show the theater toggle.
// Legacy props `src`, `media` and `startAt` still work.
export function VideoLesson({
  lesson = null, progress = null, preview = false, onProgress, onEnded,
  theater = false, onTheaterChange, src = null, media: mediaProp = null, startAt: startAtProp = null,
}) {
  const media = lesson?.media ?? mediaProp
  const isHls = media?.kind === 'hls'
  const fileSrc = isHls ? null : media?.kind === 'file' ? media.url : lesson?.mediaUrl ?? src
  const startAt = Number(startAtProp ?? progress?.positionSeconds ?? 0) || 0
  const playKey = isHls ? media.manifest : fileSrc

  const lastSent = useRef(0)
  const last = useRef({ time: 0, duration: 0, playing: false })
  const handlers = useRef({})
  handlers.current = { onProgress: preview ? null : onProgress, onEnded }

  function report(time, duration, { force = false } = {}) {
    const positionSeconds = Math.floor(time || 0)
    if (!positionSeconds && !force) return
    const durationSeconds = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined
    lastSent.current = Date.now()
    handlers.current.onProgress?.({ positionSeconds, ...(durationSeconds ? { durationSeconds } : {}) })
  }

  // Report the last position when the lesson changes or the player closes.
  useEffect(() => {
    last.current = { time: 0, duration: 0, playing: false }
    lastSent.current = Date.now()
    return () => { if (last.current.playing) report(last.current.time, last.current.duration) }
  }, [playKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isHls && (media.error || !media.manifest)) {
    return <EmptyState icon={FileVideo} title="Video no disponible" description={media.error || 'No se pudo preparar la reproducción del video.'} />
  }

  return (
    <VideoPlayer
      key={playKey ?? 'empty'}
      src={fileSrc}
      hlsManifest={isHls ? media.manifest : null}
      poster={lesson?.poster ?? null}
      startAt={startAt}
      title={lesson?.title}
      theater={theater}
      onTheaterChange={onTheaterChange}
      className="rounded-md"
      onTimeUpdate={(time, duration) => {
        const wasPlaying = last.current.playing
        last.current = { time, duration, playing: true }
        if (!wasPlaying) { lastSent.current = Date.now(); return }
        if (Date.now() - lastSent.current >= REPORT_EVERY_MS) report(time, duration)
      }}
      onPause={(time, duration) => {
        last.current = { time, duration, playing: false }
        report(time, duration)
      }}
      onEnded={(time, duration) => {
        last.current = { time, duration, playing: false }
        report(time, duration, { force: true })
        handlers.current.onEnded?.()
      }}
    />
  )
}
