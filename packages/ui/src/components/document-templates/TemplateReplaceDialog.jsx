import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../Button.jsx'
import { DistDropZone } from '../DistDropZone.jsx'
import { DialogHint, TemplateDialogFrame } from './TemplateDialogFrame.jsx'
import { ALL_FORMATS, FORMAT_LABELS, MAX_TEMPLATE_MB, acceptFor, formatOfName } from './template-utils.js'

// Replaces the file of a template with a new file in any format the kind allows;
// the template takes the new file's format.
export function TemplateReplaceDialog({ template, kind, busy, onOpenChange, onSubmit }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { setFile(null); setError('') }, [template?.id])
  const formats = kind?.formats?.length ? kind.formats : ALL_FORMATS
  const list = formats.map((f) => `.${f}`).join(', ')

  function pick(next) {
    const picked = formatOfName(next?.name)
    if (!picked || !formats.includes(picked)) {
      setError(`Sube un archivo ${list}`)
      return
    }
    setError('')
    setFile(next)
  }

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button type="button" disabled={!file || busy} onClick={() => onSubmit(file)}>{busy ? 'Reemplazando...' : 'Reemplazar archivo'}</Button>
    </>
  )

  return (
    <TemplateDialogFrame open={Boolean(template)} onOpenChange={onOpenChange} size="lg" icon={RefreshCw}
      title={`Reemplazar «${template?.name ?? ''}»`} subtitle={`Archivo nuevo en ${formats.map((f) => FORMAT_LABELS[f]).join(', ')}.`} footer={footer}>
      <DistDropZone accept={acceptFor(formats)} maxSizeMB={MAX_TEMPLATE_MB} file={file} onFile={pick}
        onClear={() => setFile(null)} isUploading={busy} emptyLabel={`Arrastra la plantilla ${list}`} />
      {error ? <p className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
      <DialogHint>
        Se crea una versión nueva que debes revisar y publicar: los campos se detectan de nuevo y la asignación se conserva solo para las etiquetas que sigan existiendo. Puede ser de otro formato. Los documentos ya generados no cambian.
      </DialogHint>
    </TemplateDialogFrame>
  )
}
