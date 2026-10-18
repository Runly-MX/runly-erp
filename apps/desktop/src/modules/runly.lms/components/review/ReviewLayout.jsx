import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, MarkdownViewer, cn } from '@runly/ui'
import { CheckCircle2, XCircle } from 'lucide-react'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { SubmissionFiles, SubmissionStatusBadge } from '../assignment/SubmissionCard.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Grading sheets body (FormSheet with bodyClassName={REVIEW_BODY}): two
// columns on wide screens, each scrolling on its own (the work on the left,
// grading on the right); one scrolling column on phones and tablets.
export const REVIEW_BODY = 'flex min-h-0 flex-1 flex-col'
export function ReviewColumns({ main, aside }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:overflow-hidden">
      <div className="space-y-6 px-5 py-5 lg:min-h-0 lg:overflow-y-auto">{main}</div>
      <aside aria-label="Calificación" className="space-y-5 bg-[hsl(var(--muted)/0.3)] px-5 py-5 lg:min-h-0 lg:overflow-y-auto">
        {aside}
      </aside>
    </div>
  )
}

export function ReviewSection({ title, meta, children, className }) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</h3>
        {meta ? <span className={MUTED}>{meta}</span> : null}
      </div>
      {children}
    </section>
  )
}

// Collapsible lesson instructions (Markdown); nothing when the lesson has none.
export function InstructionsAccordion({ body }) {
  if (!body?.trim()) return null
  return (
    <Accordion type="single" collapsible className="rounded-md bg-[hsl(var(--muted)/0.45)] px-4">
      <AccordionItem value="instructions" className="border-b-0">
        <AccordionTrigger className="text-sm">Instrucciones de la tarea</AccordionTrigger>
        <AccordionContent><MarkdownViewer value={body} /></AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// Pass indicator for a grade against the passing score ('pass' | 'fail' | null).
export function PassIndicator({ state, passingScore, className }) {
  if (!state) return null
  const pass = state === 'pass'
  const Icon = pass ? CheckCircle2 : XCircle
  return (
    <p
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        pass ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]',
        className,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {pass ? `Aprueba (mínimo ${passingScore})` : `No alcanza el mínimo de ${passingScore}`}
    </p>
  )
}

// Earlier submissions, newest first, as a compact timeline with grade and
// feedback per entry.
export function SubmissionHistory({ items }) {
  if (!items?.length) return null
  return (
    <ReviewSection title="Entregas anteriores" meta={`${items.length}`}>
      <ol className="relative space-y-3 border-l border-[hsl(var(--border)/0.6)] pl-4">
        {items.map((item) => {
          const graded = item.grade !== null && item.grade !== undefined
          return (
            <li key={item.id} className="relative space-y-1">
              <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--background))] bg-[hsl(var(--muted-foreground))]" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Entrega {item.number}</span>
                <SubmissionStatusBadge status={item.status} />
                {item.late ? <Badge variant="warning">Tardía</Badge> : null}
                {graded ? <span className="text-sm tabular-nums">{item.grade} / 100</span> : null}
                <span className={cn(MUTED, 'ml-auto')}>{formatShortDate(item.submittedAt)}</span>
              </div>
              {item.feedback?.trim() ? (
                <p className="line-clamp-3 whitespace-pre-wrap rounded-md bg-[hsl(var(--muted)/0.6)] px-2.5 py-1.5 text-sm">{item.feedback}</p>
              ) : <p className={MUTED}>Sin comentarios.</p>}
              {item.files?.length ? <SubmissionFiles files={item.files} /> : null}
            </li>
          )
        })}
      </ol>
    </ReviewSection>
  )
}
