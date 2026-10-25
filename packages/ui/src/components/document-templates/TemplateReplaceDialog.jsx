import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../Button.jsx'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { DistDropZone } from '../DistDropZone.jsx'
import { MAX_TEMPLATE_MB, formatOfName } from './template-utils.js'

// Replaces the file of a template with an edited version of the same format.
export function TemplateReplaceDialog({ template, busy, onOpenChange, onSubmit }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { setFile(null); setError('') }, [template?.id])
  const format = template?.format

  function pick(next) {
    if (formatOfName(next?.name) !== format) {
      setError(`Sube un archivo .${format}`)
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
            Sube la versión editada. Se crea una versión nueva que debes revisar y publicar; los documentos ya generados no cambian.
          </DialogDescription>
        </DialogHeader>
        <DistDropZone accept={`.${format}`} maxSizeMB={MAX_TEMPLATE_MB} file={file} onFile={pick}
          onClear={() => setFile(null)} isUploading={busy} emptyLabel={`Arrastra la plantilla editada .${format}`} />
        {error ? <p className="text-xs text-[hsl(var(--destructive))]">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!file || busy} onClick={() => onSubmit(file)}>{busy ? 'Reemplazando...' : 'Reemplazar archivo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
