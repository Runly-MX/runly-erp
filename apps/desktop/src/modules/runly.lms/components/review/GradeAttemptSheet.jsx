import { useEffect, useMemo, useState } from 'react'
import { Button, ErrorState, NumberField, Skeleton, TextareaField } from '@runly/ui'
import { ArrowUpRight, Loader2 } from 'lucide-react'
import { useGradeAttempt, useReviewAttempt } from '../../hooks/useLmsEval.js'
import { formatPct, validateManualPoints } from '../../lib/lmsEval.js'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { attemptScoreSummary, passState } from '../../lib/lmsReview.js'
import { QuestionReview } from '../quiz/QuestionReview.jsx'
import { FormSheet } from '../shared.jsx'
import { PassIndicator, REVIEW_BODY, ReviewColumns, ReviewSection } from './ReviewLayout.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const asText = (value) => (value === null || value === undefined ? '' : String(value))
const anchor = (id) => `lms-review-q-${id}`

function Stat({ label, value }) {
  return (
    <div className="space-y-0.5">
      <dt className={MUTED}>{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}

// Live score while grading: percentage, points and the pass indicator.
function ScoreSummary({ summary, passingScore, pending }) {
  return (
    <section aria-label="Resumen de la calificación" className="space-y-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-3xl font-semibold tabular-nums">{formatPct(summary.pct)}</p>
        <p className={MUTED}>{summary.total} de {summary.max} puntos</p>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Automáticos" value={summary.auto} />
        <Stat label="Manuales" value={summary.manual} />
        <Stat label="Mínimo" value={passingScore === null || passingScore === undefined ? '—' : `${passingScore}%`} />
      </dl>
      {pending ? <p className={MUTED}>{pending === 1 ? 'Falta 1 respuesta por calificar.' : `Faltan ${pending} respuestas por calificar.`}</p> : null}
      <PassIndicator state={pending ? null : passState(summary.pct, passingScore)} passingScore={passingScore} />
    </section>
  )
}

// Grades the open answers of a submitted quiz attempt. Answers (auto-scored
// ones read-only with their result) on the left; summary, manual points and
// feedback on the right.
export function GradeAttemptSheet({ attemptId, onOpenChange }) {
  const open = Boolean(attemptId)
  const query = useReviewAttempt(attemptId)
  const grade = useGradeAttempt()
  const [points, setPoints] = useState({})
  const [feedback, setFeedback] = useState('')
  const [errors, setErrors] = useState({})
  const data = query.data

  useEffect(() => {
    if (!data) return
    const initial = {}
    for (const question of data.questions ?? []) if (question.kind === 'open') initial[question.id] = asText(question.awardedPoints)
    setPoints(initial)
    setFeedback(data.feedback ?? '')
    setErrors({})
  }, [data])

  async function save() {
    const { values, errors: next } = validateManualPoints(data?.questions, points)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      await grade.mutateAsync({ id: attemptId, points: values, feedback: feedback.trim() || null })
      onOpenChange(false)
    } catch { /* toast shown by the mutation */ }
  }

  const questions = useMemo(() => data?.questions ?? [], [data])
  const openQuestions = questions.map((question, index) => ({ question, index })).filter(({ question }) => question.kind === 'open')
  const summary = attemptScoreSummary(questions, points)
  const pendingReview = data?.status === 'submitted'
  const passingScore = data?.lesson?.settings?.passingScore ?? null
  const description = data
    ? [data.learner?.displayName, data.course?.title, data.lesson?.title].filter(Boolean).join(' · ')
    : 'Cargando intento…'
  const scrollTo = (id) => document.getElementById(anchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const main = (
    <>
      <p className={MUTED}>Enviado el {formatShortDate(data?.submittedAt)}. Las preguntas cerradas se calificaron solas.</p>
      {questions.map((question, index) => (
        <div key={question.id} id={anchor(question.id)} className="scroll-mt-4">
          <QuestionReview question={question} index={index} answer={data.answers?.[question.id]} />
        </div>
      ))}
    </>
  )

  const aside = (
    <>
      <ScoreSummary summary={summary} passingScore={passingScore} pending={pendingReview ? summary.pending : 0} />
      {openQuestions.length ? (
        <ReviewSection title="Respuestas abiertas" meta={pendingReview ? 'Asigna los puntos de cada una.' : null}>
          <div className="space-y-3">
            {openQuestions.map(({ question, index }) => (
              <div key={question.id} className="space-y-1">
                <NumberField
                  label={`Pregunta ${index + 1} (0 a ${question.points})`} required value={points[question.id] ?? ''} error={errors[question.id]}
                  onChange={(event) => setPoints((current) => ({ ...current, [question.id]: event.target.value }))}
                  allowNegative={false} min={0} max={question.points} step="0.5" disabled={!pendingReview}
                />
                <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => scrollTo(question.id)}>
                  Ver respuesta<ArrowUpRight />
                </Button>
              </div>
            ))}
          </div>
        </ReviewSection>
      ) : null}
      <TextareaField
        label="Comentarios para el alumno" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={5} maxLength={5000}
        hint="Opcional. El alumno los ve junto con su calificación." disabled={!pendingReview}
      />
      {pendingReview ? null : <p className={MUTED}>Este intento ya fue calificado.</p>}
    </>
  )

  return (
    <FormSheet
      wide="xl" open={open} onOpenChange={onOpenChange} bodyClassName={REVIEW_BODY}
      title={data ? `Calificar examen · Intento ${data.number}` : 'Calificar examen'}
      description={description}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{pendingReview ? 'Cancelar' : 'Cerrar'}</Button>
          {pendingReview ? (
            <Button onClick={save} disabled={grade.isPending}>
              {grade.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar calificación
            </Button>
          ) : null}
        </>
      )}
    >
      {query.isLoading ? (
        <ReviewColumns
          main={[1, 2, 3].map((key) => <Skeleton key={key} className="h-32 rounded-md" />)}
          aside={<><Skeleton className="h-36 rounded-md" /><Skeleton className="h-28 rounded-md" /></>}
        />
      ) : query.isError ? (
        <div className="px-5 py-4">
          <ErrorState title="No se pudo cargar el intento" description={query.error?.message} onRetry={() => query.refetch()} />
        </div>
      ) : data ? <ReviewColumns main={main} aside={aside} /> : null}
    </FormSheet>
  )
}
