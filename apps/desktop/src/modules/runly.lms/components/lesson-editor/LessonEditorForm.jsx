import {
  CheckboxField, FieldWrapper, FileUploader, MarkdownField, NumberField, SelectField, TextField,
} from '@runly/ui'
import { useUploadLmsFile } from '../../hooks/useLmsData.js'
import { changeLessonKind } from '../../lib/lessonForm.js'
import { KIND_LABELS, formatDuration, toOptions } from '../../lib/lmsLabels.js'
import { AssignmentSettingsFields } from '../lesson-fields/AssignmentSettingsFields.jsx'
import { QuizSettingsFields } from '../lesson-fields/QuizSettingsFields.jsx'
import { VideoUploadField } from '../video/VideoUploadField.jsx'
import { QuizQuestionsEditor } from './QuizQuestionsEditor.jsx'

const KIND_OPTIONS = toOptions(KIND_LABELS)
// Taller editor where the text is the lesson itself.
const TALL = '[&_.mdxeditor-root-contenteditable]:min-h-[24rem]!'
const MEDIUM = '[&_.mdxeditor-root-contenteditable]:min-h-[12rem]!'
const BODY_COPY = {
  text: { label: 'Contenido', required: true, size: TALL, placeholder: 'Escribe el contenido de la lección…', hint: 'Usa la barra para dar formato: títulos, listas, tablas, enlaces y bloques de código.' },
  assignment: { label: 'Instrucciones', required: true, size: TALL, placeholder: 'Qué debe entregar el alumno y cómo se evalúa…', hint: 'Qué debe entregar el alumno y cómo se evalúa.' },
  quiz: { label: 'Instrucciones', required: false, size: MEDIUM, placeholder: 'Indicaciones antes de comenzar el examen…', hint: 'Opcional. Se muestran antes de comenzar el examen.' },
}
const NOTES_COPY = { label: 'Notas de la lección', required: false, size: MEDIUM, placeholder: 'Notas, recursos o enlaces de apoyo…', hint: 'Opcional. Se muestran debajo del contenido.' }

// Fields of the lesson editor page. `form` comes from lib/lessonForm; the
// page owns saving, the unsaved-changes guard and the quiz questions dirty flag.
export function LessonEditorForm({ form, setForm, errors, lesson, sections, isNew, readOnly, onBusyChange, onQuestionsDirtyChange }) {
  const uploadFile = useUploadLmsFile()
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)
  const setSetting = (key, value) => setForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))

  async function uploadDocument(file) {
    const asset = await uploadFile.mutateAsync({ file, entityType: 'LmsLesson', entityId: lesson?.id })
    return { fileId: asset.id, fileName: asset.originalName ?? file.name }
  }

  const sectionOptions = (sections ?? []).map((section) => ({ value: section.id, label: section.title }))
  const bodyCopy = BODY_COPY[form.kind] ?? NOTES_COPY
  const fileValue = form.upload ? { name: form.upload.fileName || 'Archivo subido' } : null

  return (
    <div className="space-y-5">
      <TextField label="Título" required value={form.title} onChange={setText('title')} maxLength={200} error={errors.title} autoComplete="off" disabled={readOnly} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Tipo" options={KIND_OPTIONS} value={form.kind} disabled={readOnly}
          onValueChange={(kind) => setForm((current) => changeLessonKind(current, kind, lesson))}
          hint={!isNew ? 'Cambiar el tipo quita el video o archivo y la configuración del tipo anterior.' : undefined}
        />
        {isNew ? (
          <SelectField label="Sección" required options={sectionOptions} value={form.sectionId ?? ''} onValueChange={set('sectionId')} error={errors.sectionId} disabled={readOnly} />
        ) : null}
      </div>

      {form.kind === 'video' ? (
        <VideoUploadField
          value={form.upload} error={errors.upload} disabled={readOnly} onBusyChange={onBusyChange}
          onChange={(upload) => setForm((current) => ({
            ...current, upload,
            ...(upload?.durationSeconds ? { durationMinutes: String(Math.max(1, Math.round(upload.durationSeconds / 60))) } : {}),
          }))}
        />
      ) : null}
      {form.kind === 'file' ? (
        <FieldWrapper label="Archivo" required error={errors.upload}>
          <FileUploader
            value={fileValue} maxSizeMB={10} disabled={readOnly || uploadFile.isPending} onUpload={uploadDocument} onChange={set('upload')}
            hint="PDF, presentación u hoja de cálculo, máximo 10 MB."
          />
        </FieldWrapper>
      ) : null}
      {form.kind === 'embed' ? (
        <TextField
          label="Enlace del video" required type="url" value={form.embedUrl} onChange={setText('embedUrl')} error={errors.embedUrl} disabled={readOnly}
          placeholder="https://www.youtube.com/watch?v=…" hint="YouTube, Vimeo u otro reproductor con https. Usa videos no listados para contenido interno."
        />
      ) : null}

      <MarkdownField
        label={bodyCopy.label} required={bodyCopy.required} value={form.body} onChange={setText('body')} error={errors.body}
        hint={bodyCopy.hint} placeholder={bodyCopy.placeholder} maxLength={200000} disabled={readOnly} className={bodyCopy.size}
      />

      {form.kind === 'quiz' ? (
        <>
          <QuizSettingsFields value={form.settings} onChange={setSetting} errors={errors.settings} disabled={readOnly} />
          {lesson?.id && lesson.kind === 'quiz' ? (
            <QuizQuestionsEditor lessonId={lesson.id} readOnly={readOnly} onDirtyChange={onQuestionsDirtyChange} />
          ) : (
            <p className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3 text-sm text-[hsl(var(--muted-foreground))]">
              Guarda la lección para agregar las preguntas del examen aquí mismo.
            </p>
          )}
        </>
      ) : null}
      {form.kind === 'assignment' ? <AssignmentSettingsFields value={form.settings} onChange={setSetting} errors={errors.settings} disabled={readOnly} /> : null}

      <div className="grid grid-cols-1 gap-4 border-t border-[hsl(var(--border))] pt-4 sm:grid-cols-2">
        {form.kind === 'quiz' ? null : form.kind === 'video' && form.upload?.durationSeconds ? (
          <p className="self-center text-sm text-[hsl(var(--muted-foreground))]">Duración del video: {formatDuration(form.upload.durationSeconds)}</p>
        ) : (
          <NumberField
            label={form.kind === 'assignment' ? 'Tiempo estimado (minutos)' : 'Duración (minutos)'} value={form.durationMinutes} onChange={setText('durationMinutes')}
            allowNegative={false} allowDecimal={false} hint="Opcional. Se muestra al alumno en el contenido del curso." disabled={readOnly}
          />
        )}
        <CheckboxField
          label="Obligatoria" hint="Las lecciones opcionales no cuentan para el avance ni bloquean las siguientes." disabled={readOnly}
          checked={form.required} onChange={(event) => set('required')(event.target.checked)}
        />
      </div>
    </div>
  )
}
