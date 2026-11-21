import { useEffect, useRef, useState } from 'react'
import {
  Alert, AlertDescription, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MarkdownViewer, cn,
} from '@runly/ui'
import { CheckCircle2, CircleDashed, Clock, Hourglass, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { formatPoints, formatTimeLimit } from '../../lib/lmsAssessment.js'
import { SESSION_STATUS_LABELS, activityProgress, crossedWarning, formatClock, isLowTime, remainingFrom } from '../../lib/lmsSession.js'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : null)

// Countdown on the server clock (expiresAt + offset), never the device time.
// Warns at 10, 5 and 1 minutes; onTimeUp fires once at zero.
export function SessionTimer({ expiresAt, offset, onTimeUp }) {
  const [left, setLeft] = useState(() => remainingFrom(expiresAt, offset, Date.now()))
  const previous = useRef(left)
  const fired = useRef(false)
  const [announce, setAnnounce] = useState('')
  useEffect(() => {
    if (!expiresAt) return undefined
    const tick = () => {
      const next = remainingFrom(expiresAt, offset, Date.now())
      const warning = crossedWarning(previous.current, next)
      if (warning) {
        const message = warning === 1 ? 'Queda 1 minuto.' : `Quedan ${warning} minutos.`
        toast.warning(message)
        setAnnounce(message)
      }
      previous.current = next
      setLeft(next)
      if (next === 0 && !fired.current) { fired.current = true; onTimeUp?.() }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [expiresAt, offset]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!expiresAt) return <span className={MUTED}>Sin límite de tiempo</span>
  return (
    <>
      <span
        role="timer" aria-label={`Tiempo restante ${formatClock(left)}`} data-testid="session-timer"
        className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-base font-semibold tabular-nums', isLowTime(left) ? 'bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]' : 'bg-[hsl(var(--muted))]')}
      >
        <Clock className="h-4 w-4" aria-hidden="true" />{formatClock(left)}
      </span>
      <span className="sr-only" aria-live="assertive">{announce}</span>
    </>
  )
}

// Before starting: what it is, how long, what it contains. The clock starts
// only after confirming in the dialog.
export function RunnerIntro({ overview, onStart, starting }) {
  const [confirm, setConfirm] = useState(false)
  const { assessment, activities, blocker, canStart, sessionsAllowed, sessions } = overview
  const total = activities.every((item) => item.maxPoints !== null) ? activities.reduce((sum, item) => sum + item.maxPoints, 0) : null
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">Evaluación</p>
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{assessment.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline"><Hourglass className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{formatTimeLimit(assessment.timeLimitMinutes)}</Badge>
          <Badge variant="outline">{activities.length} {activities.length === 1 ? 'actividad' : 'actividades'}</Badge>
          {total !== null ? <Badge variant="outline">{formatPoints(total)}</Badge> : null}
          <Badge variant="outline">{sessions.length} de {sessionsAllowed} {sessionsAllowed === 1 ? 'intento' : 'intentos'}</Badge>
        </div>
      </div>
      {assessment.description ? <div className="rounded-lg border border-[hsl(var(--border))] p-4"><MarkdownViewer value={assessment.description} /></div> : null}
      <ol className="space-y-2">
        {activities.map((item, index) => (
          <li key={item.id} className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-sm font-semibold tabular-nums" aria-hidden="true">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
            <span className={cn(MUTED, 'shrink-0 tabular-nums')}>{formatPoints(item.maxPoints)}</span>
          </li>
        ))}
      </ol>
      {assessment.timeLimitMinutes ? (
        <Alert><AlertDescription>
          Tienes {formatTimeLimit(assessment.timeLimitMinutes)} para todas las actividades. El tiempo empieza al confirmar, no se detiene al cambiar de actividad ni al cerrar la página, y al terminar se entrega lo que tengas guardado.
        </AlertDescription></Alert>
      ) : null}
      {blocker ? <Alert><AlertDescription>{blocker.message}</AlertDescription></Alert> : null}
      <Button size="lg" className="w-full sm:w-auto" disabled={!canStart || starting} onClick={() => setConfirm(true)}>
        {starting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Hourglass />}Iniciar evaluación
      </Button>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="md">
          <DialogHeader icon={Hourglass}>
            <DialogTitle>¿Iniciar ahora?</DialogTitle>
            <DialogDescription>
              {assessment.timeLimitMinutes
                ? `El cronómetro de ${formatTimeLimit(assessment.timeLimitMinutes)} empieza en cuanto confirmes y ya no se puede pausar.`
                : 'La evaluación no tiene límite de tiempo. Puedes guardar y volver antes de entregar.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>Todavía no</Button>
            <Button type="button" onClick={() => { setConfirm(false); onStart() }} disabled={starting}>Iniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Final review: what is complete and what is missing, then submit.
export function SubmitDialog({ open, onOpenChange, activities, onSubmit, pending }) {
  const missing = activities.filter((item) => !activityProgress(item).complete).length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={Send} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Entregar evaluación</DialogTitle>
          <DialogDescription>{missing ? `Tienes ${missing} ${missing === 1 ? 'actividad incompleta' : 'actividades incompletas'}. ` : ''}Después de entregar ya no podrás hacer cambios.</DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {activities.map((item) => {
            const progress = activityProgress(item)
            return (
              <li key={item.id} className="flex items-start gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2">
                {progress.complete
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
                  : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{progress.label}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Seguir respondiendo</Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}Entregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// After the session closed (submitted, out of time or graded).
export function RunnerDone({ payload, onExit }) {
  const { session, assessment, activities } = payload
  const timeout = session.closedReason === 'timeout'
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-10 text-center sm:px-6">
      <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--primary))]" aria-hidden="true" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{timeout ? 'Se terminó el tiempo' : 'Evaluación entregada'}</h1>
        <p className={MUTED}>
          {timeout ? 'Entregamos todo lo que tenías guardado.' : 'Tus respuestas y archivos quedaron registrados.'} {assessment.title}.
        </p>
      </div>
      <dl className="mx-auto grid max-w-md grid-cols-2 gap-3 text-left text-sm">
        <div className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3"><dt className={MUTED}>Estado</dt><dd className="font-medium">{SESSION_STATUS_LABELS[session.status] ?? session.status}</dd></div>
        <div className="rounded-md bg-[hsl(var(--muted)/0.6)] p-3"><dt className={MUTED}>Entregada</dt><dd className="font-medium">{dateTime(session.submittedAt) ?? '—'}</dd></div>
        {session.scorePoints !== undefined ? (
          <div className="col-span-2 rounded-md bg-[hsl(var(--muted)/0.6)] p-3"><dt className={MUTED}>Resultado</dt><dd className="text-lg font-semibold tabular-nums">{session.scorePoints} de {session.maxPoints} puntos</dd></div>
        ) : null}
      </dl>
      <ul className="mx-auto max-w-md space-y-1 text-left text-sm">
        {activities.map((item) => <li key={item.id} className="flex justify-between gap-3"><span className="truncate">{item.title}</span><span className={MUTED}>{activityProgress(item).label}</span></li>)}
      </ul>
      <Button variant="outline" onClick={onExit}>Volver a Aprendizaje</Button>
    </div>
  )
}
