import { EmptyState, ErrorState, MarkdownViewer, Skeleton } from '@runly/ui'
import { Megaphone } from 'lucide-react'
import { relativeTime } from '../../lib/lmsLabels.js'

// One announcement. `actions` is an optional slot (the editor's menu).
export function AnnouncementCard({ announcement, actions = null }) {
  const meta = [announcement.author?.displayName, relativeTime(announcement.createdAt), announcement.editedAt ? 'editado' : null].filter(Boolean).join(' · ')
  return (
    <article className="rounded-xl border border-[hsl(var(--border))] p-4">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-700 dark:text-violet-300">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{announcement.title}</h3>
          {meta ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
        </div>
        {actions}
      </header>
      {announcement.body?.trim() ? <MarkdownViewer value={announcement.body} className="mt-3 text-sm" /> : null}
    </article>
  )
}

// "Anuncios" tab of the player: newest first, read-only.
export function AnnouncementsList({ query }) {
  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
  if (query.isError) return <ErrorState title="No se pudieron cargar los anuncios" description={query.error?.message} onRetry={() => query.refetch()} />
  const items = query.data ?? []
  if (!items.length) return <EmptyState icon={Megaphone} title="Sin anuncios" description="Los avisos del instructor sobre este curso aparecerán aquí." />
  return (
    <ul className="space-y-3" aria-label="Anuncios del curso">
      {items.map((item) => <li key={item.id}><AnnouncementCard announcement={item} /></li>)}
    </ul>
  )
}
