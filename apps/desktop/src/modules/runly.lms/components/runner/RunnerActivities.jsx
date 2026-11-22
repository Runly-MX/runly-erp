import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorState, MarkdownViewer, Skeleton, TextareaField, cn } from '@runly/ui'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { KEY } from '../../hooks/useLmsData.js'
import { useSessionSource } from '../../hooks/useSessionSource.js'
import { LmsQuizSourceContext, errorCode } from '../../hooks/useLmsEval.js'
import { useSaveDraft, useSessionAttempt } from '../../hooks/useLmsSession.js'
import { QuizAttempt } from '../quiz/QuizAttempt.jsx'
import { DeliveryFiles, MaterialList } from './DeliveryFiles.jsx'

const TEXT_SAVE_MS = 1000
const SAVE_LABELS = { saving: 'Guardando…', saved: 'Guardado', error: 'No se pudo guardar' }

function Instructions({ body }) {
  if (!String(body ?? '').trim()) return null
  return <div className="rounded-md bg-[hsl(var(--muted)/0.45)] px-4 py-3"><MarkdownViewer value={body} /></div>
}

// Quiz inside a session: the shared quiz components, saving through the
// session endpoints (the server refuses answers after the deadline).
export function QuizActivity({ sessionId, activity, disabled, onClosed, onAnswered }) {
  const session = useSessionSource()
  const query = useSessionAttempt(sessionId, activity.attempt?.id)
  const source = useMemo(() => ({
    getAttempt: (attemptId) => session.getSessionAttempt(sessionId, attemptId),
    saveAnswers: (attemptId, answers) => session.saveSessionAnswers(sessionId, attemptId, answers),
    submitAttempt: () => { throw new Error('La evaluación se entrega completa.') },
  }), [sessionId, session])

  if (query.isLoading) return <div className="space-y-3"><Skeleton className="h-24 rounded-md" /><Skeleton className="h-40 rounded-md" /></div>
  if (query.isError || !query.data) return <ErrorState title="No se pudo cargar el cuestionario" description={query.error?.message} onRetry={() => query.refetch()} />
  return (
    <div className="space-y-4">
      <Instructions body={activity.body} />
      <MaterialList sessionId={sessionId} resources={activity.resources} disabled={disabled} />
      <LmsQuizSourceContext.Provider value={source}>
        <QuizAttempt
          attempt={query.data} layout={activity.settings?.layout ?? 'one'} sessionMode disabled={disabled}
          onExpired={onClosed} onFinished={() => {}} onAnswersChange={onAnswered}
        />
      </LmsQuizSourceContext.Provider>
    </div>
  )
}

// Delivery inside a session: text autosaved; files verified and versioned by the
// server (DeliveryFiles). Nothing is sent until the session is.
export function DeliveryActivity({ sessionId, activity, disabled, onClosed }) {
  const client = useQueryClient()
  const save = useSaveDraft(sessionId)
  const submission = activity.submission ?? {}
  const [text, setText] = useState(submission.text ?? '')
  const [state, setState] = useState(null)
  const dirty = useRef(false)
  const settings = activity.settings ?? {}

  async function persist(data) {
    setState('saving')
    try {
      const result = await save.mutateAsync({ activityId: activity.id, ...data })
      setState('saved')
      client.setQueryData([KEY, 'session', sessionId], (old) => (old ? {
        ...old, activities: old.activities.map((item) => (item.id === activity.id ? { ...item, submission: { ...item.submission, text: result.text } } : item)),
      } : old))
      return true
    } catch (error) {
      setState('error')
      if (['EXPIRED', 'SESSION_CLOSED'].includes(errorCode(error))) onClosed()
      else toast.error(error.message || 'No se pudo guardar la entrega.')
      return false
    }
  }

  useEffect(() => {
    if (!dirty.current || disabled) return undefined
    const timer = setTimeout(() => { dirty.current = false; persist({ text }) }, TEXT_SAVE_MS)
    return () => clearTimeout(timer)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Instructions body={activity.body} />
      <MaterialList sessionId={sessionId} resources={activity.resources} disabled={disabled} />
      {settings.allowText ? (
        <TextareaField
          label="Tu respuesta" value={text} rows={10} maxLength={50000} disabled={disabled}
          onChange={(event) => { dirty.current = true; setText(event.target.value) }}
          hint="Se guarda sola mientras escribes."
        />
      ) : null}
      {settings.allowFiles ? <DeliveryFiles sessionId={sessionId} activity={activity} disabled={disabled} onClosed={onClosed} /> : null}
      {state ? (
        <p className={cn('flex items-center gap-1 text-xs', state === 'error' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')} aria-live="polite">
          {state === 'saved' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}{SAVE_LABELS[state]}
        </p>
      ) : null}
    </div>
  )
}
