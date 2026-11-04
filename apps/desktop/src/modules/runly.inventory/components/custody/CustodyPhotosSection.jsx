import { useState } from 'react'
import { Button, Card, ImageSourceSheet } from '@runly/ui'
import { Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAddCustodyPhoto, useRemoveCustodyPhoto } from '../../hooks/useInventoryCustody.js'

// Optional photos of the returned equipment (simple returns).
export function CustodyPhotosSection({ custody, editable }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const add = useAddCustodyPhoto()
  const remove = useRemoveCustodyPhoto()
  const busy = add.isPending || remove.isPending

  async function upload(file) {
    try { await add.mutateAsync({ id: custody.id, file }) } catch (err) { toast.error(err?.message ?? 'No se pudo guardar la foto') }
  }
  async function drop(fileId) {
    try { await remove.mutateAsync({ id: custody.id, fileId }) } catch (err) { toast.error(err?.message ?? 'No se pudo quitar la foto') }
  }

  if (!editable && !custody.photos.length) return null
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Fotos del equipo</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Opcional: deja constancia del estado en que se recibe.</p>
        </div>
        {editable ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setPickerOpen(true)}>
            <Camera className="mr-1.5 h-3.5 w-3.5" />{add.isPending ? 'Subiendo...' : 'Agregar foto'}
          </Button>
        ) : null}
      </div>
      {custody.photos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {custody.photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border border-[hsl(var(--border))]">
              {photo.url ? (
                <a href={photo.url} target="_blank" rel="noopener noreferrer">
                  <img src={photo.url} alt={photo.name ?? 'Foto del equipo'} className="h-full w-full object-cover" />
                </a>
              ) : null}
              {editable ? (
                <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="Quitar foto" disabled={busy} onClick={() => drop(photo.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <ImageSourceSheet open={pickerOpen} onOpenChange={setPickerOpen} onPickFile={upload} />
    </Card>
  )
}
