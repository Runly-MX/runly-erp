import { useEffect, useState } from 'react'
import { Button, CheckboxField, DistDropZone, TextField } from '@runly/ui'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDownloadCertificateDocx, useReplaceCertificateTemplateFile, useUploadCertificateTemplate } from '../../hooks/useLmsCertDocx.js'
import { fileFormat, formatInfo } from '../../lib/lmsCert.js'
import { FormSheet } from '../shared.jsx'
import { DocxWarnings } from './DocxTemplateNotes.jsx'
import { AutoDetectResult } from './AutoDetectResult.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

const HELP = {
  docx: '¿Tu formato aún no tiene etiquetas? Súbelo tal cual: Runly reconoce campos como Nombre, Otorga a, Curso, Fecha, Folio u Horas y coloca las etiquetas al subirlo. Si ya tiene etiquetas, se guarda sin cambios.',
  pptx: '¿Tu diapositiva aún no tiene etiquetas? Súbela tal cual: Runly reconoce textos como «NOMBRE DEL ALUMNO», [Curso], Fecha o Folio y coloca las etiquetas al subirla. Las imágenes ({{%qr}}, {{%firma}}, {{%logo}}) van solas en su propio cuadro de texto.',
  pdf: 'Sube el certificado de tu empresa en PDF (se usa la primera página). Runly detecta dónde van el nombre, el curso, la fecha o el folio y después puedes acomodar cada campo en el editor visual.',
}

// Uploads a new certificate template (Word, PowerPoint or PDF), or replaces
// the file of `template` (same format). A new file is auto-detected unless the
// author opts out: the sheet then stays open with what was recognized
// (onReview opens the tag list, onEditLayout the PDF field editor). With
// warnings the template is saved and the sheet stays open to show them.
export function TemplateUploadSheet({ open, onOpenChange, template = null, format: newFormat = 'docx', onUploaded, onReview, onEditLayout }) {
  const replacing = Boolean(template?.id)
  const format = replacing ? template.source : newFormat
  const info = formatInfo(format)
  const upload = useUploadCertificateTemplate(), replace = useReplaceCertificateTemplateFile(), sample = useDownloadCertificateDocx()
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [warnings, setWarnings] = useState([])
  const [autoTag, setAutoTag] = useState(true)
  const [result, setResult] = useState(null) // saved template with autoTag / autoLayout
  const busy = upload.isPending || replace.isPending

  useEffect(() => {
    if (!open) return
    setFile(null)
    setName('')
    setWarnings([])
    setAutoTag(true)
    setResult(null)
  }, [open, template?.id, format])

  function pick(next) {
    if (fileFormat(next) !== format) { toast.error(`Sube un ${info.noun}.`); return }
    setFile(next)
    setWarnings([])
    setResult(null)
    if (!replacing) setName((current) => current || next.name.replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120))
  }

  async function submit() {
    try {
      const saved = replacing
        ? await replace.mutateAsync({ id: template.id, file })
        : await upload.mutateAsync({ file, name: name.trim(), autoTag })
      const list = saved?.warnings ?? []
      if (!replacing && (saved?.autoTag?.saved || saved?.autoLayout)) {
        setResult(saved)
        setWarnings([])
        setFile(null)
        toast.success(saved.autoTag?.saved ? 'Plantilla guardada con etiquetas automáticas.' : 'Plantilla guardada.')
      } else if (list.length && !(format === 'pdf' && !replacing)) {
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>{warnings.length || result ? 'Cerrar' : 'Cancelar'}</Button>
          {result ? null : (
            <Button onClick={submit} disabled={busy || !file || (!replacing && !name.trim())}>
              {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {replacing ? 'Reemplazar archivo' : 'Subir plantilla'}
            </Button>
          )}
        </>
      )}
    >
      {result ? (
        <AutoDetectResult
          saved={result}
          downloading={sample.isPending}
          onDownload={() => sample.mutate({ id: result.id, name: result.name, format: result.source })}
          onReview={() => { onOpenChange(false); onReview?.(result) }}
          onEditLayout={() => { onOpenChange(false); onEditLayout?.(result) }}
        />
      ) : (
        <>
          <DistDropZone
            accept={info.ext} maxSizeMB={10} file={file} onFile={pick} onClear={() => setFile(null)} isUploading={busy}
            emptyLabel={replacing ? `Arrastra la plantilla editada (${info.ext})` : `Arrastra tu certificado (${info.ext})`}
          />
          {!replacing ? (
            <TextField label="Nombre" required value={name} maxLength={120} placeholder="Ej. Constancia de capacitación" onChange={(e) => setName(e.target.value)} />
          ) : null}
          {!replacing ? (
            <CheckboxField
              id="cert-auto-detect" checked={autoTag} onChange={(e) => setAutoTag(e.target.checked)}
              label={format === 'pdf' ? 'Detectar los campos automáticamente' : 'Colocar etiquetas automáticamente'}
              hint={format === 'pdf' ? 'Runly busca dónde van el nombre, el curso, la fecha y el folio.' : 'Solo si el archivo aún no tiene etiquetas {{…}}; uno con etiquetas se guarda sin cambios.'}
            />
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
        </>
      )}
    </FormSheet>
  )
}
