import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../Dialog.jsx'
import { ErrorState } from '../ErrorState.jsx'
import { LoadingState } from '../LoadingState.jsx'

// PDF preview of a template filled with sample data.
export function TemplatePreviewDialog({ open, onOpenChange, blob, loading, error, title }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) { setUrl(null); return undefined }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader icon={Eye}>
          <DialogTitle>Vista previa</DialogTitle>
          <DialogDescription>{title ? `«${title}» con datos de ejemplo.` : 'Con datos de ejemplo.'}</DialogDescription>
        </DialogHeader>
        <div className="h-[60vh] overflow-hidden rounded-md border border-[hsl(var(--border))]">
          {loading ? <LoadingState /> : error ? <ErrorState title="No se pudo generar la vista previa" description={error} showReport={false} />
            : url ? <iframe title="Vista previa de la plantilla" src={url} className="h-full w-full" /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
