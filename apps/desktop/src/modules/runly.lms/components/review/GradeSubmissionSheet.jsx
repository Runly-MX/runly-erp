import { useEffect, useState } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, ErrorState, MarkdownViewer, NumberField, Skeleton, TextareaField } from '@runly/ui'
import { CheckCircle2, Loader2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGradeSubmission, useReviewSubmission } from '../../hooks/useLmsEval.js'
import { SubmissionCard } from '../assignment/SubmissionCard.jsx'
import { FormSheet } from '../shared.jsx'

const blank = (value) => String(value ?? '').trim() === ''

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
  const graded = passingScore !== null && passingScore !== undefined

  useEffect(() => {
    if (!data) return
    setScore(data.grade === null || data.grade === undefined ? '' : String(data.grade))
    setFeedback(data.feedback ?? '')
    setError('')
  }, [data])

  async function decide(next) {
    let value = null
    if (graded && !blank(score)) {
      value = Number(score)
      if (!Number.isFinite(value) || value < 0 || value > 100) { setError('Escribe una calificación de 0 a 100.'); return }
    }
    if (graded && next === 'approve') {
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

  const history = (data?.history ?? []).filter((item) => item.id !== data?.id)
  const pendingReview = data?.status === 'submitted'
  const description = data ? [data.learner?.displayName, data.course?.title, data.lesson?.title].filter(Boolean).join(' · ') : 'Cargando entrega…'
  const spinner = (kind) => (grade.isPending && decision === kind ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null)
  return (
    <FormSheet
      wide open={open} onOpenChange={onOpenChange}
      title={data ? `Revisar tarea · Entrega ${data.number}` : 'Revisar tarea'}
      description={description}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:mr-auto">Cancelar</Button>
          <Button variant="outline" onClick={() => decide('return')} disabled={!pendingReview || grade.isPending}>{spinner('return') ?? <Undo2 />}Devolver</Button>
          <Button onClick={() => decide('approve')} disabled={!pendingReview || grade.isPending}>{spinner('approve') ?? <CheckCircle2 />}Aprobar</Button>
        </>
      )}
    >
      {query.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-40 rounded-md" /><Skeleton className="h-24 rounded-md" /></div>
      ) : query.isError ? (
        <ErrorState title="No se pudo cargar la entrega" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : data ? (
        <>
          {data.lesson?.body?.trim() ? (
            <Accordion type="single" collapsible className="rounded-md border border-[hsl(var(--border))] px-3">
              <AccordionItem value="instructions" className="border-b-0">
                <AccordionTrigger className="text-sm">Instrucciones de la tarea</AccordionTrigger>
                <AccordionContent><MarkdownViewer value={data.lesson.body} /></AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
          <SubmissionCard submission={data} />
          {pendingReview ? (
            <section className="space-y-4">
              {graded ? (
                <div className="max-w-56">
                  <NumberField
                    label="Calificación (0 a 100)" value={score} onChange={(event) => setScore(event.target.value)}
                    hint={`Mínima para aprobar: ${passingScore}.`} min={0} max={100}
                  />
                </div>
              ) : null}
              <TextareaField
                label="Comentarios para el alumno" value={feedback} onChange={(event) => setFeedback(event.target.value)} rows={4} maxLength={5000}
                hint="Al devolver, explica qué debe corregir."
              />
              {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
            </section>
          ) : <Badge variant="secondary">Esta entrega ya fue revisada.</Badge>}
          {history.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Entregas anteriores</h3>
              {history.map((item) => <SubmissionCard key={item.id} submission={item} />)}
            </section>
          ) : null}
        </>
      ) : null}
    </FormSheet>
  )
}
