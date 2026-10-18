import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Badge, Button, CheckboxField, FieldWrapper, FileUploader, TextField } from '@runly/ui'
import { Download, FilePenLine, FileText, LayoutTemplate, Loader2, RefreshCw, WandSparkles } from 'lucide-react'
import { useUploadLmsFile } from '../../hooks/useLmsData.js'
import { useSaveCertificateTemplate } from '../../hooks/useLmsCerts.js'
import { useDownloadCertificateDocx } from '../../hooks/useLmsCertDocx.js'
import { useLmsOffice } from '../../hooks/useLmsOffice.js'
import { docxTagText, formatInfo, isPdfTemplate } from '../../lib/lmsCert.js'
import { fieldLabel } from '../../lib/certLayout.js'
import { FormSheet } from '../shared.jsx'
import { PreviewPane } from './CertificateTemplateSheet.jsx'
import { CertDocxReference, DocxWarnings, OfficeNotice } from './DocxTemplateNotes.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'Máximo 120 caracteres.'),
  signerName: z.string().max(120, 'Máximo 120 caracteres.'),
  showLogo: z.boolean(),
})
const toValues = (t) => ({ name: t?.name ?? '', signerName: t?.signerName ?? '', showLogo: t?.showLogo ?? true })

// Settings of an uploaded certificate template (Word, PowerPoint or PDF): file
// actions, detected tags or placed fields, the data its image and instructor
// fields use, and a PDF preview with sample data.
export function TemplateFileSheet({ open, onOpenChange, template, officeAvailable, onReplace, onSuggest, onEditLayout }) {
  const save = useSaveCertificateTemplate(), upload = useUploadLmsFile(), download = useDownloadCertificateDocx()
  const office = useLmsOffice()
  const [signature, setSignature] = useState(null) // { fileId, name, url } once replaced or removed
  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: toValues(template) })

  useEffect(() => {
    if (!open) return
    setSignature(null)
    reset(toValues(template))
  }, [open, template?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (signature?.url) URL.revokeObjectURL(signature.url) }, [signature?.url])

  async function uploadSignature(file) {
    const asset = await upload.mutateAsync({ file, entityType: 'LmsCertificateTemplate', entityId: template?.id })
    return { fileId: asset.id, name: asset.originalName ?? file.name, url: URL.createObjectURL(file) }
  }

  async function submit(values) {
    try {
      const saved = await save.mutateAsync({
        id: template.id, name: values.name.trim(), signerName: values.signerName.trim() || null, showLogo: values.showLogo,
        ...(signature ? { signatureFileId: signature.fileId ?? null } : {}),
      })
      if (saved?.id) { reset(toValues(saved)); setSignature(null) }
    } catch { /* toast shown by the mutation */ }
  }

  if (!template) return null
  const pdf = isPdfTemplate(template)
  const info = formatInfo(template.source)
  const tags = template.placeholders ?? []
  const fields = template.layout?.fields ?? []
  const fill = (tag, label) => (pdf ? `Llena el campo ${label}.` : `Llena ${tag}.`)
  const dirty = isDirty || Boolean(signature)
  const signatureValue = signature ? (signature.fileId ? { name: signature.name } : null) : (template.signatureFileId ? { name: 'Firma actual' } : null)
  const signatureUrl = signature ? signature.url : template.signatureUrl

  return (
    <FormSheet
      open={open} onOpenChange={onOpenChange} wide="xl"
      title={pdf ? 'Plantilla PDF' : `Plantilla de ${info.app}`}
      description={pdf
        ? 'Certificado con el PDF de tu empresa de fondo. Los campos se dibujan encima al emitir cada certificado.'
        : 'Certificado con el formato de tu empresa. Las etiquetas se llenan al emitir cada certificado.'}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button type="submit" form="lms-cert-docx-form" disabled={save.isPending || !dirty}>
            {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            Guardar cambios
          </Button>
        </>
      )}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {pdf ? (
            <div className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm font-medium">Archivo PDF</p>
                <Badge variant="outline" className="ml-auto">{fields.length} {fields.length === 1 ? 'campo' : 'campos'}</Badge>
              </div>
              {fields.length ? (
                <div className="flex flex-wrap gap-1">
                  {fields.map((f) => <span key={f.key} className="rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{fieldLabel(f.key)}</span>)}
                </div>
              ) : <p className={MUTED}>Aún no hay campos. Ábrelos en el editor y usa «Detectar campos» o agrégalos a mano.</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onEditLayout(template)}><LayoutTemplate />Editar campos</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => download.mutate({ id: template.id, name: template.name, format: 'pdf' })} disabled={download.isPending}>
                  <Download />Descargar PDF
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onReplace(template)}><RefreshCw />Reemplazar archivo</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-[hsl(var(--border))] p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm font-medium">Archivo de {info.app}</p>
                <Badge variant="outline" className="ml-auto">{tags.length} {tags.length === 1 ? 'etiqueta' : 'etiquetas'}</Badge>
              </div>
              {tags.length ? (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => <code key={tag} className="rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 font-mono text-xs">{docxTagText(tag)}</code>)}
                </div>
              ) : <p className={MUTED}>El archivo aún no tiene etiquetas. Usa «Sugerir etiquetas» para colocarlas en tu formato.</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => download.mutate({ id: template.id, name: template.name, format: template.source })} disabled={download.isPending}>
                  <Download />Descargar para editar
                </Button>
                {office.enabled && template.fileAssetId ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => office.open(template.fileAssetId)}
                    title={`Editar en ${info.app} en línea; al guardar se vuelven a leer las etiquetas.`}>
                    <FilePenLine />Abrir en Office
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" onClick={() => onReplace(template)}><RefreshCw />Reemplazar archivo</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onSuggest(template)} disabled={tags.length > 0}
                  title={tags.length ? `La plantilla ya tiene etiquetas; edítala en ${info.app}.` : 'Colocar etiquetas en tu propio formato'}>
                  <WandSparkles />Sugerir etiquetas
                </Button>
              </div>
            </div>
          )}
          <DocxWarnings list={template.warnings ?? []} />
          <form id="lms-cert-docx-form" onSubmit={handleSubmit(submit)} className="space-y-4">
            <Controller name="name" control={control} render={({ field }) => (
              <TextField label="Nombre de la plantilla" required maxLength={120} {...field} error={errors.name?.message} />
            )} />
            <Controller name="signerName" control={control} render={({ field }) => (
              <TextField label="Instructor o quien firma" maxLength={120} placeholder="Ej. Ana López" {...field} error={errors.signerName?.message}
                hint={`${fill('{{instructor}}', 'Instructor')} Vacío: se usa quien creó el curso.`} />
            )} />
            <FieldWrapper label="Firma" hint={`${fill('{{%firma}}', 'Firma')} Imagen PNG o JPEG con fondo transparente o blanco.`}>
              {signatureUrl ? <img src={signatureUrl} alt="Firma" className="h-16 max-w-56 rounded-md border border-[hsl(var(--border))] bg-white object-contain p-1" /> : null}
              <FileUploader
                value={signatureValue} accept="image/png,image/jpeg" maxSizeMB={2} disabled={upload.isPending}
                onUpload={uploadSignature} onChange={(next) => setSignature(next ?? { fileId: null, name: null, url: null })}
                hint="Máximo 2 MB." emptyLabel="Subir firma"
              />
            </FieldWrapper>
            <Controller name="showLogo" control={control} render={({ field }) => (
              <CheckboxField label="Usar el logotipo de la empresa" hint={`${fill('{{%logo}}', 'Logotipo')} PNG o JPEG.`} checked={field.value} onChange={(event) => field.onChange(event.target.checked)} />
            )} />
          </form>
          {pdf ? null : <CertDocxReference format={template.source} />}
        </div>
        <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
          <p className="text-sm font-medium">Vista previa con datos de ejemplo</p>
          {officeAvailable || pdf ? null : <OfficeNotice />}
          <PreviewPane template={template} />
          {dirty ? <p className={MUTED}>Guarda los cambios para actualizar la vista previa.</p> : null}
        </div>
      </div>
    </FormSheet>
  )
}
