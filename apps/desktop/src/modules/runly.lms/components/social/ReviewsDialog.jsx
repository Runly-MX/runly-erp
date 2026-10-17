import { useEffect, useState } from 'react'
import {
  Alert, AlertDescription, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, ErrorState, PersonAvatar, ProgressBar, Skeleton, StarRating, TextareaField,
} from '@runly/ui'
import { Loader2, MessageSquareQuote, Star } from 'lucide-react'
import { useReviews, useSaveMyReview } from '../../hooks/useLmsSocial.js'
import { formatRating, ratingRows, relativeTime, reviewCountLabel } from '../../lib/lmsLabels.js'

const REVIEW_MAX = 2000
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

export function ReviewsSummary({ data }) {
  const rows = ratingRows(data.distribution, data.ratingCount)
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[hsl(var(--border))] p-4 sm:flex-row sm:items-center">
      <div className="flex shrink-0 flex-col items-center gap-1 sm:w-32">
        <span className="text-4xl font-semibold tabular-nums">{formatRating(data.ratingAvg) || '—'}</span>
        <StarRating value={Number(data.ratingAvg) || 0} size="sm" />
        <span className={MUTED}>{reviewCountLabel(data.ratingCount)}</span>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5" aria-label="Distribución de calificaciones">
        {rows.map((row) => (
          <li key={row.stars} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 tabular-nums">{row.stars} {row.stars === 1 ? 'estrella' : 'estrellas'}</span>
            <ProgressBar value={row.pct} className="h-2 flex-1" barClassName="bg-amber-400" aria-label={`${row.stars} estrellas: ${row.count}`} />
            <span className="w-9 shrink-0 text-right tabular-nums text-[hsl(var(--muted-foreground))]">{row.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ReviewItem({ review }) {
  return (
    <article className="space-y-2 border-b border-[hsl(var(--border))] py-4 last:border-b-0">
      <header className="flex items-center gap-3">
        <PersonAvatar name={review.learner?.displayName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{review.learner?.displayName ?? 'Alumno'}{review.mine ? ' (tú)' : ''}</p>
          <div className="flex items-center gap-2">
            <StarRating value={review.rating} size="xs" />
            <span className={MUTED}>{relativeTime(review.updatedAt ?? review.createdAt)}</span>
          </div>
        </div>
        {review.hidden ? <Badge variant="outline">Oculta</Badge> : null}
      </header>
      {review.body?.trim() ? <p className="whitespace-pre-line text-sm">{review.body}</p> : null}
      {review.replyBody ? (
        <div className="rounded-md bg-[hsl(var(--muted))] p-3 text-sm">
          <p className="mb-1 text-xs font-medium text-violet-700 dark:text-violet-300">Respuesta del instructor{review.repliedAt ? ` · ${relativeTime(review.repliedAt)}` : ''}</p>
          <p className="whitespace-pre-line">{review.replyBody}</p>
        </div>
      ) : null}
    </article>
  )
}

// Reviews of a course: aggregate, the learner's own review form and the list.
// `initialRating` pre-selects stars when opened from the rate prompt.
export function ReviewsDialog({ open, onOpenChange, courseId, courseTitle, initialRating = 0 }) {
  const query = useReviews(courseId, { enabled: open })
  const save = useSaveMyReview()
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const data = query.data
  const mine = data?.mine ?? null
  const showForm = Boolean(data && (data.canReview || mine))

  useEffect(() => {
    if (!open) return
    setRating(initialRating || mine?.rating || 0)
    setBody(mine?.body ?? '')
    setError('')
  }, [open, mine, initialRating])

  async function submit(event) {
    event.preventDefault()
    if (!rating) { setError('Elige de 1 a 5 estrellas.'); return }
    try {
      await save.mutateAsync({ courseId, rating, body: body.trim() })
    } catch { /* toast shown */ }
  }

  const others = (data?.reviews ?? []).filter((review) => !review.mine)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={Star} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Reseñas del curso</DialogTitle>
            <DialogDescription>{courseTitle ? `Lo que opinan los alumnos de «${courseTitle}».` : 'Lo que opinan los alumnos de este curso.'}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {query.isLoading ? (
              <><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></>
            ) : query.isError ? (
              <ErrorState title="No se pudieron cargar las reseñas" description={query.error?.message} onRetry={() => query.refetch()} />
            ) : data ? (
              <>
                <ReviewsSummary data={data} />
                {showForm ? (
                  <fieldset className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
                    <legend className="px-1 text-sm font-semibold">{mine ? 'Tu reseña' : 'Califica este curso'}</legend>
                    <div className="space-y-1">
                      <StarRating value={rating} onChange={(value) => { setRating(value); setError('') }} size="lg" label="Tu calificación" />
                      {error ? <p className="text-xs text-[hsl(var(--destructive))]" role="alert">{error}</p> : null}
                    </div>
                    <TextareaField
                      label="Comentario (opcional)" value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={REVIEW_MAX}
                      placeholder="¿Qué te pareció el curso? ¿Se lo recomendarías a alguien de tu equipo?"
                    />
                    {mine?.hidden ? <Alert><AlertDescription>Un responsable del curso ocultó tu reseña: no cuenta en la calificación.</AlertDescription></Alert> : null}
                    {mine?.replyBody ? <ReviewItem review={{ ...mine, body: '' }} /> : null}
                  </fieldset>
                ) : (
                  <Alert><AlertDescription>Podrás calificar el curso cuando lleves al menos el 30% de avance.</AlertDescription></Alert>
                )}
                {others.length ? (
                  <section aria-label="Reseñas de otros alumnos">{others.map((review) => <ReviewItem key={review.id} review={review} />)}</section>
                ) : (
                  <EmptyState icon={MessageSquareQuote} title="Aún no hay otras reseñas" description="Las opiniones de los demás alumnos aparecerán aquí." />
                )}
              </>
            ) : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            {showForm ? (
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
                {mine ? 'Actualizar reseña' : 'Publicar reseña'}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
