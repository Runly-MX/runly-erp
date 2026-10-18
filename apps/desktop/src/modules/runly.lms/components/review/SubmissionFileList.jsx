import { AdvancedFileViewer, Button, FileVisual, formatBytes, getKindLabel, getFileKind } from '@runly/ui'
import { Download, Eye, FilePenLine } from 'lucide-react'
import { useLmsFileViewer } from '../../hooks/useLmsFileViewer.js'
import { submissionFileInput } from '../../lib/lmsFiles.js'
import { canOpenInOffice, previewKind } from '../../lib/lmsReview.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Files of a submission, one row each: type icon, name, size, «Abrir» in the
// shared file viewer (images also inline), download and, when the instance
// has Office, «Abrir en Office» (read-only for submissions). URLs are signed
// by the API, so guest submissions work the same way.
export function SubmissionFileList({ files }) {
  const viewer = useLmsFileViewer()
  const list = (files ?? []).filter((file) => file?.id)
  if (!list.length) return null
  const inputs = list.map(submissionFileInput)
  const openViewer = (index) => viewer.open(inputs, index)

  return (
    <>
      <ul className="divide-y divide-[hsl(var(--border)/0.5)] overflow-hidden rounded-md bg-[hsl(var(--muted)/0.45)]">
        {list.map((file, index) => {
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
                  {file.url ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => openViewer(index)}><Eye />{kind ? 'Vista previa' : 'Abrir'}</Button>
                  ) : null}
                  {file.url ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={file.url} target="_blank" rel="noreferrer" download={file.name || true}><Download />Descargar</a>
                    </Button>
                  ) : null}
                  {viewer.officeEnabled && canOpenInOffice(file) ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => viewer.openInOffice(file.id)}><FilePenLine />Abrir en Office</Button>
                  ) : null}
                </div>
              </div>
              {kind === 'image' && file.url ? (
                <button
                  type="button" onClick={() => openViewer(index)} aria-label={`Ampliar ${file.name || 'imagen'}`}
                  className="block w-full overflow-hidden rounded-md bg-[hsl(var(--muted)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <img src={file.url} alt={file.name || 'Imagen entregada'} loading="lazy" className="mx-auto max-h-72 w-auto object-contain" />
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <AdvancedFileViewer {...viewer.props} />
    </>
  )
}
