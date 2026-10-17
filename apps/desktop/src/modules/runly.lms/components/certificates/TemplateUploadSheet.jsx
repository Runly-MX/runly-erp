import { useEffect, useState } from 'react'
import { Button, DistDropZone, TextField } from '@runly/ui'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDownloadCertificateDocx, useReplaceCertificateTemplateFile, useUploadCertificateTemplate } from '../../hooks/useLmsCertDocx.js'
import { fileFormat, formatInfo } from '../../lib/lmsCert.js'
import { FormSheet } from '../shared.jsx'
import { DocxWarnings } from './DocxTemplateNotes.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

const HELP = {
  docx: '¿Tu formato aún no tiene etiquetas? Súbelo tal cual y usa «Sugerir etiquetas»: Runly reconoce campos como Nombre, Otorga a, Curso, Fecha, Folio u Horas y te da una copia para revisar.',
  pptx: '¿Tu diapositiva aún no tiene etiquetas? Súbela tal cual y usa «Sugerir etiquetas»: Runly reconoce textos como «NOMBRE DEL ALUMNO», [Curso], Fecha o Folio y te da una copia para revisar. Las imágenes ({{%qr}}, {{%firma}}, {{%logo}}) van solas en su propio cuadro de texto.',
  pdf: 'Sube el certificado de tu empresa en PDF (se usa la primera página). Runly detecta dónde van el nombre, el curso, la fecha o el folio y después puedes acomodar cada campo en el editor visual.',
}

// Uploads a new certificate template (Word, PowerPoint or PDF), or replaces
// the file of `template` (same format). With warnings the template is saved
// and the sheet stays open to show them.
export function TemplateUploadSheet({ open, onOpenChange, template = null, format: newFormat = 'docx', onUploaded }) {
  const replacing = Boolean(template?.id)
  const format = replacing ? template.source : newFormat
  const info = formatInfo(format)
  const upload = useUploadCertificateTemplate(), replace = useReplaceCertificateTemplateFile(), sample = useDownloadCertificateDocx()
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [warnings, setWarnings] = useState([])
  const busy = upload.isPending || replace.isPending

  useEffect(() => {
    if (!open) return
    setFile(null)
    setName('')
    setWarnings([])
  }, [open, template?.id, format])

  function pick(next) {
    if (fileFormat(next) !== format) { toast.error(`Sube un ${info.noun}.`); return }
    setFile(next)
    setWarnings([])
    if (!replacing) setName((current) => current || next.name.replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120))
  }

  async function submit() {
    try {
      const saved = replacing
        ? await replace.mutateAsync({ id: template.id, file })
        : await upload.mutateAsync({ file, name: name.trim() })
      const list = saved?.warnings ?? []
      // A new PDF goes straight to the field editor, which shows its own hints.
      if (list.length && !(format === 'pdf' && !replacing)) {
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
      title={replacing ? `Reemplazar «${template.name}»` : `Subir plantilla de ${info.app}`}
      description={replacing
        ? 'Sube la versión editada. Se conservan el nombre, la configuración y los cursos que la usan.'
        : format === 'pdf'
          ? 'Usa el certificado de tu empresa como fondo. Los datos se dibujan encima en las posiciones que elijas.'
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
        accept={info.ext} maxSizeMB={10} file={file} onFile={pick} onClear={() => setFile(null)} isUploading={busy}
        emptyLabel={replacing ? `Arrastra la plantilla editada (${info.ext})` : `Arrastra tu certificado (${info.ext})`}
      />
      {!replacing ? (
        <TextField label="Nombre" required value={name} maxLength={120} placeholder="Ej. Constancia de capacitación" onChange={(e) => setName(e.target.value)} />
      ) : null}
      <DocxWarnings list={warnings} />
      {warnings.length ? (
        <p className={MUTED}>
          {format === 'pdf'
            ? 'La plantilla se guardó. Abre el editor de campos para colocar los datos del certificado.'
            : `La plantilla se guardó. Corrige las etiquetas en ${info.app} y vuelve a subirla, o usa «Sugerir etiquetas» si tu formato aún no tiene ninguna.`}
        </p>
      ) : (
        <div className="space-y-2 rounded-md border border-[hsl(var(--border))] px-3 py-2.5">
          <p className={MUTED}>{HELP[format]}</p>
          {format !== 'pdf' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => sample.mutate({ format })} disabled={sample.isPending}>
              <Download />Descargar ejemplo
            </Button>
          ) : null}
        </div>
      )}
    </FormSheet>
  )
}
