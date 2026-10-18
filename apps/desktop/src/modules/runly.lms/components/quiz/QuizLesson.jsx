import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, ErrorState, Skeleton, StatStrip } from '@runly/ui'
import { Eye, Loader2, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { KEY } from '../../hooks/useLmsData.js'
import { errorCode, useAttempt, useQuiz, useRefreshLearner, useStartAttempt } from '../../hooks/useLmsEval.js'
import { attemptsText, formatPct, quizState } from '../../lib/lmsEval.js'
import { QuizAttempt } from './QuizAttempt.jsx'
import { AttemptStatusBadge, QuizResult } from './QuizResult.jsx'

const START_ERRORS = {
  NO_ATTEMPTS: 'Ya no tienes intentos disponibles para este examen.',
  NO_QUESTIONS: 'Este examen aún no tiene preguntas. Avísale a tu instructor.',
}

function Loading() {
  return <div className="space-y-3"><Skeleton className="h-24 rounded-md" /><Skeleton className="h-40 rounded-md" /></div>
}

function StartCard({ summary, state, starting, onStart, onViewLast }) {
  const settings = summary.settings ?? {}
  const last = summary.lastAttempt
  return (
    <section className="space-y-4 rounded-md border border-[hsl(var(--border))] p-4">
      <StatStrip
        items={[
          { key: 'passing', label: 'Mínima para aprobar', value: `${settings.passingScore ?? 70}%`, icon: 'Target' },
          { key: 'attempts', label: 'Intentos', value: attemptsText(summary.attemptsUsed, summary.attemptsAllowed), icon: 'RotateCcw' },
          { key: 'time', label: 'Tiempo límite', value: settings.timeLimitMinutes ? `${settings.timeLimitMinutes} min` : 'Sin límite', icon: 'Timer' },
          { key: 'best', label: 'Mejor calificación', value: formatPct(summary.bestScorePct), icon: 'Award' },
        ]}
      />
      {last ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[hsl(var(--muted-foreground))]">Último intento:</span>
          <AttemptStatusBadge attempt={last} />
          {last.scorePct !== null && last.scorePct !== undefined ? <span className="tabular-nums">{formatPct(last.scorePct)}</span> : null}
          {last.status !== 'in_progress' ? <Button variant="ghost" size="sm" onClick={() => onViewLast(last.id)}><Eye />Ver resultado</Button> : null}
        </div>
      ) : null}
      {state.pendingReview ? <Alert><AlertDescription>Tu último intento está en revisión. Podrás continuar cuando el instructor lo califique.</AlertDescription></Alert> : null}
      {state.outOfAttempts ? <Alert><AlertDescription>Usaste todos tus intentos sin aprobar. Pide a tu instructor un intento extra.</AlertDescription></Alert> : null}
      {settings.timeLimitMinutes && !state.resume && state.canStart ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Al comenzar corre el tiempo. Si se acaba, el examen se envía con las respuestas guardadas.</p>
      ) : null}
      {state.canStart ? (
        <div className="flex justify-end">
          <Button onClick={onStart} disabled={starting}>
            {starting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : state.resume ? <Play /> : last ? <RotateCcw /> : <Play />}
            {state.resume ? 'Continuar intento' : last ? 'Intentar de nuevo' : 'Comenzar examen'}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

// Quiz lesson in the player: start card -> attempt -> result.
export function QuizLesson({ lessonId, courseId }) {
  const client = useQueryClient()
  const quiz = useQuiz(lessonId)
  const start = useStartAttempt()
  const refresh = useRefreshLearner(courseId, lessonId)
  const [view, setView] = useState({ mode: 'start', id: null })
  const attempt = useAttempt(view.id)

  async function begin() {
    try {
      const started = await start.mutateAsync(lessonId)
      setView({ mode: started?.status === 'in_progress' ? 'attempt' : 'result', id: started.id })
    } catch (error) {
      toast.error(START_ERRORS[errorCode(error)] ?? error.message ?? 'No se pudo iniciar el examen.')
      quiz.refetch()
    }
  }

  // The server closed the attempt (time is up): read it again as submitted.
  function expired() {
    client.invalidateQueries({ queryKey: [KEY, 'attempt', view.id] })
    refresh()
    setView((current) => ({ ...current, mode: 'result' }))
  }

  if (quiz.isLoading) return <Loading />
  if (quiz.isError) return <ErrorState title="No se pudo cargar el examen" description={quiz.error?.message} onRetry={() => quiz.refetch()} />
  const summary = quiz.data
  if (!summary) return null
  const state = quizState(summary)

  if (view.mode !== 'start') {
    if (attempt.isLoading) return <Loading />
    if (attempt.isError) return <ErrorState title="No se pudo abrir el intento" description={attempt.error?.message} onRetry={() => attempt.refetch()} />
    const data = attempt.data
    if (!data) return null
    if (view.mode === 'attempt' && data.status === 'in_progress') {
      return (
        <QuizAttempt
          key={data.id} attempt={data} courseId={courseId} lessonId={lessonId} layout={summary.settings?.layout} onExpired={expired}
          onFinished={(result) => setView({ mode: 'result', id: result?.id ?? data.id })}
        />
      )
    }
    return (
      <QuizResult
        attempt={data} passingScore={summary.settings?.passingScore}
        canRetry={state.canStart && !state.resume && data.status !== 'submitted'} retrying={start.isPending}
        onRetry={begin} onBack={() => setView({ mode: 'start', id: null })}
      />
    )
  }

  return <StartCard summary={summary} state={state} starting={start.isPending} onStart={begin} onViewLast={(id) => setView({ mode: 'result', id })} />
}
