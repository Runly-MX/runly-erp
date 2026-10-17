import { useMemo, useState } from 'react'
import {
  Badge, Button, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, StarRating,
} from '@runly/ui'
import { Eye, EyeOff, MessageSquareQuote, MessageSquareReply, MoreHorizontal } from 'lucide-react'
import { useModerateReview, useReviews } from '../../hooks/useLmsSocial.js'
import { formatRating, formatShortDate, reviewCountLabel } from '../../lib/lmsLabels.js'
import { ReviewReplyDialog } from './ReviewReplyDialog.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Course editor "Reseñas" tab: every review (hidden ones included) with
// hide/show and the instructor reply.
export function ReviewsTab({ courseId, readOnly = false }) {
  const query = useReviews(courseId)
  const visibility = useModerateReview(), reply = useModerateReview('Respuesta guardada.')
  const [replyFor, setReplyFor] = useState(null)
  const data = query.data
  const rows = useMemo(() => data?.reviews ?? [], [data?.reviews])

  async function saveReply(replyBody) {
    try {
      await reply.mutateAsync({ id: replyFor.id, replyBody })
      setReplyFor(null)
    } catch { /* toast shown */ }
  }

  const columns = useMemo(() => [
    {
      id: 'learner', header: 'Alumno', accessorFn: (r) => r.learner?.displayName ?? '',
      cell: ({ row }) => <span className="font-medium">{row.original.learner?.displayName ?? '—'}</span>,
    },
    {
      id: 'rating', header: 'Calificación', accessorFn: (r) => r.rating,
      cell: ({ row }) => <StarRating value={row.original.rating} size="xs" />,
    },
    {
      id: 'body', header: 'Reseña', accessorFn: (r) => `${r.body ?? ''} ${r.replyBody ?? ''}`, enableSorting: false,
      cell: ({ row }) => (
        <div className="min-w-48 max-w-md space-y-1">
          {row.original.body?.trim() ? <p className="line-clamp-3 whitespace-pre-line text-sm">{row.original.body}</p> : <p className={`${MUTED} italic`}>Sin comentario</p>}
          {row.original.replyBody ? <p className={`${MUTED} line-clamp-2`}><span className="font-medium text-violet-700 dark:text-violet-300">Tu respuesta:</span> {row.original.replyBody}</p> : null}
        </div>
      ),
    },
    { id: 'date', header: 'Fecha', accessorFn: (r) => r.updatedAt ?? r.createdAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.updatedAt ?? row.original.createdAt) || '—'}</span> },
    {
      id: 'status', header: 'Estado', accessorFn: (r) => (r.hidden ? 'oculta' : 'visible'),
      cell: ({ row }) => (row.original.hidden ? <Badge variant="outline">Oculta</Badge> : <Badge variant="success">Visible</Badge>),
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Acciones de la reseña"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setReplyFor(row.original)}>
              <MessageSquareReply />{row.original.replyBody ? 'Editar respuesta' : 'Responder'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={visibility.isPending}
              onSelect={() => visibility.mutate({ id: row.original.id, hidden: !row.original.hidden })}
            >
              {row.original.hidden ? <><Eye />Mostrar reseña</> : <><EyeOff />Ocultar reseña</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [readOnly, visibility.isPending])

  const summary = data?.ratingCount ? (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="font-semibold tabular-nums">{formatRating(data.ratingAvg)}</span>
      <StarRating value={Number(data.ratingAvg) || 0} size="sm" />
      <span className={MUTED}>{reviewCountLabel(data.ratingCount)} visibles</span>
    </span>
  ) : null

  return (
    <div className="space-y-3">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">Las reseñas ocultas no cuentan en la calificación del curso y solo las ven los responsables.</p>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar reseña…"
        toolbarActions={summary}
        emptyIcon={MessageSquareQuote}
        emptyTitle="Aún no hay reseñas"
        emptyDescription="Los alumnos pueden calificar el curso a partir del 30% de avance."
      />
      <ReviewReplyDialog
        open={Boolean(replyFor)} onOpenChange={(open) => { if (!open) setReplyFor(null) }}
        review={replyFor} onSubmit={saveReply} pending={reply.isPending}
      />
    </div>
  )
}
