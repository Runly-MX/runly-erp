import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AdvancedFileViewer, Button, CheckboxField, DEFAULT_SWATCHES, EmptyState, ErrorState, FieldWrapper, FileUploader, Skeleton, SwatchField, TextField, TextareaField,
} from '@runly/ui'
import { FileText, Loader2, Maximize2 } from 'lucide-react'
import { useUploadLmsFile } from '../../hooks/useLmsData.js'
import { useLmsFileViewer } from '../../hooks/useLmsFileViewer.js'
import { useSaveCertificateTemplate, useTemplatePreview } from '../../hooks/useLmsCerts.js'
import { CERT_PLACEHOLDERS, DEFAULT_CERT_BODY, DEFAULT_CERT_TITLE, insertPlaceholder } from '../../lib/lmsCert.js'
import { FormSheet } from '../shared.jsx'

const HEX = /^#[0-9a-fA-F]{6}$/
const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'Máximo 120 caracteres.'),
  title: z.string().trim().min(1, 'El título es obligatorio.').max(200, 'Máximo 200 caracteres.'),
  body: z.string().max(2000, 'Máximo 2000 caracteres.'),
  signerName: z.string().max(120, 'Máximo 120 caracteres.'),
  signerTitle: z.string().max(120, 'Máximo 120 caracteres.'),
  accentColor: z.string().trim().refine((value) => !value || HEX.test(value), 'Usa un color hexadecimal, por ejemplo #4f46e5.'),
  showLogo: z.boolean(),
})

const toValues = (template) => ({
  name: template?.name ?? '', title: template?.title ?? DEFAULT_CERT_TITLE, body: template?.body ?? DEFAULT_CERT_BODY,
  signerName: template?.signerName ?? '', signerTitle: template?.signerTitle ?? '',
  accentColor: template?.accentColor ?? '', showLogo: template?.showLogo ?? true,
})

export function PreviewPane({ template }) {
  const preview = useTemplatePreview(template?.id, template?.updatedAt)
  const viewer = useLmsFileViewer()
  if (!template?.id) {
    return <EmptyState icon={FileText} title="Sin vista previa" description="Guarda la plantilla para ver cómo queda el certificado con datos de ejemplo." />
  }
  if (preview.error) return <ErrorState title="No se pudo generar la vista previa" description={preview.error.message} showReport={false} />
  if (!preview.url) return <Skeleton className="aspect-[11/8.5] w-full rounded-md" />
  const enlarge = () => viewer.open([{ key: `preview-${template.id}-${preview.url}`, name: `Vista previa - ${template.name || 'certificado'}.pdf`, mimeType: 'application/pdf', url: preview.url }])
  return (
    <div className="space-y-2">
      <iframe
        title="Vista previa del certificado" src={preview.url}
        className="aspect-[11/8.5] w-full rounded-md border border-[hsl(var(--border))] bg-white"
      />
      <Button type="button" variant="outline" size="sm" onClick={enlarge}><Maximize2 />Ampliar vista previa</Button>
      <AdvancedFileViewer {...viewer.props} />
    </div>
  )
}

