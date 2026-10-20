import { useRef, useState } from 'react'
import { Button, ConfirmDialog, Skeleton } from '@runly/ui'
import { FileText, ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteGuestFile, useGuestItemFiles, useUploadGuestFile } from '../../hooks/useInventoryGuest.js'
import { guestErrorMessage } from '../../lib/guest-session.js'
import { muted } from './GuestPortalParts.jsx'

const MAX_BYTES = 10 * 1024 * 1024

function formatBytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return ''
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

// Photos and documents of one item. Uploads only when the guest can write; a guest
// may delete only the files it uploaded itself (the API reports that as canDelete).
export function GuestItemFiles({ itemId, canWrite }) {
  const files = useGuestItemFiles(itemId)
  const upload = useUploadGuestFile()
  const remove = useDeleteGuestFile()
  const input = useRef(null)
  const [target, setTarget] = useState(null)
  const rows = files.data ?? []

  async function onPick(event) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    for (const file of picked) {
      if (file.size > MAX_BYTES) { toast.error(`${file.name} supera los 10 MB`); continue }
      try { await upload.mutateAsync({ itemId, file }) } catch (err) { toast.error(guestErrorMessage(err)) }
    }
  }

  async function onDelete() {
    try { await remove.mutateAsync({ itemId, docId: target.id }); toast.success('Archivo eliminado') } catch (err) { toast.error(guestErrorMessage(err)) }
    setTarget(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Fotos y archivos</h3>
        {canWrite ? (
          <>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={onPick} />
            <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" />{upload.isPending ? 'Subiendo...' : 'Agregar'}
            </Button>
          </>
        ) : null}
      </div>
      {files.isLoading ? <Skeleton className="h-24 w-full" /> : rows.length === 0 ? (
        <p className={`text-sm ${muted}`}>Sin archivos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((file) => {
            const isImage = String(file.mimeType ?? '').startsWith('image/')
            return (
              <li key={file.id} className="group relative overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
                <a href={file.url} target="_blank" rel="noreferrer" className="block">
                  {isImage ? (
                    <img src={file.thumbUrl || file.url} alt={file.label || file.name} loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 p-2 text-center">
                      <FileText className={`h-6 w-6 ${muted}`} />
                      <span className="line-clamp-2 break-all text-xs">{file.name}</span>
                      <span className={`text-[11px] ${muted}`}>{formatBytes(file.sizeBytes)}</span>
                    </span>
                  )}
                </a>
                {file.canDelete ? (
                  <Button type="button" variant="secondary" size="icon" aria-label="Eliminar archivo"
                    className="absolute right-1 top-1 h-7 w-7" onClick={() => setTarget(file)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <ConfirmDialog open={Boolean(target)} onOpenChange={(v) => { if (!v) setTarget(null) }}
        title="Eliminar archivo" description="El archivo se quitará de este item." detail={target?.name}
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={onDelete} />
    </section>
  )
}
