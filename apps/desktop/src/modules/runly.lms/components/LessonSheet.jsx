import { useEffect, useState } from 'react'
import { Button, CheckboxField, FieldWrapper, FileUploader, NumberField, SelectField, TextField, TextareaField } from '@runly/ui'
import { useSaveLesson, useToken, useUploadLmsFile } from '../hooks/useLmsData.js'
import { KIND_LABELS, formatDuration, toOptions } from '../lib/lmsLabels.js'
import { uploadLessonVideo } from '../lib/uploadLessonVideo.js'
import { FormSheet } from './shared.jsx'

const KIND_OPTIONS = toOptions(KIND_LABELS)
const EMPTY = { title: '', kind: 'video', sectionId: null, body: '', embedUrl: '', durationMinutes: '', required: true, upload: null }
const STAGE_LABELS = { uploading: 'Subiendo video…', confirming: 'Verificando video…' }

function fromLesson(lesson, sectionId) {
  if (!lesson) return { ...EMPTY, sectionId }
  return {
    title: lesson.title ?? '', kind: lesson.kind ?? 'text', sectionId: lesson.sectionId ?? sectionId, body: lesson.body ?? '',
    embedUrl: lesson.embedUrl ?? '',
    durationMinutes: lesson.durationSeconds ? String(Math.round(lesson.durationSeconds / 60)) : '',
    required: lesson.required !== false,
    upload: lesson.fileId ? { fileId: lesson.fileId, fileName: lesson.fileName, durationSeconds: lesson.durationSeconds } : null,
  }
}

// Create / edit a lesson. Header and footer stay fixed, only the form scrolls.
export function LessonSheet({ open, onOpenChange, lesson, sectionId, sections }) {
  const token = useToken()
  const save = useSaveLesson(), uploadFile = useUploadLmsFile()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [stage, setStage] = useState(null)
  useEffect(() => {
    if (open) { setForm(fromLesson(lesson, sectionId)); setErrors({}); setStage(null) }
  }, [open, lesson, sectionId])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)
  // Switching kind drops the media of the previous kind.
  const setKind = (kind) => setForm((current) => ({ ...current, kind, upload: kind === current.kind ? current.upload : null }))

  async function uploadVideo(file) {
    try {
      const result = await uploadLessonVideo(file, token, { onStage: setStage })
      if (result.durationSeconds) setForm((current) => ({ ...current, durationMinutes: String(Math.max(1, Math.round(result.durationSeconds / 60))) }))
      return result
    } finally { setStage(null) }
  }

  async function uploadDocument(file) {
    const asset = await uploadFile.mutateAsync({ file })
    return { fileId: asset.id, fileName: asset.originalName ?? file.name }
  }

  function validate() {
    const next = {}
    if (!form.title.trim()) next.title = 'El título es obligatorio.'
    if ((form.kind === 'video' || form.kind === 'file') && !form.upload?.fileId) next.upload = form.kind === 'video' ? 'Sube el video de la lección.' : 'Sube el archivo de la lección.'
    if (form.kind === 'embed' && !/^https:\/\//i.test(form.embedUrl.trim())) next.embedUrl = 'Escribe un enlace que empiece con https://'
    if (form.kind === 'text' && !form.body.trim()) next.body = 'Escribe el contenido de la lección.'
    setErrors(next)
    return !Object.keys(next).length
  }

  async function submit() {
    if (!validate()) return
    const minutes = Number(form.durationMinutes)
    const durationSeconds = form.kind === 'video' && form.upload?.durationSeconds
      ? form.upload.durationSeconds
      : (minutes > 0 ? Math.round(minutes * 60) : null)
    const media = form.kind === 'video' || form.kind === 'file'
    try {
      await save.mutateAsync({
        id: lesson?.id, sectionId: form.sectionId, title: form.title.trim(), kind: form.kind,
        body: form.body.trim() || null,
        fileId: media ? form.upload.fileId : null,
        embedUrl: form.kind === 'embed' ? form.embedUrl.trim() : null,
        durationSeconds, required: form.required,
      })
      onOpenChange(false)
    } catch { /* toast shown by the mutation */ }
  }

  const uploading = Boolean(stage) || uploadFile.isPending
  const sectionOptions = (sections ?? []).map((section) => ({ value: section.id, label: section.title }))
  const fileValue = form.upload ? { name: form.upload.fileName || 'Archivo subido' } : null
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={lesson ? 'Editar lección' : 'Nueva lección'}
      description="Video, enlace de YouTube o Vimeo, texto o un documento para descargar."
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending || uploading}>{save.isPending ? 'Guardando…' : lesson ? 'Guardar' : 'Crear lección'}</Button>
        </>
      )}
    >
      <TextField label="Título" required value={form.title} onChange={setText('title')} maxLength={200} error={errors.title} autoComplete="off" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Tipo" options={KIND_OPTIONS} value={form.kind} onValueChange={setKind} disabled={uploading} />
        {lesson && sectionOptions.length > 1 ? <SelectField label="Sección" options={sectionOptions} value={form.sectionId} onValueChange={set('sectionId')} /> : null}
      </div>

      {form.kind === 'video' ? (
        <FieldWrapper label="Video" required error={errors.upload} hint={stage ? STAGE_LABELS[stage] : undefined}>
          <FileUploader
            value={fileValue} accept="video/*" maxSizeMB={50} disabled={uploading}
            onUpload={uploadVideo} onChange={set('upload')}
            hint="MP4 o WebM, máximo 50 MB. Para videos más largos usa el tipo «Enlace de video» (YouTube o Vimeo)."
            emptyLabel="Subir video"
          />
        </FieldWrapper>
      ) : null}
      {form.kind === 'file' ? (
        <FieldWrapper label="Archivo" required error={errors.upload}>
          <FileUploader value={fileValue} maxSizeMB={10} disabled={uploading} onUpload={uploadDocument} onChange={set('upload')} hint="PDF, presentación u hoja de cálculo, máximo 10 MB." />
        </FieldWrapper>
      ) : null}
      {form.kind === 'embed' ? (
        <TextField
          label="Enlace del video" required type="url" value={form.embedUrl} onChange={setText('embedUrl')} error={errors.embedUrl}
          placeholder="https://www.youtube.com/watch?v=…" hint="YouTube, Vimeo u otro reproductor con https. Usa videos no listados para contenido interno."
        />
      ) : null}

      {form.kind === 'video' && form.upload?.durationSeconds ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Duración del video: {formatDuration(form.upload.durationSeconds)}</p>
      ) : (
        <NumberField
          label="Duración (minutos)" value={form.durationMinutes} onChange={setText('durationMinutes')} allowNegative={false} allowDecimal={false}
          hint="Opcional. Se muestra al alumno en el contenido del curso."
        />
      )}

      <TextareaField
        label={form.kind === 'text' ? 'Contenido' : 'Notas de la lección'} required={form.kind === 'text'}
        value={form.body} onChange={setText('body')} rows={form.kind === 'text' ? 12 : 4} error={errors.body}
        hint={form.kind === 'text' ? 'Admite formato Markdown: títulos (#), listas (-), negritas (**texto**) y enlaces.' : 'Opcional. Se muestra debajo del contenido. Admite Markdown.'}
      />
      <CheckboxField
        label="Obligatoria" hint="Las lecciones opcionales no cuentan para el avance ni bloquean las siguientes."
        checked={form.required} onChange={(event) => set('required')(event.target.checked)}
      />
    </FormSheet>
  )
}
