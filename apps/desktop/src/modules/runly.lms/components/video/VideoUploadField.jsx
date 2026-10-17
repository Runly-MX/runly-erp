import { useState } from 'react'
import { FieldWrapper, FileUploader } from '@runly/ui'
import { useToken } from '../../hooks/useLmsData.js'
import { uploadLessonVideo } from '../../lib/uploadLessonVideo.js'

const STAGE_LABELS = { uploading: 'Subiendo video…', confirming: 'Verificando video…' }

// Lesson video picker + upload. value/onChange: { fileId, fileName, durationSeconds } | null.
// onBusyChange(bool) lets the parent block saving while a transfer is running.
export function VideoUploadField({ value, onChange, error, disabled = false, onBusyChange }) {
  const token = useToken()
  const [stage, setStage] = useState(null)
  const setBusy = (next) => { setStage(next); onBusyChange?.(Boolean(next)) }

  async function upload(file) {
    try {
      return await uploadLessonVideo(file, token, { onStage: setBusy })
    } finally { setBusy(null) }
  }

  return (
    <FieldWrapper label="Video" required error={error} hint={stage ? STAGE_LABELS[stage] : undefined}>
      <FileUploader
        value={value ? { name: value.fileName || 'Video subido' } : null}
        accept="video/*" maxSizeMB={50} disabled={disabled || Boolean(stage)}
        onUpload={upload} onChange={onChange}
        hint="MP4 o WebM, máximo 50 MB. Para videos más largos usa el tipo «Enlace de video» (YouTube o Vimeo)."
        emptyLabel="Subir video"
      />
    </FieldWrapper>
  )
}
