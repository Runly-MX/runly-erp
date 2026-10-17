import { useEffect, useState } from 'react'
import { Button, ErrorState, NumberField, Skeleton, TextareaField } from '@runly/ui'
import { Loader2 } from 'lucide-react'
import { useGradeAttempt, useReviewAttempt } from '../../hooks/useLmsEval.js'
import { validateManualPoints } from '../../lib/lmsEval.js'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { QuestionReview } from '../quiz/QuestionReview.jsx'
import { FormSheet } from '../shared.jsx'

const asText = (value) => (value === null || value === undefined ? '' : String(value))

// Grades the open answers of a submitted quiz attempt. Auto-scored questions
// are shown read-only with their result.
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

  const questions = data?.questions ?? []
  const description = data
    ? [data.learner?.displayName, data.course?.title, data.lesson?.title].filter(Boolean).join(' · ')
    : 'Cargando intento…'
  return (
    <FormSheet
      wide open={open} onOpenChange={onOpenChange}
      title={data ? `Calificar examen · Intento ${data.number}` : 'Calificar examen'}
      description={description}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={!data || grade.isPending}>
            {grade.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar calificación
          </Button>
        </>
      )}
    >
      {query.isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-32 rounded-md" />)}</div>
      ) : query.isError ? (
        <ErrorState title="No se pudo cargar el intento" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : data ? (
        <>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Enviado el {formatShortDate(data.submittedAt)}. Asigna los puntos de cada respuesta abierta; las demás se calificaron solas.
          </p>
          {questions.map((question, index) => (
            <QuestionReview key={question.id} question={question} index={index} answer={data.answers?.[question.id]}>
              {question.kind === 'open' ? (
                <div className="max-w-56">
                  <NumberField
                    label={`Puntos (0 a ${question.points})`} required value={points[question.id] ?? ''} error={errors[question.id]}
                    onChange={(event) => setPoints((current) => ({ ...current, [question.id]: event.target.value }))}
                    allowNegative={false} min={0} max={question.points} step="0.5"
                  />
                </div>
              ) : null}
            </QuestionReview>
          ))}
          <TextareaField
            label="Comentarios para el alumno" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={4} maxLength={5000}
            hint="Opcional. El alumno los ve junto con su calificación."
          />
        </>
      ) : null}
    </FormSheet>
  )
}
