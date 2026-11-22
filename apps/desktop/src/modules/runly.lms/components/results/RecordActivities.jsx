import { useEffect, useState } from 'react'
import { Badge, Button, NumberField, SectionCard, TextareaField, TextField, cn } from '@runly/ui'
import { Check, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { errorCode } from '../../hooks/useLmsEval.js'
import { useGradeDelivery, useGradeQuiz } from '../../hooks/useLmsResults.js'
import { deliveryDraft, deliveryPayload, quizDraft, quizPayload, rubricTotal, scoreText } from '../../lib/lmsResults.js'
import { QuestionReview } from '../quiz/QuestionReview.jsx'
import { InstructionsAccordion } from '../review/ReviewLayout.jsx'
import { DeliveryVersions } from './DeliveryVersions.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : null)

function ActivityHeader({ activity, gradedByName, gradedAt }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-base font-semibold tabular-nums">{scoreText(activity.score, activity.maxPoints)}</span>
      {activity.pending ? <Badge variant="secondary">Por revisar</Badge> : activity.score !== null ? <Badge variant="success">Calificada</Badge> : null}
      {gradedByName ? <span className={MUTED}>Calificó {gradedByName}{gradedAt ? ` · ${dateTime(gradedAt)}` : ''}</span> : null}
    </div>
  )
}

