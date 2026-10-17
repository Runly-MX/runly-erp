import { useEffect, useState } from 'react'
import { Button, DistDropZone, TextField } from '@runly/ui'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDownloadCertificateDocx, useReplaceCertificateTemplateFile, useUploadCertificateDocx } from '../../hooks/useLmsCertDocx.js'
import { isDocxFile } from '../../lib/lmsCert.js'
import { FormSheet } from '../shared.jsx'
import { DocxWarnings } from './DocxTemplateNotes.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Uploads a new Word certificate template, or replaces the file of `template`.
// With warnings the template is saved and the sheet stays open to show them.
export function DocxUploadSheet({ open, onOpenChange, template = null, onUploaded }) {
  const replacing = Boolean(template?.id)
  const upload = useUploadCertificateDocx(), replace = useReplaceCertificateTemplateFile(), sample = useDownloadCertificateDocx()
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [warnings, setWarnings] = useState([])
  const busy = upload.isPending || replace.isPending

  useEffect(() => {
    if (!open) return
    setFile(null)
    setName('')
    setWarnings([])
  }, [open, template?.id])

  function pick(next) {
    if (!isDocxFile(next)) { toast.error('Sube un archivo de Word (.docx).'); return }
    setFile(next)
    setWarnings([])
    if (!replacing) setName((current) => current || next.name.replace(/\.docx$/i, '').slice(0, 120))
  }

  async function submit() {
    try {
      const saved = replacing
        ? await replace.mutateAsync({ id: template.id, file })
        : await upload.mutateAsync({ file, name: name.trim() })
      const list = saved?.warnings ?? []
      if (list.length) {
        setWarnings(list)
        setFile(null)
        toast.warning(replacing ? 'Archivo reemplazado con advertencias.' : 'Plantilla guardada con advertencias.')
      } else {
        toast.success(replacing ? `«${template.name}» actualizada.` : 'Plantilla guardada.')
        onOpenChange(false)
      }
      onUploaded?.(saved)
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <FormSheet
      open={open} onOpenChange={onOpenChange}
      title={replacing ? `Reemplazar «${template.name}»` : 'Subir plantilla de Word'}
      description={replacing
        ? 'Sube la versión editada. Se conservan el nombre, la configuración y los cursos que la usan.'
        : 'Usa el formato de certificado de tu empresa. Las etiquetas {{…}} se llenan al emitir cada certificado.'}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{warnings.length ? 'Cerrar' : 'Cancelar'}</Button>
          <Button onClick={submit} disabled={busy || !file || (!replacing && !name.trim())}>
            {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            {replacing ? 'Reemplazar archivo' : 'Subir plantilla'}
          </Button>
        </>
      )}
    >
      <DistDropZone
        accept=".docx" maxSizeMB={10} file={file} onFile={pick} onClear={() => setFile(null)} isUploading={busy}
        emptyLabel={replacing ? 'Arrastra la plantilla editada (.docx)' : 'Arrastra tu certificado de Word (.docx)'}
      />
      {!replacing ? (
        <TextField label="Nombre" required value={name} maxLength={120} placeholder="Ej. Constancia de capacitación" onChange={(e) => setName(e.target.value)} />
      ) : null}
      <DocxWarnings list={warnings} />
      {warnings.length ? (
        <p className={MUTED}>La plantilla se guardó. Corrige las etiquetas en Word y vuelve a subirla, o usa «Sugerir etiquetas» si tu formato aún no tiene ninguna.</p>
      ) : (
        <div className="space-y-2 rounded-md border border-[hsl(var(--border))] px-3 py-2.5">
          <p className={MUTED}>
            ¿Tu formato aún no tiene etiquetas? Súbelo tal cual y usa «Sugerir etiquetas»: Runly reconoce campos como Nombre, Otorga a, Curso, Fecha, Folio u Horas y te da una copia para revisar.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => sample.mutate({})} disabled={sample.isPending}>
            <Download />Descargar ejemplo
          </Button>
        </div>
      )}
    </FormSheet>
  )
}
