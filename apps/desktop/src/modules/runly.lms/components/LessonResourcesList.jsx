import { EmptyState, FileVisual, buttonVariants, cn, formatBytes } from '@runly/ui'
import { Download, FolderOpen } from 'lucide-react'
import { resourceName } from '../lib/lmsExperience.js'

// Recursos tab of the player: the lesson's downloadable files (signed URLs
// from the opened lesson), with a file-type icon and a download action.
export function LessonResourcesList({ resources }) {
  const list = resources ?? []
  if (!list.length) {
    return <EmptyState icon={FolderOpen} title="Sin recursos" description="Esta lección no tiene archivos para descargar." />
  }
  return (
    <ul className="space-y-2" aria-label="Recursos de la lección">
      {list.map((resource) => {
        const name = resourceName(resource)
        const meta = [resource.title?.trim() && resource.fileName ? resource.fileName : null, resource.sizeBytes ? formatBytes(resource.sizeBytes) : null].filter(Boolean).join(' · ')
        return (
          <li key={resource.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 transition-colors hover:border-violet-500/50 motion-reduce:transition-none">
            <FileVisual file={{ originalName: resource.fileName ?? name, mimeType: resource.mimeType }} className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              {meta ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
            </div>
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
  )
}
