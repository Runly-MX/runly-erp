import { Badge, Button, StatStrip } from '@runly/ui'
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react'
import { formatPct } from '../../lib/lmsEval.js'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { QuestionReview, isRevealed } from './QuestionReview.jsx'

export function AttemptStatusBadge({ attempt }) {
  if (!attempt) return null
  if (attempt.status === 'submitted') return <Badge variant="warning">En revisión</Badge>
  if (attempt.status === 'in_progress') return <Badge variant="secondary">En curso</Badge>
  return attempt.passed ? <Badge variant="success">Aprobado</Badge> : <Badge variant="destructive">No aprobado</Badge>
}

// Result of a submitted attempt: score, status and, when the quiz reveals
// them, the answers per question.
export function QuizResult({ attempt, passingScore, canRetry, retrying, onRetry, onBack }) {
  const questions = attempt.questions ?? []
  const pending = attempt.status === 'submitted'
  const revealed = isRevealed(questions)
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-md border border-[hsl(var(--border))] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">Intento {attempt.number}</h3>
          <AttemptStatusBadge attempt={attempt} />
          {attempt.submittedAt ? <span className="text-xs text-[hsl(var(--muted-foreground))]">Enviado el {formatShortDate(attempt.submittedAt)}</span> : null}
        </div>
        <StatStrip
          items={[
            { key: 'score', label: 'Calificación', value: pending ? 'Pendiente' : formatPct(attempt.scorePct), icon: 'Award' },
            passingScore !== null && passingScore !== undefined ? { key: 'passing', label: 'Mínima para aprobar', value: `${passingScore}%`, icon: 'Target' } : null,
          ]}
        />
        {pending ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Tu examen tiene respuestas abiertas que un instructor debe calificar. Te avisaremos cuando tenga la calificación final.
          </p>
        ) : null}
        {attempt.feedback?.trim() ? (
          <div className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Comentarios del instructor</p>
            <p className="whitespace-pre-wrap text-sm">{attempt.feedback}</p>
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onBack}><ArrowLeft />Volver al examen</Button>
          {canRetry ? (
            <Button onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RotateCcw />}Intentar de nuevo
            </Button>
          ) : null}
        </div>
      </section>
      {revealed ? (
        questions.map((question, index) => (
          <QuestionReview key={question.id} question={question} index={index} answer={attempt.answers?.[question.id]} />
        ))
      ) : (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Las respuestas correctas de este examen no se muestran.</p>
      )}
    </div>
  )
}