// Create / edit a certificate template. It stays open after saving so the
// PDF preview (rendered by the API with sample data) reflects the change.
export function CertificateTemplateSheet({ open, onOpenChange, template }) {
  const save = useSaveCertificateTemplate(), upload = useUploadLmsFile()
  const [current, setCurrent] = useState(template ?? null)
  const [signature, setSignature] = useState(null) // { fileId, name, url } once replaced or removed
  const bodyRef = useRef(null)
  const { control, handleSubmit, reset, getValues, setValue, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(schema), defaultValues: toValues(template),
  })

  useEffect(() => {
    if (!open) return
    setCurrent(template ?? null)
    setSignature(null)
    reset(toValues(template))
  }, [open, template?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Local object URL of a freshly uploaded signature: freed when replaced or closed.
  useEffect(() => () => { if (signature?.url) URL.revokeObjectURL(signature.url) }, [signature?.url])

  function addPlaceholder(key) {
    const element = bodyRef.current
    const { text, caret } = insertPlaceholder(getValues('body'), key, element?.selectionStart, element?.selectionEnd)
    setValue('body', text, { shouldDirty: true, shouldValidate: true })
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(caret, caret) })
  }

  async function uploadSignature(file) {
    const asset = await upload.mutateAsync({ file, entityType: 'LmsCertificateTemplate', entityId: current?.id })
    return { fileId: asset.id, name: asset.originalName ?? file.name, url: URL.createObjectURL(file) }
  }

  async function submit(values) {
    try {
      const saved = await save.mutateAsync({
        ...(current?.id ? { id: current.id } : {}),
        name: values.name.trim(), title: values.title.trim(), body: values.body.trim(),
        signerName: values.signerName.trim() || null, signerTitle: values.signerTitle.trim() || null,
        accentColor: values.accentColor.trim() || null, showLogo: values.showLogo,
        ...(signature ? { signatureFileId: signature.fileId ?? null } : {}),
      })
      if (saved?.id) { setCurrent(saved); reset(toValues(saved)); setSignature(null) }
    } catch { /* toast shown by the mutation */ }
  }

  const signatureValue = signature ? (signature.fileId ? { name: signature.name } : null) : (current?.signatureFileId ? { name: 'Firma actual' } : null)
  const signatureUrl = signature ? signature.url : current?.signatureUrl
  const dirty = isDirty || Boolean(signature)
  const text = (name, label, props = {}) => (
    <Controller name={name} control={control} render={({ field }) => <TextField label={label} {...field} error={errors[name]?.message} {...props} />} />
  )

  return (
    <FormSheet
      open={open} onOpenChange={onOpenChange} wide="xl"
      title={current?.id ? 'Editar plantilla' : 'Nueva plantilla'}
      description="Diseño del certificado que se emite al completar un curso."
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button type="submit" form="lms-cert-template-form" disabled={save.isPending || (Boolean(current?.id) && !dirty)}>
            {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {current?.id ? 'Guardar cambios' : 'Crear plantilla'}
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <form id="lms-cert-template-form" onSubmit={handleSubmit(submit)} className="space-y-4">
          {text('name', 'Nombre de la plantilla', { required: true, maxLength: 120, placeholder: 'Ej. Certificado general' })}
          {text('title', 'Título del certificado', { required: true, maxLength: 200 })}
          <Controller name="body" control={control} render={({ field }) => (
            <TextareaField
              label="Texto" rows={5} maxLength={2000} {...field}
              ref={(element) => { field.ref(element); bodyRef.current = element }}
              error={errors.body?.message} hint="Los campos entre llaves se reemplazan al emitir el certificado."
            />
          )} />
          <div className="flex flex-wrap gap-1.5" aria-label="Insertar campo">
            {CERT_PLACEHOLDERS.map((item) => (
              <Button key={item.key} type="button" variant="outline" size="sm" className="rounded-md font-mono" onClick={() => addPlaceholder(item.key)}>
                {`{{${item.key}}}`}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {text('signerName', 'Nombre de quien firma', { placeholder: 'Ej. Ana López' })}
            {text('signerTitle', 'Cargo', { placeholder: 'Ej. Directora de Capacitación' })}
          </div>
          <FieldWrapper label="Firma" hint="Imagen PNG o JPEG con fondo transparente o blanco.">
            {signatureUrl ? <img src={signatureUrl} alt="Firma" className="h-16 max-w-56 rounded-md border border-[hsl(var(--border))] bg-white object-contain p-1" /> : null}
            <FileUploader
              value={signatureValue} accept="image/png,image/jpeg" maxSizeMB={2} disabled={upload.isPending}
              onUpload={uploadSignature} onChange={(next) => setSignature(next ?? { fileId: null, name: null, url: null })}
              hint="Máximo 2 MB." emptyLabel="Subir firma"
            />
          </FieldWrapper>
          <Controller name="accentColor" control={control} render={({ field }) => (
            <div className="space-y-2">
              <SwatchField
                label="Color de acento" value={field.value} onChange={field.onChange}
                swatches={HEX.test(field.value) && !DEFAULT_SWATCHES.includes(field.value) ? [...DEFAULT_SWATCHES, field.value] : DEFAULT_SWATCHES}
              />
              <TextField
                label="Color personalizado" value={field.value} onChange={field.onChange} onBlur={field.onBlur} maxLength={7}
                placeholder="Color de la marca" error={errors.accentColor?.message} hint="Déjalo vacío para usar el color de la empresa."
              />
            </div>
          )} />
          <Controller name="showLogo" control={control} render={({ field }) => (
            <CheckboxField label="Mostrar logotipo" hint="Usa el logotipo de la empresa (PNG o JPEG)." checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />
          )} />
        </form>
        <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p className="text-sm font-medium">Vista previa</p>
          <PreviewPane template={current} />
          {current?.id && dirty ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Guarda los cambios para actualizar la vista previa.</p> : null}
        </div>
      </div>
    </FormSheet>
  )
}
