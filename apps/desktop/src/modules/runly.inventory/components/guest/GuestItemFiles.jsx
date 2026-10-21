import { useMemo, useRef, useState } from 'react'
import { AdvancedFileViewer, Button, ConfirmDialog, Skeleton, getFileKind } from '@runly/ui'
import { FileText, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteGuestFile, useGuestItemFiles, useUploadGuestFile } from '../../hooks/useInventoryGuest.js'
import { guestErrorMessage } from '../../lib/guest-session.js'
import { muted } from './GuestPortalParts.jsx'

const MAX_BYTES = 10 * 1024 * 1024
export const GUEST_FILE_ACCEPT = 'image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.odt,.ods'

function formatBytes(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return ''
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

// Photos and documents of one item, opened in the same advanced viewer as the main app. Uploads only when
// the guest can write; a guest may delete only the files it uploaded itself (the API reports canDelete).
export function GuestItemFiles({ itemId, canWrite }) {
  const files = useGuestItemFiles(itemId)
  const upload = useUploadGuestFile()
  const remove = useDeleteGuestFile()
  const input = useRef(null)
  const [target, setTarget] = useState(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const rows = useMemo(() => files.data ?? [], [files.data])
  const viewerFiles = useMemo(() => rows.map((f) => ({ ...f, originalName: f.name ?? f.label ?? 'Archivo' })), [rows])

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

  const indexed = rows.map((file, index) => ({ file, index, kind: getFileKind({ mimeType: file.mimeType, originalName: file.name }) }))
  const images = indexed.filter((r) => r.kind === 'image')
  const others = indexed.filter((r) => r.kind !== 'image')

  const deleteButton = (file, className) => (file.canDelete ? (
    <Button type="button" variant="secondary" size="icon" aria-label="Eliminar archivo" className={className} onClick={() => setTarget(file)}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  ) : null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Fotos y archivos</h3>
        {canWrite ? (
          <>
            <input ref={input} type="file" multiple accept={GUEST_FILE_ACCEPT} className="sr-only" onChange={onPick} />
            <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
              <Paperclip className="mr-1.5 h-4 w-4" />{upload.isPending ? 'Subiendo...' : 'Agregar'}
            </Button>
          </>
        ) : null}
      </div>
      {files.isLoading ? <Skeleton className="h-24 w-full" /> : rows.length === 0 ? (
        <p className={`text-sm ${muted}`}>Sin archivos.</p>
      ) : (
        <div className="space-y-3">
          {images.length ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map(({ file, index }) => (
                <li key={file.id} className="relative overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
                  <button type="button" className="block w-full" aria-label={`Ver ${file.name ?? 'imagen'}`} onClick={() => setViewerIndex(index)}>
                    <img src={file.thumbUrl || file.url} alt={file.label || file.name || ''} loading="lazy" className="aspect-square w-full object-cover" />
                  </button>
                  {deleteButton(file, 'absolute right-1 top-1 h-8 w-8')}
                </li>
              ))}
            </ul>
          ) : null}
          {others.length ? (
            <ul className="space-y-1">
              {others.map(({ file, index }) => (
                <li key={file.id} className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] p-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setViewerIndex(index)}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))]"><FileText className={`h-4 w-4 ${muted}`} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{file.name}</span>
                      <span className={`block text-xs ${muted}`}>{formatBytes(file.sizeBytes)}</span>
                    </span>
                  </button>
                  {deleteButton(file, 'h-8 w-8 shrink-0')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {viewerIndex !== null ? (
        <AdvancedFileViewer
          open
          onOpenChange={(open) => { if (!open) setViewerIndex(null) }}
          files={viewerFiles}
          activeIndex={Math.min(viewerIndex, viewerFiles.length - 1)}
          onIndexChange={setViewerIndex}
          onResolveSignedUrl={(file) => file.url}
          imageEditing={false}
        />
      ) : null}
      <ConfirmDialog open={Boolean(target)} onOpenChange={(v) => { if (!v) setTarget(null) }}
        title="Eliminar archivo" description="El archivo se quitará de este item." detail={target?.name}
        confirmLabel="Eliminar" loading={remove.isPending} onConfirm={onDelete} />
    </section>
  )
}
