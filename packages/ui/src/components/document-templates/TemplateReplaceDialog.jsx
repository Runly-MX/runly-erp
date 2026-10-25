import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../Button.jsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { DistDropZone } from '../DistDropZone.jsx'
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

  return (
    <Dialog open={Boolean(template)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={RefreshCw}>
          <DialogTitle>Reemplazar «{template?.name}»</DialogTitle>
          <DialogDescription>
            Sube el archivo nuevo ({formats.map((f) => FORMAT_LABELS[f]).join(', ')}); puede ser de otro formato. Se crea una versión nueva que debes revisar y publicar: los campos se detectan de nuevo y la asignación se conserva solo para las etiquetas que sigan existiendo. Los documentos ya generados no cambian.
          </DialogDescription>
        </DialogHeader>
        <DistDropZone accept={acceptFor(formats)} maxSizeMB={MAX_TEMPLATE_MB} file={file} onFile={pick}
          onClear={() => setFile(null)} isUploading={busy} emptyLabel={`Arrastra la plantilla ${list}`} />
        {error ? <p className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!file || busy} onClick={() => onSubmit(file)}>{busy ? 'Reemplazando...' : 'Reemplazar archivo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
