import { useEffect, useState } from 'react'
import { Button, CheckboxField, FieldWrapper, FileUploader, NumberField, SelectField, TextField, TextareaField } from '@runly/ui'
import { useSaveLesson, useUploadLmsFile } from '../hooks/useLmsData.js'
import { formToSettings, settingsToForm, validateSettings } from '../lib/lmsEval.js'
import { KIND_LABELS, formatDuration, toOptions } from '../lib/lmsLabels.js'
import { VideoUploadField } from './video/VideoUploadField.jsx'
import { AssignmentSettingsFields } from './lesson-fields/AssignmentSettingsFields.jsx'
import { QuizSettingsFields } from './lesson-fields/QuizSettingsFields.jsx'
import { FormSheet } from './shared.jsx'

const KIND_OPTIONS = toOptions(KIND_LABELS)
const EMPTY = { title: '', kind: 'video', sectionId: null, body: '', embedUrl: '', durationMinutes: '', required: true, upload: null, settings: {} }
const BODY_COPY = {
  text: { label: 'Contenido', rows: 12, hint: 'Admite formato Markdown: títulos (#), listas (-), negritas (**texto**) y enlaces.' },
  assignment: { label: 'Instrucciones', rows: 8, hint: 'Qué debe entregar el alumno y cómo se evalúa. Admite Markdown.' },
  quiz: { label: 'Instrucciones', rows: 4, hint: 'Opcional. Se muestran antes de comenzar el examen. Admite Markdown.' },
}
const NOTES_COPY = { label: 'Notas de la lección', rows: 4, hint: 'Opcional. Se muestra debajo del contenido. Admite Markdown.' }

function fromLesson(lesson, sectionId) {
  if (!lesson) return { ...EMPTY, sectionId, settings: settingsToForm(EMPTY.kind) }
  return {
    title: lesson.title ?? '', kind: lesson.kind ?? 'text', sectionId: lesson.sectionId ?? sectionId, body: lesson.body ?? '',
    embedUrl: lesson.embedUrl ?? '',
    durationMinutes: lesson.durationSeconds ? String(Math.round(lesson.durationSeconds / 60)) : '',
    required: lesson.required !== false,
    upload: lesson.fileId ? { fileId: lesson.fileId, fileName: lesson.fileName, durationSeconds: lesson.durationSeconds } : null,
    settings: settingsToForm(lesson.kind, lesson.settings),
  }
}

// Create / edit a lesson. Header and footer stay fixed, only the form scrolls.
// `onEditQuestions(lesson)` opens the quiz questions editor; it also runs right
// after a quiz lesson is created so the author can add its questions.
export function LessonSheet({ open, onOpenChange, lesson, sectionId, sections, onEditQuestions }) {
  const save = useSaveLesson(), uploadFile = useUploadLmsFile()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [stage, setStage] = useState(null)
  useEffect(() => {
    if (open) { setForm(fromLesson(lesson, sectionId)); setErrors({}); setStage(null) }
  }, [open, lesson, sectionId])

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)
  const setSetting = (key, value) => setForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))
  // Switching kind drops the media and the settings of the previous kind.
  const setKind = (kind) => setForm((current) => (kind === current.kind ? current : {
    ...current, kind, upload: null, settings: settingsToForm(kind, lesson?.kind === kind ? lesson.settings : null),
  }))

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
    if (form.kind === 'assignment' && !form.body.trim()) next.body = 'Escribe las instrucciones de la tarea.'
    const settingsErrors = validateSettings(form.kind, form.settings)
    if (Object.keys(settingsErrors).length) next.settings = settingsErrors
    setErrors(next)
    return !Object.keys(next).length
  }

  async function submit() {
    if (!validate()) return
    const minutes = Number(form.durationMinutes)
    const durationSeconds = form.kind === 'video' && form.upload?.durationSeconds
      ? form.upload.durationSeconds
      : (minutes > 0 && form.kind !== 'quiz' ? Math.round(minutes * 60) : null)
    const media = form.kind === 'video' || form.kind === 'file'
    const settings = formToSettings(form.kind, form.settings)
    try {
      const saved = await save.mutateAsync({
        id: lesson?.id, sectionId: form.sectionId, title: form.title.trim(), kind: form.kind,
        body: form.body.trim() || null,
        fileId: media ? form.upload.fileId : null,
        embedUrl: form.kind === 'embed' ? form.embedUrl.trim() : null,
        durationSeconds, required: form.required,
        ...(settings ? { settings } : {}),
      })
      onOpenChange(false)
      if (!lesson && form.kind === 'quiz' && saved?.id) onEditQuestions?.(saved)
    } catch { /* toast shown by the mutation */ }
  }

  const uploading = Boolean(stage) || uploadFile.isPending
  const sectionOptions = (sections ?? []).map((section) => ({ value: section.id, label: section.title }))
  const fileValue = form.upload ? { name: form.upload.fileName || 'Archivo subido' } : null
  const bodyCopy = BODY_COPY[form.kind] ?? NOTES_COPY
  const editQuestions = lesson?.id && lesson.kind === 'quiz' && onEditQuestions ? () => onEditQuestions(lesson) : null
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={lesson ? 'Editar lección' : 'Nueva lección'}
      description="Video, enlace de YouTube o Vimeo, texto, documento, examen o tarea."
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
        <VideoUploadField
          value={form.upload} error={errors.upload} disabled={uploading}
          onBusyChange={(busy) => setStage(busy ? 'uploading' : null)}
          onChange={(upload) => setForm((current) => ({
            ...current, upload,
            ...(upload?.durationSeconds ? { durationMinutes: String(Math.max(1, Math.round(upload.durationSeconds / 60))) } : {}),
          }))}
        />
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

      {form.kind === 'quiz' ? null : form.kind === 'video' && form.upload?.durationSeconds ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Duración del video: {formatDuration(form.upload.durationSeconds)}</p>
      ) : (
        <NumberField
          label={form.kind === 'assignment' ? 'Tiempo estimado (minutos)' : 'Duración (minutos)'} value={form.durationMinutes} onChange={setText('durationMinutes')}
          allowNegative={false} allowDecimal={false} hint="Opcional. Se muestra al alumno en el contenido del curso."
        />
      )}

      <TextareaField
        label={bodyCopy.label} required={form.kind === 'text' || form.kind === 'assignment'}
        value={form.body} onChange={setText('body')} rows={bodyCopy.rows} error={errors.body} hint={bodyCopy.hint}
      />
      {form.kind === 'quiz' ? <QuizSettingsFields value={form.settings} onChange={setSetting} errors={errors.settings} onEditQuestions={editQuestions} /> : null}
      {form.kind === 'assignment' ? <AssignmentSettingsFields value={form.settings} onChange={setSetting} errors={errors.settings} /> : null}
      <CheckboxField
        label="Obligatoria" hint="Las lecciones opcionales no cuentan para el avance ni bloquean las siguientes."
        checked={form.required} onChange={(event) => set('required')(event.target.checked)}
      />
    </FormSheet>
  )
}