// Feedback, regrade reason and the save button of one activity. Saving keeps a
// partial review; a change to a final grade asks for the reason.
function GradeFooter({ feedback, onFeedback, regrade, reason, onReason, reasonError, dirty, pending, onSave, saved, canGrade, feedbackLabel }) {
  return (
    <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
      <TextareaField label={feedbackLabel} rows={3} maxLength={5000} value={feedback} onChange={(event) => onFeedback(event.target.value)} disabled={!canGrade} hint={canGrade ? 'Observaciones del evaluador sobre la actividad.' : undefined} />
      {regrade ? (
        <TextField label="Motivo de la recalificación" required value={reason} onChange={(event) => onReason(event.target.value)} maxLength={500} error={reasonError} hint="Queda en el historial con el valor anterior y el nuevo." />
      ) : null}
      {canGrade ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className={cn('flex items-center gap-1 text-xs', dirty ? 'text-[hsl(var(--warning,var(--muted-foreground)))]' : 'text-[hsl(var(--muted-foreground))]')} aria-live="polite">
            {dirty ? 'Cambios sin guardar' : saved ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />Guardado</> : null}
          </span>
          <Button onClick={onSave} disabled={!dirty || pending} className="max-sm:w-full">
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}{regrade ? 'Guardar recalificación' : 'Guardar avance'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function useSaveFlow({ mutation, onConflict }) {
  const [saved, setSaved] = useState(false)
  async function run(payload) {
    try { await mutation.mutateAsync(payload); setSaved(true); return true } catch (error) {
      if (errorCode(error) === 'CONFLICT') { toast.error(error.message); onConflict() } else toast.error(error.message || 'No se pudo guardar la calificación.')
      return false
    }
  }
  return { saved, setSaved, run }
}

export function RecordQuiz({ sessionId, activity, canGrade, onDirty, onConflict }) {
  const attempt = activity.attempt
  const mutation = useGradeQuiz(sessionId)
  const [draft, setDraft] = useState(() => quizDraft(attempt))
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(null)
  const [errors, setErrors] = useState({})
  const flow = useSaveFlow({ mutation, onConflict })
  useEffect(() => { setDraft(quizDraft(attempt)); setReason(''); setErrors({}) }, [attempt?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const payload = attempt ? quizPayload(attempt, draft) : null
  useEffect(() => { onDirty?.(activity.lessonId, Boolean(payload?.changed)) }, [payload?.changed]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!attempt) return <SectionCard title={activity.title}><p className={MUTED}>Sin intento registrado.</p></SectionCard>

  async function save() {
    setErrors(payload.errors)
    if (Object.keys(payload.errors).length) return
    if (payload.regrade && reason.trim().length < 5) { setReasonError('Escribe el motivo (al menos 5 caracteres).'); return }
    setReasonError(null)
    if (await flow.run({ attemptId: attempt.id, ...payload.body, ...(payload.regrade ? { reason } : {}), expectedUpdatedAt: attempt.updatedAt })) flow.setSaved(true)
  }

  const set = (kind, id) => (event) => { flow.setSaved(false); setDraft((current) => ({ ...current, [kind]: { ...current[kind], [id]: event.target.value } })) }
  return (
    <SectionCard title={activity.title}>
      <div className="space-y-4" data-testid={`record-activity-${activity.lessonId}`}>
        <ActivityHeader activity={activity} gradedByName={attempt.gradedByName} gradedAt={attempt.gradedAt} />
        <InstructionsAccordion body={activity.body} />
        {attempt.questions.map((question, index) => (
          <QuestionReview key={question.id} question={question} index={index} answer={attempt.answers?.[question.id]}>
            {question.kind === 'open' ? (
              <div className="grid gap-3 rounded-md bg-[hsl(var(--background))] p-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <NumberField
                  label={`Puntos (0 a ${question.points})`} value={draft.points[question.id] ?? ''} onChange={set('points', question.id)} error={errors[question.id]}
                  allowNegative={false} min={0} max={question.points} step="0.5" disabled={!canGrade}
                />
                <TextareaField label="Comentario" rows={2} maxLength={5000} value={draft.comments[question.id] ?? ''} onChange={set('comments', question.id)} disabled={!canGrade} />
              </div>
            ) : null}
          </QuestionReview>
        ))}
        <GradeFooter
          feedbackLabel="Observaciones del cuestionario" feedback={draft.feedback} onFeedback={(value) => { flow.setSaved(false); setDraft((current) => ({ ...current, feedback: value })) }}
          regrade={payload.regrade} reason={reason} onReason={setReason} reasonError={reasonError} dirty={payload.changed} pending={mutation.isPending} onSave={save} saved={flow.saved} canGrade={canGrade}
        />
      </div>
    </SectionCard>
  )
}

export function RecordDelivery({ sessionId, activity, canGrade, onDirty, onConflict }) {
  const sub = activity.submission
  const mutation = useGradeDelivery(sessionId)
  const [draft, setDraft] = useState(() => deliveryDraft(activity))
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(null)
  const [errors, setErrors] = useState({})
  const flow = useSaveFlow({ mutation, onConflict })
  useEffect(() => { setDraft(deliveryDraft(activity)); setReason(''); setErrors({}) }, [sub?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const payload = sub && sub.status !== 'missing' ? deliveryPayload(activity, draft) : null
  useEffect(() => { onDirty?.(activity.lessonId, Boolean(payload?.changed)) }, [payload?.changed]) // eslint-disable-line react-hooks/exhaustive-deps
  const header = <ActivityHeader activity={activity} gradedByName={sub?.gradedByName} gradedAt={sub?.gradedAt} />
  if (!sub || sub.status === 'missing') {
    return <SectionCard title={activity.title}><div className="space-y-2">{header}<p className="text-sm text-[hsl(var(--muted-foreground))]">No hubo entrega: cuenta 0 puntos.</p></div></SectionCard>
  }

  async function save() {
    setErrors(payload.errors)
    if (Object.keys(payload.errors).length) return
    if (payload.regrade && reason.trim().length < 5) { setReasonError('Escribe el motivo (al menos 5 caracteres).'); return }
    setReasonError(null)
    await flow.run({ submissionId: sub.id, ...payload.body, ...(payload.regrade ? { reason } : {}), expectedUpdatedAt: sub.updatedAt })
  }

  const live = rubricTotal(activity.rubric, draft.rubricScores)
  const current = sub.versions.filter((version) => version.status === 'active')
  const previous = sub.versions.filter((version) => version.status !== 'active')
  const change = (fn) => { flow.setSaved(false); setDraft(fn) }
  return (
    <SectionCard title={activity.title}>
      <div className="space-y-4" data-testid={`record-activity-${activity.lessonId}`}>
        {header}
        <InstructionsAccordion body={activity.body} />
        {sub.text ? (
          <section className="space-y-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Respuesta escrita</h3>
            <div className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-[hsl(var(--muted)/0.45)] p-4 text-[15px] leading-relaxed">{sub.text}</div>
          </section>
        ) : null}
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Archivos que se califican</h3>
          {current.length ? <DeliveryVersions versions={current} /> : <p className={MUTED}>Sin archivos.</p>}
        </section>
        {previous.length ? (
          <details className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
            <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">Versiones anteriores ({previous.length})</summary>
            <div className="pt-2"><DeliveryVersions versions={previous} /></div>
          </details>
        ) : null}
        {activity.rubric?.length ? (
          <section className="space-y-2" aria-label="Rúbrica">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Rúbrica</h3>
              <span className="text-sm tabular-nums">{live === null ? 'Incompleta' : `${live} de ${activity.maxPoints}`}</span>
            </div>
            <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
              {activity.rubric.map((criterion) => (
                <li key={criterion.id} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{criterion.label} <span className={MUTED}>· {criterion.points} pts</span></p>
                    {criterion.description ? <p className={MUTED}>{criterion.description}</p> : null}
                  </div>
                  <NumberField
                    aria-label={`Puntos de ${criterion.label}`} value={draft.rubricScores[criterion.id] ?? ''} error={errors[criterion.id]}
                    onChange={(event) => change((d) => ({ ...d, rubricScores: { ...d.rubricScores, [criterion.id]: event.target.value } }))}
                    allowNegative={false} min={0} max={criterion.points} step="0.5" disabled={!canGrade} placeholder={`0 a ${criterion.points}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <NumberField
            label={`Puntos (0 a ${activity.maxPoints})`} value={draft.points} error={errors.points} onChange={(event) => change((d) => ({ ...d, points: event.target.value }))}
            allowNegative={false} min={0} max={activity.maxPoints} step="0.5" disabled={!canGrade} className="sm:max-w-48"
          />
        )}
        <GradeFooter
          feedbackLabel="Observaciones de la entrega" feedback={draft.feedback} onFeedback={(value) => change((d) => ({ ...d, feedback: value }))}
          regrade={payload.regrade} reason={reason} onReason={setReason} reasonError={reasonError} dirty={payload.changed} pending={mutation.isPending} onSave={save} saved={flow.saved} canGrade={canGrade}
        />
      </div>
    </SectionCard>
  )
}
