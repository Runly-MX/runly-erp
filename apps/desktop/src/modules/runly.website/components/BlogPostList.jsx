import {
  Button, StatusPill, Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  ColumnResizeHandle, useColumnResize,
} from '@runly/ui'
import { Archive, CalendarDays, ChevronRight, CircleCheck, FilePen, Folder, Pencil, Trash2 } from 'lucide-react'

const STATUS = {
  draft: { label: 'Borrador', tone: 'warning', icon: FilePen },
  published: { label: 'Publicado', tone: 'success', icon: CircleCheck },
  archived: { label: 'Archivado', tone: 'neutral', icon: Archive },
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-MX', { dateStyle: 'medium' })
}

function PostStatus({ status }) {
  const meta = STATUS[status] ?? { label: status, tone: 'neutral', icon: null }
  return <StatusPill tone={meta.tone} icon={meta.icon} size="sm">{meta.label}</StatusPill>
}

const COLUMNS = [['title', 'Título'], ['category', 'Categoría'], ['status', 'Estado'], ['published', 'Publicado'], ['actions', '']]

// Posts as a resizable table on md+ and stacked tappable cards on phones.
export function BlogPostList({ posts, onOpen, onDelete, deleting }) {
  const resize = useColumnResize('website-blog')

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {posts.map((post) => (
          <li key={post.id} className="flex items-stretch overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <button
              type="button"
              onClick={() => onOpen(post)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors duration-150 hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
            >
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block truncate text-sm font-semibold">{post.title}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                  <PostStatus status={post.status} />
                  {post.category?.name && <span className="inline-flex items-center gap-1"><Folder className="h-3 w-3" aria-hidden />{post.category.name}</span>}
                  <span className="inline-flex items-center gap-1 tabular-nums"><CalendarDays className="h-3 w-3" aria-hidden />{fmtDate(post.publishedAt)}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onDelete(post)}
              disabled={deleting}
              aria-label={`Eliminar ${post.title}`}
              className="grid w-12 shrink-0 place-items-center border-l border-[hsl(var(--border))] text-[hsl(var(--destructive))] transition-colors duration-150 hover:bg-[hsl(var(--destructive))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] md:block">
        <Table {...resize.tableProps(COLUMNS.map(([key]) => key))}>
          <TableHeader>
            <TableRow>
              {COLUMNS.map(([key, label]) => (
                <TableHead key={key} className={key === 'actions' ? 'relative w-28' : 'relative'} {...resize.headerProps(key)}>
                  {label}
                  <ColumnResizeHandle {...resize.handleProps(key)} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id} className="group cursor-pointer transition-colors duration-150" onClick={() => onOpen(post)}>
                <TableCell className="font-medium text-[hsl(var(--foreground))]">{post.title}</TableCell>
                <TableCell className="text-[hsl(var(--muted-foreground))]">{post.category?.name ?? '—'}</TableCell>
                <TableCell><PostStatus status={post.status} /></TableCell>
                <TableCell className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{fmtDate(post.publishedAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Editar ${post.title}`} title="Editar" onClick={(e) => { e.stopPropagation(); onOpen(post) }}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Eliminar ${post.title}`}
                      title="Eliminar"
                      disabled={deleting}
                      className="text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 hover:text-[hsl(var(--destructive))]"
                      onClick={(e) => { e.stopPropagation(); onDelete(post) }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
