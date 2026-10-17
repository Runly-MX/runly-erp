import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState } from '@runly/ui'
import { Eye, FileWarning, Loader2, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { useCertificateTemplateFile, useLayoutPreview, useSaveCertificateLayout, useSuggestCertificateLayout } from '../../hooks/useLmsCertPdf.js'
import { defaultField, fieldLabel, sameLayout, upsertField } from '../../lib/certLayout.js'
import { FormSheet } from '../shared.jsx'
import { PdfFieldPanel } from './PdfFieldPanel.jsx'
import { PdfLayoutCanvas } from './PdfLayoutCanvas.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const HEX = /^#[0-9a-f]{6}$/i

function PreviewDialog({ url, onClose }) {
  return (
    <Dialog open={Boolean(url)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="2xl">
        <DialogHeader icon={Eye}>
          <DialogTitle>Vista previa</DialogTitle>
          <DialogDescription>Certificado con datos de ejemplo y los campos tal como están en el editor (sin guardar).</DialogDescription>
        </DialogHeader>
        {url ? <iframe title="Vista previa del certificado" src={url} className="aspect-[11/8.5] w-full rounded-md border border-[hsl(var(--border))] bg-white" /> : null}
      </DialogContent>
    </Dialog>
  )
}

// Visual field editor of a PDF certificate template: the first page with a
// draggable box per field, a side panel with the field list and properties,
// "Detectar campos", a sample-data preview and Guardar.
export function PdfLayoutEditor({ open, onOpenChange, template }) {
  const file = useCertificateTemplateFile(open ? template : null)
  const save = useSaveCertificateLayout(), detect = useSuggestCertificateLayout(), preview = useLayoutPreview()
  const [fields, setFields] = useState([])
  const [selectedKey, setSelectedKey] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const page = template?.layout?.page ?? null
  const saved = template?.layout?.fields ?? []

  useEffect(() => {
    if (!open) return
    setFields(template?.layout?.fields ?? [])
    setSelectedKey(null)
  }, [open, template?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const dirty = !sameLayout(fields, saved)
  const invalidColor = fields.some((f) => f.color && !HEX.test(f.color))
  const change = (field) => setFields((current) => upsertField(current, field))
  const remove = (key) => { setFields((current) => current.filter((f) => f.key !== key)); setSelectedKey((k) => (k === key ? null : k)) }
  const add = (key) => { change(defaultField(key, page)); setSelectedKey(key) }

  async function runDetect() {
    try {
      const result = await detect.mutateAsync(template.id)
      const found = result?.fields ?? []
      setFields((current) => found.reduce((list, field) => upsertField(list, field), current))
      const missing = (result?.missing ?? []).map(fieldLabel)
      const qr = result?.defaulted?.includes('qr') ? ' El código QR se colocó en la esquina inferior derecha.' : ''
      if (!result?.matched?.length) toast.warning(`No se reconoció ningún campo en el PDF; agrégalos desde el panel.${qr}`)
      else toast.success(`Se detectaron ${result.matched.length} ${result.matched.length === 1 ? 'campo' : 'campos'}.${qr}${missing.length ? ` Faltan: ${missing.join(', ')}.` : ''}`)
    } catch { /* toast shown by the mutation */ }
  }

  async function openPreview() {
    try {
      const blob = await preview.mutateAsync({ id: template.id, fields })
      setPreviewUrl(URL.createObjectURL(blob))
    } catch { /* toast shown by the mutation */ }
  }

  async function submit() {
    try { await save.mutateAsync({ id: template.id, fields }) } catch { /* toast shown by the mutation */ }
  }

  if (!template) return null

  return (
    <FormSheet
      open={open} onOpenChange={onOpenChange} wide="xl"
      title={`Campos de «${template.name}»`}
      description="Arrastra cada campo a su lugar sobre tu certificado. Las medidas se guardan en puntos del PDF."
      footer={(
        <>
          <Button variant="outline" className="mr-auto" onClick={runDetect} disabled={detect.isPending || !page}>
            {detect.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <ScanSearch />}Detectar campos
          </Button>
          <Button variant="outline" onClick={openPreview} disabled={preview.isPending || invalidColor || !page}>
            {preview.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Eye />}Vista previa
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={submit} disabled={save.isPending || !dirty || invalidColor}>
            {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar
          </Button>
        </>
      )}
    >
      {!page ? (
        <EmptyState icon={FileWarning} title="Falta el tamaño de página" description="Vuelve a subir el PDF de la plantilla con «Reemplazar archivo»." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-2 pt-4">
            <PdfLayoutCanvas
              file={file.data ?? null} page={page} fields={fields} selectedKey={selectedKey}
              onSelect={setSelectedKey} onChange={change} onRemove={remove}
            />
            {file.isError ? <p className="text-xs text-[hsl(var(--destructive))]">{file.error?.message || 'No se pudo cargar el PDF.'}</p> : null}
            <p className={MUTED}>
              Página de {Math.round(page.width)} × {Math.round(page.height)} pt. {dirty ? 'Hay cambios sin guardar.' : 'Sin cambios.'}
            </p>
          </div>
          <div className="lg:sticky lg:top-0 lg:self-start">
            <PdfFieldPanel
              page={page} fields={fields} selectedKey={selectedKey}
              onSelect={setSelectedKey} onAdd={add} onRemove={remove} onChange={change}
            />
          </div>
        </div>
      )}
      <PreviewDialog url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </FormSheet>
  )
}
