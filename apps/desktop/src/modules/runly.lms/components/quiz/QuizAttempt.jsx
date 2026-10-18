import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ConfirmDialog, ProgressBar, cn } from '@runly/ui'
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { errorCode, useSaveAnswers, useSubmitAttempt } from '../../hooks/useLmsEval.js'
import { answeredPct, toggleFlag } from '../../lib/lmsAnswers.js'
import { countUnanswered, formatCountdown, remainingMs } from '../../lib/lmsEval.js'
import { QuizNavigator } from './QuizNavigator.jsx'
import { QuizQuestionField } from './QuizQuestionField.jsx'

const AUTOSAVE_MS = 800
const FLAGS_KEY = (id) => `runly.lms.flags.${id}`

// "Revisar después" marks live in this browser only (sessionStorage, best effort).
function useFlags(attemptId) {
  const [flags, setFlags] = useState(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem(FLAGS_KEY(attemptId)) ?? '[]')) } catch { return new Set() }
  })
  const toggle = (id) => setFlags((current) => {
    const next = toggleFlag(current, id)
    try { sessionStorage.setItem(FLAGS_KEY(attemptId), JSON.stringify([...next])) } catch { /* storage unavailable */ }
    return next
  })
  return [flags, toggle]
}

const SAVE_LABELS = { saving: 'Guardando…', saved: 'Respuestas guardadas', error: 'No se pudieron guardar las respuestas' }

function useNow(enabled) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}

// An in-progress attempt, answers autosaved (debounced), countdown when timed
// (auto-submit at 0), submit with confirm. `layout` 'all' shows every question
// on one page; 'one' shows one at a time with Anterior / Siguiente and a
// question navigator. `onFinished(attempt)` gets the submitted attempt;
// `onExpired()` runs when the server already closed the attempt.
export function QuizAttempt({ attempt, courseId, lessonId, layout = 'all', onFinished, onExpired }) {
  const [answers, setAnswers] = useState(() => attempt.answers ?? {})
  const [saveState, setSaveState] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const save = useSaveAnswers(), submit = useSubmitAttempt(courseId, lessonId)
  const dirty = useRef(false), closed = useRef(false), answersRef = useRef(answers)
  answersRef.current = answers

  const questions = attempt.questions ?? []
  const unanswered = countUnanswered(questions, answers)
  const [flags, toggleFlagged] = useFlags(attempt.id)
  const [current, setCurrent] = useState(0)
  const single = layout === 'one' && questions.length > 1
  const go = (index) => {
    setCurrent(Math.max(0, Math.min(questions.length - 1, index)))
    if (typeof window !== 'undefined') window.requestAnimationFrame?.(() => document.getElementById('lms-quiz-current')?.scrollIntoView?.({ block: 'nearest' }))
  }
  const now = useNow(Boolean(attempt.deadlineAt))
  const left = remainingMs(attempt.deadlineAt, now)

  const handleError = useCallback((error) => {
    if (errorCode(error) === 'EXPIRED' || error?.status === 409) {
      closed.current = true
      toast.warning('Se acabó el tiempo. El examen se envió con las respuestas guardadas.')
      onExpired()
      return true
    }
    return false
  }, [onExpired])

  // Debounced autosave of the whole answer map (the API merges it).
  useEffect(() => {
    if (!dirty.current || closed.current) return undefined
    const timer = setTimeout(async () => {
      dirty.current = false
      setSaveState('saving')
      try {
        await save.mutateAsync({ attemptId: attempt.id, answers: answersRef.current })
        setSaveState('saved')
      } catch (error) {
        if (!handleError(error)) setSaveState('error')
      }
    }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, attempt.id])

  const send = useCallback(async () => {
    if (closed.current) return
    closed.current = true
    dirty.current = false
    try {
      const result = await submit.mutateAsync({ attemptId: attempt.id, answers: answersRef.current })
      setConfirmOpen(false)
      onFinished(result)
    } catch (error) {
      if (!handleError(error)) {
        closed.current = false
        toast.error(error.message || 'No se pudo enviar el examen.')
      }
    }
  }, [attempt.id, submit, onFinished, handleError])

  // Time is up: submit what the learner has.
  useEffect(() => { if (left === 0 && !closed.current) send() }, [left, send])

  function answer(questionId, value) {
    dirty.current = true
    setAnswers((current) => ({ ...current, [questionId]: value }))
  }

  const busy = submit.isPending || closed.current
  const sendButton = (
    <Button onClick={() => setConfirmOpen(true)} disabled={busy}>
      {submit.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}Enviar examen
    </Button>
  )
  const field = (question, index) => (
    <QuizQuestionField
      key={question.id} question={question} index={index} total={single ? questions.length : undefined} answer={answers[question.id]} disabled={busy}
      onAnswer={(value) => answer(question.id, value)} flagged={flags.has(question.id)} onToggleFlag={() => toggleFlagged(question.id)}
    />
  )
  const flaggedCount = questions.filter((question) => flags.has(question.id)).length
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-1 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium tabular-nums">{questions.length - unanswered} de {questions.length} respondidas</p>
          {saveState ? (
            <span className={cn('flex items-center gap-1 text-xs', saveState === 'error' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')}>
              {saveState === 'saved' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}{SAVE_LABELS[saveState]}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            {left !== null ? (
              <span
                className={cn('flex items-center gap-1.5 text-sm font-semibold tabular-nums', left < 60_000 ? 'text-[hsl(var(--destructive))]' : '')}
                role="timer" aria-label="Tiempo restante"
              >
                <Clock className="h-4 w-4" aria-hidden="true" />{formatCountdown(left)}
              </span>
            ) : null}
            {sendButton}
          </div>
        </div>
        <ProgressBar value={answeredPct(questions, answers)} aria-label="Avance del examen" />
      </div>
      {single ? (
        <>
          <div id="lms-quiz-current" className="scroll-mt-28 space-y-4">
            <QuizNavigator questions={questions} answers={answers} flags={flags} current={current} onGo={go} />
            {questions[current] ? field(questions[current], current) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => go(current - 1)} disabled={current === 0}><ChevronLeft />Anterior</Button>
            {current < questions.length - 1
              ? <Button variant="outline" onClick={() => go(current + 1)}>Siguiente<ChevronRight /></Button>
              : sendButton}
          </div>
        </>
      ) : (
        <>
          {questions.map(field)}
          <div className="flex justify-end">{sendButton}</div>
        </>
      )}
      <ConfirmDialog
        open={confirmOpen} onOpenChange={setConfirmOpen}
        icon={Send}
        tone={unanswered || flaggedCount ? 'warning' : 'primary'}
        title="Enviar examen"
        description={[
          unanswered ? `Tienes ${unanswered} ${unanswered === 1 ? 'pregunta sin responder' : 'preguntas sin responder'}.` : null,
          flaggedCount ? `Marcaste ${flaggedCount} para revisar después.` : null,
          'Después de enviar no podrás cambiar tus respuestas.',
        ].filter(Boolean).join(' ')}
        confirmLabel="Enviar"
        loading={submit.isPending}
        onConfirm={send}
      />
    </div>
  )
}
