import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckboxField, FieldWrapper, FileUploader, FormSaveBar, MarkdownField, NumberField, SelectField, TextField, TextareaField } from '@runly/ui'
import { useUpdateCourse, useUploadLmsFile } from '../hooks/useLmsData.js'
import { useCertificateTemplates } from '../hooks/useLmsCerts.js'
import { NO_TEMPLATE } from '../lib/lmsCert.js'
import { LEVEL_LABELS, toOptions } from '../lib/lmsLabels.js'
import { NO_PROMO, promoLessonOptions } from '../lib/lmsShare.js'

const LEVEL_OPTIONS = toOptions(LEVEL_LABELS)

const schema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio.').max(200, 'Máximo 200 caracteres.'),
  summary: z.string().max(500, 'Máximo 500 caracteres.'),
  description: z.string().max(20000, 'El texto es demasiado largo.'),
  category: z.string().max(100, 'Máximo 100 caracteres.'),
  level: z.enum(['basic', 'intermediate', 'advanced']),
  estimatedMinutes: z.string().regex(/^\d*$/, 'Escribe minutos enteros.').refine((value) => !value || Number(value) <= 10000, 'Escribe de 0 a 10000 minutos.'),
  sequential: z.boolean(),
  selfEnroll: z.boolean(),
  certificateTemplateId: z.string(),
  promoLessonId: z.string(),
})

const toValues = (course) => ({
  title: course?.title ?? '', summary: course?.summary ?? '', description: course?.description ?? '',
  category: course?.category ?? '', level: course?.level ?? 'basic',
  estimatedMinutes: course?.estimatedMinutes ? String(course.estimatedMinutes) : '',
  sequential: Boolean(course?.sequential), selfEnroll: Boolean(course?.selfEnroll),
  certificateTemplateId: course?.certificateTemplateId ?? NO_TEMPLATE,
  promoLessonId: course?.promoLessonId ?? NO_PROMO,
})

