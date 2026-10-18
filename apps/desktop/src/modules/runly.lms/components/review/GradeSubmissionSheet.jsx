import { useEffect, useState } from 'react'
import { Badge, Button, ErrorState, MarkdownViewer, NumberField, Skeleton, TextareaField } from '@runly/ui'
import { CheckCircle2, FileText, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGradeSubmission, useReviewSubmission } from '../../hooks/useLmsEval.js'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { filesCountText, passState } from '../../lib/lmsReview.js'
import { SubmissionStatusBadge } from '../assignment/SubmissionCard.jsx'
import { FormSheet } from '../shared.jsx'
import { InstructionsAccordion, PassIndicator, REVIEW_BODY, ReviewColumns, ReviewSection, SubmissionHistory } from './ReviewLayout.jsx'
import { SubmissionFileList } from './SubmissionFileList.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const blank = (value) => String(value ?? '').trim() === ''

function LoadingColumns() {
  return (
    <ReviewColumns
      main={<><Skeleton className="h-10 rounded-md" /><Skeleton className="h-48 rounded-md" /><Skeleton className="h-24 rounded-md" /></>}
      aside={<><Skeleton className="h-16 rounded-md" /><Skeleton className="h-32 rounded-md" /></>}
    />
  )
}

// The learner's work: instructions, text (Markdown), files and earlier entries.
function SubmissionWork({ data }) {
  const history = (data.history ?? []).filter((item) => item.id !== data.id)
  const files = data.files ?? []
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SubmissionStatusBadge status={data.status} />
        {data.late ? <Badge variant="warning">Tardía</Badge> : null}
        <span className={MUTED}>Enviada el {formatShortDate(data.submittedAt)}</span>
      </div>
      <InstructionsAccordion body={data.lesson?.body} />
      <ReviewSection title="Respuesta">
        {data.text?.trim() ? (
          <div className="rounded-md bg-[hsl(var(--muted)/0.45)] px-4 py-3"><MarkdownViewer value={data.text} /></div>
        ) : <p className={MUTED}>El alumno no escribió texto en esta entrega.</p>}
      </ReviewSection>
      <ReviewSection title="Archivos" meta={files.length ? filesCountText(files.length) : null}>
        {files.length ? <SubmissionFileList files={files} /> : (
          <p className={`flex items-center gap-2 ${MUTED}`}><FileText className="h-4 w-4" aria-hidden="true" />Esta entrega no incluye archivos.</p>
        )}
      </ReviewSection>
      <SubmissionHistory items={history} />
    </>
  )
}

// Reviews an assignment submission: approve (with a grade when the lesson has
// a passing score) or return it so the learner submits again.
export function GradeSubmissionSheet({ submissionId, onOpenChange }) {
  const open = Boolean(submissionId)
  const query = useReviewSubmission(submissionId)
  const grade = useGradeSubmission()
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [decision, setDecision] = useState(null)
  const data = query.data
  const passingScore = data?.lesson?.settings?.passingScore ?? data?.settings?.passingScore ?? null
  const needsGrade = passingScore !== null && passingScore !== undefined

  useEffect(() => {
    if (!data) return
    setScore(data.grade === null || data.grade === undefined ? '' : String(data.grade))
    setFeedback(data.feedback ?? '')
    setError('')
  }, [data])

  async function decide(next) {
    let value = null
    if (!blank(score)) {
      value = Number(score)
      if (!Number.isFinite(value) || value < 0 || value > 100) { setError('Escribe una calificación de 0 a 100.'); return }
    }
    if (needsGrade && next === 'approve') {
      if (value === null) { setError('Escribe la calificación para aprobar.'); return }
      if (value < passingScore) { setError(`Para aprobar, la calificación debe ser al menos ${passingScore}.`); return }
    }
    setError('')
    setDecision(next)
    try {
      await grade.mutateAsync({ id: submissionId, decision: next, ...(value !== null ? { grade: value } : {}), feedback: feedback.trim() || null })
      toast.success(next === 'approve' ? 'Entrega aprobada.' : 'Entrega devuelta al alumno.')
      onOpenChange(false)
    } catch { /* toast shown by the mutation */ } finally { setDecision(null) }
  }

  const pendingReview = data?.status === 'submitted'
  const description = data ? [data.learner?.displayName, data.course?.title, data.lesson?.title].filter(Boolean).join(' · ') : 'Cargando entrega…'
  const spinner = (kind) => (grade.isPending && decision === kind ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null)
  const gradedValue = data?.grade !== null && data?.grade !== undefined

  const aside = data && pendingReview ? (
    <>
      <div className="space-y-2">
        <NumberField
          label="Calificación (0 a 100)" value={score} onChange={(event) => { setScore(event.target.value); setError('') }}
          min={0} max={100} step="0.5" allowNegative={false} required={needsGrade}
          hint={needsGrade ? `Mínima para aprobar: ${passingScore}.` : 'Opcional: esta tarea no tiene calificación mínima.'}
        />
        <PassIndicator state={passState(score, passingScore)} passingScore={passingScore} />
      </div>
      <TextareaField
        label="Comentarios para el alumno" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={6} maxLength={5000}
        hint="Al devolver, explica qué debe corregir."
      />
      {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
    </>
  ) : data ? (
    <div className="space-y-5">
      <ReviewSection title="Resultado">
        <div className="space-y-2 rounded-md bg-[hsl(var(--background))] p-4">
          <SubmissionStatusBadge status={data.status} />
          {gradedValue ? <p className="text-3xl font-semibold tabular-nums">{data.grade}<span className="text-sm font-normal text-[hsl(var(--muted-foreground))]"> / 100</span></p> : <p className={MUTED}>Sin calificación numérica.</p>}
          {data.gradedAt ? <p className={MUTED}>Revisada el {formatShortDate(data.gradedAt)}</p> : null}
        </div>
      </ReviewSection>
      <ReviewSection title="Comentarios">
        {data.feedback?.trim() ? <p className="whitespace-pre-wrap rounded-md bg-[hsl(var(--background))] p-4 text-sm">{data.feedback}</p> : <p className={MUTED}>Sin comentarios.</p>}
      </ReviewSection>
    </div>
  ) : null

  return (
    <FormSheet
      wide="xl" open={open} onOpenChange={onOpenChange} bodyClassName={REVIEW_BODY}
      title={data ? `Revisar tarea · Entrega ${data.number}` : 'Revisar tarea'}
      description={description}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">{pendingReview ? 'Cancelar' : 'Cerrar'}</Button>
          {pendingReview ? (
            <>
              <Button variant="outline" onClick={() => decide('return')} disabled={grade.isPending}>{spinner('return') ?? <Undo2 />}Devolver</Button>
              <Button onClick={() => decide('approve')} disabled={grade.isPending}>{spinner('approve') ?? <CheckCircle2 />}Aprobar</Button>
            </>
          ) : null}
        </>
      )}
    >
      {query.isLoading ? <LoadingColumns /> : query.isError ? (
        <div className="px-5 py-4">
          <ErrorState title="No se pudo cargar la entrega" description={query.error?.message} onRetry={() => query.refetch()} />
        </div>
      ) : data ? <ReviewColumns main={<SubmissionWork data={data} />} aside={aside} /> : null}
    </FormSheet>
  )
}
