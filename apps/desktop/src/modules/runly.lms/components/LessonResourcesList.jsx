import { AdvancedFileViewer, Button, EmptyState, FileVisual, buttonVariants, cn, formatBytes } from '@runly/ui'
import { Download, Eye, FolderOpen } from 'lucide-react'
import { useLmsFileViewer } from '../hooks/useLmsFileViewer.js'
import { resourceName } from '../lib/lmsExperience.js'
import { resourceInput } from '../lib/lmsFiles.js'

// Recursos tab of the player: the lesson's files (signed URLs from the opened
// lesson), with a file-type icon; the row or «Abrir» opens the file viewer
// (preview by type, download fallback) and «Descargar» saves it directly.
export function LessonResourcesList({ resources }) {
  const viewer = useLmsFileViewer()
  const list = resources ?? []
  if (!list.length) {
    return <EmptyState icon={FolderOpen} title="Sin recursos" description="Esta lección no tiene archivos para descargar." />
  }
  const inputs = list.map(resourceInput)
  return (
    <>
      <ul className="space-y-2" aria-label="Recursos de la lección">
        {list.map((resource, index) => {
          const name = resourceName(resource)
          const meta = [resource.title?.trim() && resource.fileName ? resource.fileName : null, resource.sizeBytes ? formatBytes(resource.sizeBytes) : null].filter(Boolean).join(' · ')
          const open = resource.url ? () => viewer.open(inputs, index) : null
          return (
            <li key={resource.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 transition-colors hover:border-violet-500/50 motion-reduce:transition-none">
              <FileVisual file={{ originalName: resource.fileName ?? name, mimeType: resource.mimeType }} className="h-10 w-10 shrink-0 rounded-md" />
              {open ? (
                <button type="button" onClick={open} title={`Abrir ${name}`} className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                  <p className="truncate text-sm font-medium">{name}</p>
                  {meta ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
                </button>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Archivo no disponible</p>
                </div>
              )}
              {open ? (
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={open} aria-label={`Abrir ${name}`}>
                  <Eye /><span className="max-sm:sr-only">Abrir</span>
                </Button>
              ) : null}
              {resource.url ? (
                <a
                  href={resource.url} target="_blank" rel="noreferrer" download={resource.fileName || true}
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                  aria-label={`Descargar ${name}`}
                >
                  <Download /><span className="max-sm:sr-only">Descargar</span>
                </a>
              ) : null}
            </li>
          )
        })}
      </ul>
      <AdvancedFileViewer {...viewer.props} />
    </>
  )
}
