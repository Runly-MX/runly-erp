import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button, ProgressBar, Skeleton, VideoPlayer, cn } from '@runly/ui'
import { CheckCircle2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { useRead, useToken } from '../../hooks/useLmsData.js'
import { captureLessonCover, uploadLessonVideo } from '../../lib/uploadLessonVideo.js'
import { MediaCard } from './MediaCard.jsx'

const STAGE_LABELS = {
  preparing: 'Preparando video',
  uploading: 'Subiendo',
  confirming: 'Verificando',
}
const HINT = 'MP4 o WebM. Hasta 2 GB; los videos de más de 50 MB se preparan en tu navegador antes de subirse.'
const MAX_BYTES = 2048 * 1024 * 1024

// Signed media of the saved lesson video (editor preview). Never refetched in
// the background: a new signed URL would restart the player.
function useSavedLessonMedia(lessonId, fileId, enabled) {
  return useRead(['lesson-media', lessonId, fileId], (t) => runly.lms.getLessonMedia(lessonId, t), {
    enabled: Boolean(enabled && lessonId && fileId), retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
  })
}

// Lesson video card (16:9): empty dropzone, upload progress, or a playable
// preview on VideoPlayer with Cambiar / Quitar.
// value/onChange: { fileId, fileName, durationSeconds, coverFileId?, coverUrl? } | null.
// After an upload a frame is captured and uploaded as the thumbnail
// (coverFileId/coverUrl) unless `keepCover`. `playerRef` receives the <video>.
// onBusyChange(bool) lets the parent block saving while a transfer is running.
export function VideoUploadField({
  value, onChange, error, disabled = false, onBusyChange, lessonId = null, savedFileId = null, poster = null, keepCover = false, playerRef,
}) {
  const token = useToken()
  const [stage, setStage] = useState(null)
  const [progress, setProgress] = useState(null)
  const [local, setLocal] = useState(null) // { fileId, url } of the file picked in this session
  const [dragOver, setDragOver] = useState(false)
  const controllerRef = useRef(null)
  const inputRef = useRef(null)
  const onBusyRef = useRef(onBusyChange)
  useEffect(() => { onBusyRef.current = onBusyChange }, [onBusyChange])

  // Leaving the editor mid-upload cancels the transfer.
  useEffect(() => () => controllerRef.current?.abort(), [])
  useEffect(() => () => { if (local?.url) URL.revokeObjectURL(local.url) }, [local])

  const fileId = value?.fileId ?? null
  const localSrc = local && local.fileId === fileId ? local.url : null
  const saved = useSavedLessonMedia(lessonId, fileId, !localSrc && fileId === savedFileId)

  // Progress stays indeterminate until the stage reports a fraction (packages do).
  const changeStage = (next) => { setStage(next); setProgress(null) }

  async function upload(file) {
    if (!file || disabled || stage) return
    if (!String(file.type).startsWith('video/')) { toast.error('El archivo debe ser un video.'); return }
    if (file.size > MAX_BYTES) { toast.error('El video supera 2 GB.'); return }
    const controller = new AbortController()
    controllerRef.current = controller
    onBusyRef.current?.(true)
    changeStage('uploading')
    try {
      const result = await uploadLessonVideo(file, token, { onStage: changeStage, onProgress: setProgress, signal: controller.signal })
      const cover = keepCover ? null : await captureLessonCover(file, token, { lessonId })
      setLocal({ fileId: result.fileId, url: URL.createObjectURL(file) })
      onChange({
        fileId: result.fileId,
        fileName: result.fileName ?? file.name,
        durationSeconds: result.durationSeconds ?? null,
        ...(cover ? { coverFileId: cover.coverFileId, coverUrl: cover.coverUrl } : {}),
      })
    } catch (err) {
      if (err?.name !== 'AbortError' && !controller.signal.aborted) toast.error(err?.message || 'No se pudo subir el video.')
    } finally {
      controllerRef.current = null
      setStage(null)
      setProgress(null)
      onBusyRef.current?.(false)
    }
  }

  const pick = () => inputRef.current?.click()
  const percent = typeof progress === 'number' ? Math.round(progress * 100) : null
  const label = stage === 'uploading' && percent !== null ? `${STAGE_LABELS.uploading} ${percent} %` : STAGE_LABELS[stage]
  const media = saved.data?.media
  const canDrop = !disabled && !stage && !value

  let body
  if (stage) {
    body = (
      <div className="flex size-full flex-col items-center justify-center gap-3 p-4" aria-live="polite">
        <p className="text-sm font-medium">{label}…</p>
        <ProgressBar value={percent} className="w-full max-w-xs" />
        {stage === 'preparing' ? (
          <p className="max-w-xs text-center text-xs text-[hsl(var(--muted-foreground))]">Se reorganiza el video en fragmentos sin perder calidad. No cierres esta pantalla.</p>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => controllerRef.current?.abort()}>Cancelar</Button>
      </div>
    )
  } else if (localSrc) {
    body = <VideoPlayer ref={playerRef} src={localSrc} poster={poster} className="rounded-none" title={value?.fileName} />
  } else if (value && saved.isLoading) {
    body = <Skeleton className="size-full rounded-none" />
  } else if (value && media && (media.kind === 'file' || media.manifest)) {
    body = (
      <VideoPlayer
        ref={playerRef} className="rounded-none" title={value.fileName} poster={poster ?? saved.data?.poster ?? null}
        src={media.kind === 'file' ? media.url : null} hlsManifest={media.kind === 'hls' ? media.manifest : null}
      />
    )
  } else if (value) {
    body = (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
        <CheckCircle2 className="size-8 text-primary" aria-hidden />
        <p className="text-sm font-medium">Video listo</p>
        <p className="max-w-full truncate text-xs text-[hsl(var(--muted-foreground))]">{value.fileName || 'Video subido'}</p>
        {media?.error || saved.isError ? <p className="text-xs text-[hsl(var(--muted-foreground))]">La vista previa no está disponible.</p> : null}
      </div>
    )
  } else {
    body = (
      <button
        type="button" disabled={disabled} onClick={pick}
        className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center transition-colors hover:bg-[hsl(var(--muted)/0.7)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary"><Upload className="size-6" aria-hidden /></span>
        <span className="text-sm font-medium">Subir video</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Arrastra el archivo aquí o haz clic para elegirlo</span>
      </button>
    )
  }

  return (
    <MediaCard
      label="Video" required error={error} hint={HINT}
      dashed={!value && !stage} highlighted={dragOver}
      className={cn(value && !stage && 'bg-black')}
      onDragOver={(event) => { if (!canDrop) return; event.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (!canDrop) return
        event.preventDefault()
        setDragOver(false)
        upload(event.dataTransfer.files?.[0])
      }}
      actions={value && !stage && !disabled ? (
        <>
          <Button type="button" size="sm" variant="outline" className="flex-1" onClick={pick}><RefreshCw />Cambiar</Button>
          <Button type="button" size="sm" variant="outline" className="text-[hsl(var(--destructive))]" onClick={() => onChange(null)}><Trash2 />Quitar</Button>
        </>
      ) : null}
    >
      {body}
      <input
        ref={inputRef} type="file" accept="video/*" className="hidden" tabIndex={-1} aria-hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; upload(file) }}
      />
    </MediaCard>
  )
}
