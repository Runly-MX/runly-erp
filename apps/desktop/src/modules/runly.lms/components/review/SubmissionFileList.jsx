import { useState } from 'react'
import { AdvancedFileViewer, Button, FileVisual, formatBytes, getKindLabel, getFileKind } from '@runly/ui'
import { Download, Eye, FilePenLine } from 'lucide-react'
import { useLmsOffice } from '../../hooks/useLmsOffice.js'
import { canOpenInOffice, previewKind } from '../../lib/lmsReview.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const viewerFile = (file) => ({ id: file.id, originalName: file.name || 'Archivo', mimeType: file.mimeType ?? '', sizeBytes: file.sizeBytes ?? 0, thumbnailUrl: previewKind(file) === 'image' ? file.url : null })

// Files of a submission, one row each: type icon, name, size, preview (images
// inline, PDFs/video/audio in the shared file viewer), download and, when the
// instance has Office, «Abrir en Office» (read-only for submissions). URLs are
// signed by the API, so guest submissions work the same way.
export function SubmissionFileList({ files }) {
  const office = useLmsOffice()
  const [viewIndex, setViewIndex] = useState(-1)
  const list = (files ?? []).filter((file) => file?.id)
  if (!list.length) return null
  const previewable = list.filter((file) => file.url && previewKind(file))
  const openViewer = (file) => setViewIndex(previewable.findIndex((item) => item.id === file.id))

  return (
    <>
      <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
        {list.map((file) => {
          const kind = previewKind(file)
          const meta = { originalName: file.name ?? '', mimeType: file.mimeType ?? '' }
          const details = [getKindLabel(getFileKind(meta)), file.sizeBytes ? formatBytes(file.sizeBytes) : null].filter(Boolean).join(' · ')
          return (
            <li key={file.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <FileVisual file={meta} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.name ?? undefined}>{file.name || 'Archivo sin nombre'}</p>
                  <p className={MUTED}>{file.url ? details : 'Archivo no disponible'}</p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {kind && file.url ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => openViewer(file)}><Eye />Vista previa</Button>
                  ) : null}
                  {file.url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={file.url} target="_blank" rel="noreferrer" download={file.name || true}><Download />Descargar</a>
                    </Button>
                  ) : null}
                  {office.enabled && canOpenInOffice(file) ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => office.open(file.id)}><FilePenLine />Abrir en Office</Button>
                  ) : null}
                </div>
              </div>
              {kind === 'image' && file.url ? (
                <button
                  type="button" onClick={() => openViewer(file)} aria-label={`Ampliar ${file.name || 'imagen'}`}
                  className="block w-full overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <img src={file.url} alt={file.name || 'Imagen entregada'} loading="lazy" className="mx-auto max-h-72 w-auto object-contain" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <AdvancedFileViewer
        open={viewIndex >= 0}
        onOpenChange={(next) => { if (!next) setViewIndex(-1) }}
        files={previewable.map(viewerFile)}
        activeIndex={Math.max(0, viewIndex)}
        onIndexChange={setViewIndex}
        onResolveSignedUrl={async (file) => previewable.find((item) => item.id === file.id)?.url ?? null}
        onOpenInOffice={office.enabled ? (file) => office.open(file.id) : null}
        canOpenInOffice={() => office.enabled}
        zIndex={10000}
      />
    </>
  )
}
