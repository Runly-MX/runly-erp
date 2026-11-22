import { useCallback, useState } from 'react'
import { Alert, AlertDescription, Button, ErrorState, Skeleton, cn } from '@runly/ui'
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Send } from 'lucide-react'
import { DeliveryActivity, QuizActivity } from './RunnerActivities.jsx'
import { RunnerDone, SessionTimer, SubmitDialog } from './RunnerParts.jsx'
import { useSession, useSubmitSession } from '../../hooks/useLmsSession.js'
import { formatPoints } from '../../lib/lmsAssessment.js'
import { activityProgress } from '../../lib/lmsSession.js'

const answeredCount = (answers) => Object.values(answers ?? {}).filter((value) => value !== null && value !== undefined && !['""', '{}', '[]'].includes(JSON.stringify(value))).length

export function Centered({ children }) {
  return <div className="flex min-h-[60dvh] items-center justify-center p-6">{children}</div>
}

// Shared by the internal runner (/evaluate/:id) and the public link: the
// transport comes from SessionSourceContext. `exitLabel` names where onExit goes.
// One running session: fixed header (timer, submit), activity stepper, body.
export function SessionView({ sessionId, onExit, exitLabel }) {
  const [timeUp, setTimeUp] = useState(false)
  const query = useSession(sessionId, { refetchInterval: (q) => (timeUp && q.state.data?.session?.status === 'in_progress' ? 5000 : false) })
  const submit = useSubmitSession(sessionId)
  const [current, setCurrent] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [answered, setAnswered] = useState({})
  const refresh = useCallback(() => query.refetch(), [query])
  const onTimeUp = useCallback(() => setTimeUp(true), [])

  if (query.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-12 rounded-md" /><Skeleton className="h-96 rounded-2xl" /></div>
  if (query.isError || !query.data) return <Centered><ErrorState title="No se pudo cargar la evaluación" description={query.error?.message} onRetry={() => query.refetch()} /></Centered>
  const payload = query.data
  if (payload.session.status !== 'in_progress') return <RunnerDone payload={payload} onExit={onExit} exitLabel={exitLabel} />

  const activities = payload.activities.map((item) => (item.kind === 'quiz' && answered[item.id] !== undefined ? { ...item, answeredCount: answered[item.id] } : item))
  const activity = activities[current]
  const locked = timeUp || submit.isPending
  async function doSubmit() {
    try { await submit.mutateAsync(); setReviewOpen(false) } catch { /* toast shown */ }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-20 shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Evaluación</p>
            <h1 className="truncate text-base font-semibold sm:text-lg">{payload.assessment.title}</h1>
          </div>
          <SessionTimer expiresAt={payload.session.expiresAt} offset={payload.offset} onTimeUp={onTimeUp} />
          <Button onClick={() => setReviewOpen(true)} disabled={locked}><Send />Entregar</Button>
        </div>
      </header>
      {timeUp ? (
        <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
          <Alert><AlertDescription>Se terminó el tiempo. Estamos entregando lo que tenías guardado…</AlertDescription></Alert>
        </div>
      ) : null}
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row">
        <nav aria-label="Actividades" className="shrink-0 lg:w-64">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {activities.map((item, index) => {
              const progress = activityProgress(item)
              const active = index === current
              return (
                <li key={item.id} className="shrink-0 lg:shrink">
                  <button
                    type="button" onClick={() => setCurrent(index)} aria-current={active ? 'step' : undefined}
                    className={cn('flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      active ? 'border-transparent bg-[hsl(var(--muted))] font-medium' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.6)]')}
                  >
                    {progress.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
                    <span className="min-w-0">
                      <span className="block max-w-[14rem] truncate">{index + 1}. {item.title}</span>
                      <span className="block text-xs font-normal text-[hsl(var(--muted-foreground))]">{progress.label}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
        <main className="min-w-0 flex-1 space-y-4 pb-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{activity.title}</h2>
            <span className="text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{formatPoints(activity.maxPoints)}</span>
          </div>
          {/* Every activity stays mounted: switching keeps typed text, pending saves and uploads. */}
          {activities.map((item, index) => (
            <div key={item.id} hidden={index !== current}>
              {item.kind === 'quiz'
                ? <QuizActivity sessionId={sessionId} activity={item} disabled={locked} onClosed={refresh} onAnswered={(answers) => setAnswered((prev) => ({ ...prev, [item.id]: answeredCount(answers) }))} />
                : <DeliveryActivity sessionId={sessionId} activity={item} disabled={locked} onClosed={refresh} />}
            </div>
          ))}
          {/* "Actividad" on both sides: quizzes have their own Anterior/Siguiente for questions just above.
              Phones: two equal columns whose labels may wrap, never wider than the screen. */}
          <div className="grid grid-cols-2 gap-2 border-t border-[hsl(var(--border))] pt-4 sm:flex sm:items-center sm:justify-between">
            <Button variant="outline" className="h-auto min-h-11 whitespace-normal sm:min-h-9" onClick={() => setCurrent((i) => Math.max(0, i - 1))} disabled={current === 0}><ChevronLeft />Actividad anterior</Button>
            {current < activities.length - 1
              ? <Button variant="outline" className="h-auto min-h-11 whitespace-normal sm:min-h-9" onClick={() => setCurrent((i) => i + 1)}>Siguiente actividad<ChevronRight /></Button>
              : <Button className="h-auto min-h-11 whitespace-normal sm:min-h-9" onClick={() => setReviewOpen(true)} disabled={locked}><Send />Revisar y entregar</Button>}
          </div>
        </main>
      </div>
      <SubmitDialog open={reviewOpen} onOpenChange={setReviewOpen} activities={activities} onSubmit={doSubmit} pending={submit.isPending} />
    </div>
  )
}
