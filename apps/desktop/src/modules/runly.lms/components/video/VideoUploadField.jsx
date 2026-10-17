import { useEffect, useRef, useState } from 'react'
import { Button, FieldWrapper, FileUploader, ProgressBar } from '@runly/ui'
import { useToken } from '../../hooks/useLmsData.js'
import { uploadLessonVideo } from '../../lib/uploadLessonVideo.js'

const STAGE_LABELS = {
  preparing: 'Preparando video',
  uploading: 'Subiendo',
  confirming: 'Verificando',
}
const HINT = 'MP4 o WebM. Hasta 2 GB; los videos de más de 50 MB se preparan en tu navegador antes de subirse.'

// Lesson video picker + upload. value/onChange: { fileId, fileName, durationSeconds } | null.
// onBusyChange(bool) lets the parent block saving while a transfer is running.
export function VideoUploadField({ value, onChange, error, disabled = false, onBusyChange }) {
  const token = useToken()
  const [stage, setStage] = useState(null)
  const [progress, setProgress] = useState(null)
  const controllerRef = useRef(null)
  const onBusyRef = useRef(onBusyChange)
  useEffect(() => { onBusyRef.current = onBusyChange }, [onBusyChange])

  // Leaving the editor mid-upload cancels the transfer.
  useEffect(() => () => controllerRef.current?.abort(), [])

  // Progress stays indeterminate until the stage reports a fraction (packages do).
  const changeStage = (next) => { setStage(next); setProgress(null) }

  async function upload(file) {
    const controller = new AbortController()
    controllerRef.current = controller
    onBusyRef.current?.(true)
    changeStage('uploading')
    try {
      return await uploadLessonVideo(file, token, { onStage: changeStage, onProgress: setProgress, signal: controller.signal })
    } finally {
      controllerRef.current = null
      setStage(null)
      setProgress(null)
      onBusyRef.current?.(false)
    }
  }

  const percent = typeof progress === 'number' ? Math.round(progress * 100) : null
  const label = stage === 'uploading' && percent !== null ? `${STAGE_LABELS.uploading} ${percent} %` : STAGE_LABELS[stage]

  return (
    <FieldWrapper label="Video" required error={error}>
      <FileUploader
        value={value ? { name: value.fileName || 'Video subido' } : null}
        accept="video/*" maxSizeMB={2048} disabled={disabled || Boolean(stage)}
        onUpload={upload} onChange={onChange}
        hint={HINT}
        emptyLabel="Subir video"
      />
      {stage ? (
        <div className="mt-2 space-y-1.5 rounded-md border border-[hsl(var(--border))] p-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">{label}…</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => controllerRef.current?.abort()}>Cancelar</Button>
          </div>
          <ProgressBar value={percent} />
          {stage === 'preparing' ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Se reorganiza el video en fragmentos sin perder calidad. No cierres esta pantalla.</p>
          ) : null}
        </div>
      ) : null}
    </FieldWrapper>
  )
}
