import { useState } from 'react'
import { Button, EmptyState, ErrorState, MarkdownViewer, PersonAvatar, Skeleton, cn } from '@runly/ui'
import { MessageSquareQuote } from 'lucide-react'
import { useReviews } from '../../hooks/useLmsSocial.js'
import { ReviewItem, ReviewsSummary } from '../social/ReviewsDialog.jsx'

const LONG_DESCRIPTION = 900

// Course description in Markdown; long ones fold behind "Mostrar más".
export function CourseDescription({ markdown }) {
  const [expanded, setExpanded] = useState(false)
  const text = markdown?.trim()
  if (!text) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Este curso aún no tiene descripción.</p>
  const long = text.length > LONG_DESCRIPTION
  return (
    <div className="space-y-2">
      <div className={cn('relative', long && !expanded && 'max-h-80 overflow-hidden')}>
        <MarkdownViewer value={text} className="text-[15px]" />
        {long && !expanded ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-[hsl(var(--background))] to-transparent" aria-hidden="true" /> : null}
      </div>
      {long ? <Button variant="link" className="px-0" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Mostrar menos' : 'Mostrar más'}</Button> : null}
    </div>
  )
}

export function InstructorCard({ instructor }) {
  if (!instructor) return null
  return (
    <div className="flex items-center gap-4 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <PersonAvatar name={instructor.displayName} src={instructor.avatarUrl} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-semibold">{instructor.displayName}</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Creó este curso</p>
      </div>
    </div>
  )
}

const PREVIEW_COUNT = 3

// Rating summary and the latest reviews; the full list (and the learner's own
// review form) stays in ReviewsDialog.
export function CourseReviews({ courseId, onOpenAll }) {
  const query = useReviews(courseId)
  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-28 rounded-md" /><Skeleton className="h-20 rounded-md" /></div>
  if (query.isError) return <ErrorState title="No se pudieron cargar las reseñas" description={query.error?.message} onRetry={() => query.refetch()} />
  const data = query.data
  if (!data) return null
  const reviews = (data.reviews ?? []).filter((review) => !review.hidden)
  return (
    <div className="space-y-4">
      {data.ratingCount ? <ReviewsSummary data={data} /> : null}
      {reviews.length ? (
        <div>{reviews.slice(0, PREVIEW_COUNT).map((review) => <ReviewItem key={review.id} review={review} />)}</div>
      ) : (
        <EmptyState icon={MessageSquareQuote} title="Aún no hay reseñas" description="Los alumnos pueden calificar el curso a partir del 30% de avance." />
      )}
      {reviews.length > PREVIEW_COUNT || data.canReview ? (
        <Button variant="outline" onClick={onOpenAll}>
          {reviews.length > PREVIEW_COUNT ? 'Ver todas las reseñas' : data.mine ? 'Editar mi reseña' : 'Calificar este curso'}
        </Button>
      ) : null}
    </div>
  )
}