// Configuración tab: metadata, cover and flags of a course. `sections` feeds the
// promo video select (free or preview video/embed lessons).
export function CourseSettingsForm({ course, sections = [], readOnly = false }) {
  const update = useUpdateCourse('Configuración guardada.'), upload = useUploadLmsFile()
  const templates = useCertificateTemplates()
  // Enabled templates plus the current one even when it was disabled later.
  const certificateOptions = useMemo(() => [
    { value: NO_TEMPLATE, label: 'Sin certificado' },
    ...(templates.data ?? [])
      .filter((t) => t.enabled !== false || t.id === course.certificateTemplateId)
      .map((t) => ({ value: t.id, label: t.enabled === false ? `${t.name} (desactivada)` : t.name })),
    ...(course.certificateTemplateId && !(templates.data ?? []).some((t) => t.id === course.certificateTemplateId)
      ? [{ value: course.certificateTemplateId, label: 'Plantilla actual' }] : []),
  ], [templates.data, course.certificateTemplateId])
  const promoOptions = useMemo(() => promoLessonOptions(sections), [sections])
  const [cover, setCover] = useState(null) // { fileId, name, url } once a new cover is uploaded or removed
  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: toValues(course) })
  // Re-seed only when another course or a newer version arrives: a refetch that
  // just re-signs the cover URL must not wipe unsaved edits.
  useEffect(() => { reset(toValues(course)); setCover(null) }, [course.id, course.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadCover(file) {
    const asset = await upload.mutateAsync({ file, entityType: 'LmsCourse', entityId: course.id })
    return { fileId: asset.id, name: asset.originalName ?? file.name, url: URL.createObjectURL(file) }
  }

  async function submit(values) {
    try {
      await update.mutateAsync({
        id: course.id,
        title: values.title.trim(), summary: values.summary.trim() || null, description: values.description.trim() || null,
        category: values.category.trim() || null, level: values.level,
        estimatedMinutes: values.estimatedMinutes ? Number(values.estimatedMinutes) : null,
        sequential: values.sequential, selfEnroll: values.selfEnroll,
        certificateTemplateId: values.certificateTemplateId === NO_TEMPLATE ? null : values.certificateTemplateId,
        promoLessonId: values.promoLessonId === NO_PROMO ? null : values.promoLessonId,
        ...(cover ? { coverFileId: cover.fileId ?? null } : {}),
      })
    } catch { /* toast shown by the mutation */ }
  }

  const coverValue = cover ? (cover.fileId ? { name: cover.name } : null) : (course.coverFileId ? { name: 'Portada actual' } : null)
  const coverUrl = cover ? cover.url : course.coverUrl
  const dirty = isDirty || Boolean(cover)
  const text = (name, label, props = {}) => (
    <Controller name={name} control={control} render={({ field }) => <TextField label={label} {...field} error={errors[name]?.message} disabled={readOnly} {...props} />} />
  )

  return (
    <form onSubmit={handleSubmit(submit)} className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {text('title', 'Título', { required: true, maxLength: 200 })}
        <Controller name="summary" control={control} render={({ field }) => <TextareaField label="Resumen" rows={2} {...field} error={errors.summary?.message} disabled={readOnly} hint="Se muestra en la tarjeta del curso." />} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {text('category', 'Categoría', { placeholder: 'Ej. Seguridad' })}
          <Controller name="level" control={control} render={({ field }) => <SelectField label="Nivel" options={LEVEL_OPTIONS} value={field.value} onValueChange={field.onChange} disabled={readOnly} />} />
          <Controller name="estimatedMinutes" control={control} render={({ field }) => <NumberField label="Duración estimada (min)" {...field} allowNegative={false} allowDecimal={false} min={0} max={10000} error={errors.estimatedMinutes?.message} disabled={readOnly} />} />
        </div>
        <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
          <Controller name="sequential" control={control} render={({ field }) => (
            <CheckboxField label="Orden secuencial" hint="Cada lección se desbloquea al completar las obligatorias anteriores." checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={readOnly} />
          )} />
          <Controller name="selfEnroll" control={control} render={({ field }) => (
            <CheckboxField label="Inscripción libre" hint="El curso publicado aparece en el catálogo y cualquiera con acceso a Aprendizaje puede inscribirse." checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={readOnly} />
          )} />
        </div>
      </div>
      <div className="space-y-4">
        <FieldWrapper label="Portada">
          {coverUrl ? <img src={coverUrl} alt="Portada del curso" className="aspect-video w-full rounded-xl object-cover" /> : null}
          <FileUploader
            value={coverValue} accept="image/*" maxSizeMB={10} disabled={readOnly || upload.isPending}
            onUpload={uploadCover} onChange={(next) => setCover(next ?? { fileId: null, name: null, url: null })}
            hint="Imagen horizontal (16:9), máximo 10 MB." emptyLabel="Subir portada"
          />
        </FieldWrapper>
        <Controller name="promoLessonId" control={control} render={({ field }) => (
          <SelectField
            label="Video de presentación" options={promoOptions} value={promoOptions.some((o) => o.value === field.value) ? field.value : NO_PROMO}
            onValueChange={field.onChange} disabled={readOnly}
            hint="Se muestra en la página del curso. Solo aparecen lecciones de video o enlace en una sección gratis o marcadas como vista previa."
          />
        )} />
        <Controller name="certificateTemplateId" control={control} render={({ field }) => (
          <SelectField
            label="Certificado" options={certificateOptions} value={field.value} onValueChange={field.onChange} disabled={readOnly}
            hint="Se emite automáticamente al completar el curso. Las plantillas se administran en Certificados."
          />
        )} />
      </div>
      <Controller name="description" control={control} render={({ field }) => (
        <MarkdownField
          label="Descripción" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={errors.description?.message}
          disabled={readOnly} maxLength={20000} placeholder="Qué aprenderá el alumno, a quién va dirigido y cómo está organizado el curso…"
          hint="Se muestra en la página del curso. Usa la barra para dar formato: títulos, listas, tablas y enlaces."
          className="lg:col-span-2 [&_.mdxeditor-root-contenteditable]:min-h-[22rem]!"
        />
      )} />
      {!readOnly ? (
        <FormSaveBar
          dock dirty={dirty} submitting={update.isPending} submitLabel="Guardar cambios" cancelLabel="Descartar"
          onCancel={() => { reset(toValues(course)); setCover(null) }} className="lg:col-span-2"
        />
      ) : null}
    </form>
  )
}
