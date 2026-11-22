import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, ErrorState, LoadingState, NotFoundState, PageHeader, ProgressBar, SegmentedControl, Skeleton, StatusPill, TextField } from '@runly/ui'
import { ArrowLeft, CalendarDays, ChevronRight, Keyboard, ScanLine, Wifi, WifiOff } from 'lucide-react'
import { beep, haptic, requestWakeLock } from '../../runly.attendance/kiosk/lib/feedback.js'
import { formatDateTime, formatDay, formatTime } from '../../runly.bookings/lib/bookingsTime.js'
import { runly } from '../../../lib/runly.js'
import { CheckinResult, RecentScans } from '../components/CheckinResult.jsx'
import { CheckinScanner } from '../components/CheckinScanner.jsx'
import { PageShell } from '../components/shared.jsx'
import { useCheckinBoard, useCheckinSessions, useToken } from '../hooks/useTicketing.js'
import { MUTED, SCAN_RESULT, ticketingError, ticketingPath } from '../lib/ticketingLabels.js'

const TIMEOUT_MS = 8000
const CODE = /^[0-9A-Fa-f]{10}$/

// Random id of this reader (not a credential): rate limits and the audit only.
function readerId() {
  const make = () => `rd-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
  try {
    const saved = localStorage.getItem('runly.ticketing.reader')
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved
    const id = make()
    localStorage.setItem('runly.ticketing.reader', id)
    return id
  } catch { return make() }
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

const windowState = (s, now = Date.now()) => {
  const opens = new Date(s.opensAt).getTime(), closes = new Date(s.closesAt).getTime()
  return now < opens ? { label: `Abre ${formatTime(s.opensAt, s.timezone)}`, tone: 'neutral' } : now >= closes ? { label: 'Admisión cerrada', tone: 'neutral' } : { label: 'Admisión abierta', tone: 'success' }
}

// /checkin (choose a function) and /checkin/:sessionId (the gate).
export default function TicketingCheckin() {
  const { '*': wildcard } = useParams()
  const [, sessionId = null] = String(wildcard ?? '').split('/').filter(Boolean)
  return sessionId ? <CheckinGate sessionId={sessionId} /> : <CheckinHome />
}

function CheckinHome() {
  const navigate = useNavigate()
  const sessions = useCheckinSessions()
  const groups = []
  for (const s of sessions.data ?? []) {
    const g = groups.find((x) => x.eventId === s.eventId) ?? groups[groups.push({ eventId: s.eventId, title: s.title, venue: s.venue, items: [] }) - 1]
    g.items.push(s)
  }
  return (
    <PageShell>
      <PageHeader eyebrow="Boletos" title="Control de acceso" description="Elige la función y escanea los boletos en la entrada." />
      {sessions.isPending ? (
        <div className="grid gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : sessions.isError ? (
        sessions.error?.status === 403
          ? <NotFoundState title="Sin acceso al control de entradas" description="Necesitas el permiso «Controlar el acceso a eventos»." />
          : <ErrorState title="No se pudieron cargar las funciones" onRetry={() => sessions.refetch()} />
      ) : !groups.length ? (
        <EmptyState icon={ScanLine} title="No hay funciones por controlar" description="Aparecen aquí las funciones próximas de los eventos en cuyo equipo estás." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.eventId} aria-label={g.title} className="space-y-2">
              <div><h2 className="text-base font-semibold">{g.title}</h2>{g.venue ? <p className={MUTED}>{g.venue}</p> : null}</div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((s) => {
                  const w = windowState(s)
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => navigate(ticketingPath(`/checkin/${s.id}`))} className="group flex w-full items-center gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left transition-colors hover:border-[hsl(var(--primary)/0.5)] focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none">
                        <CalendarDays className="size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium capitalize">{formatDay(s.startsAt, s.timezone)}</p>
                          <p className={MUTED}>{formatTime(s.startsAt, s.timezone)} · admisión {formatTime(s.opensAt, s.timezone)} a {formatTime(s.closesAt, s.timezone)}</p>
                          <StatusPill tone={w.tone} size="sm" className="mt-2">{w.label}</StatusPill>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

function CheckinGate({ sessionId }) {
  const navigate = useNavigate()
  const token = useToken()
  const board = useCheckinBoard(sessionId)
  const online = useOnline()
  const [deviceId] = useState(readerId)
  const [mode, setMode] = useState('admit')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(null)
  const busyRef = useRef(false)
  const clearRef = useRef(null)

  useEffect(() => { let lock = null; requestWakeLock().then((l) => { lock = l }); return () => { lock?.release?.().catch?.(() => {}) } }, [])
  useEffect(() => () => clearTimeout(clearRef.current), [])

  const send = useCallback(async (body, { manual = false } = {}) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    clearTimeout(clearRef.current)
    let next, timer
    try {
      // A hung request must not freeze the gate; the server may still have admitted it,
      // which the next scan of the same QR reports as "ya registrado en este lector".
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new TypeError('timeout')), TIMEOUT_MS) })
      const response = await Promise.race([runly.ticketing.scan(sessionId, { ...body, deviceId }, token), timeout])
      const data = response?.data ?? response
      next = { kind: data.result === 'admitted' ? 'ok' : data.result === 'valid' ? 'valid' : data.reason, data, body, manual }
    } catch (error) {
      next = { kind: error?.status === 429 ? 'rate_limited' : error?.status ? 'error' : 'network', data: null, body, manual, message: error?.status ? ticketingError(error) : null }
    } finally {
      clearTimeout(timer)
      busyRef.current = false
      setBusy(false)
    }
    setResult(next)
    const tone = (SCAN_RESULT[next.kind] ?? SCAN_RESULT.error).tone
    beep(tone === 'success' ? 'in' : tone === 'info' ? 'info' : 'error')
    haptic(tone === 'success' ? 40 : [80, 60, 80])
    if (next.kind === 'ok') clearRef.current = setTimeout(() => setResult((r) => (r === next ? null : r)), 3500)
    board.refetch()
  }, [board, deviceId, sessionId, token])

  const onText = useCallback((text) => send({ text, admit: mode === 'admit' }), [mode, send])

  // Typed entries always validate first; staff confirm with the ticket in front of them.
  function submitCode(e) {
    e.preventDefault()
    const value = code.trim()
    if (/^RT1\./.test(value)) { setCodeError(null); send({ text: value, admit: false }, { manual: true }); return }
    if (!CODE.test(value)) { setCodeError('Escribe los 10 caracteres del código del boleto.'); return }
    setCodeError(null)
    send({ code: value, admit: false }, { manual: true })
  }
  const admitManual = () => result?.body && send({ ...result.body, admit: true }, { manual: result.manual }).then(() => setCode(''))

  if (board.isPending) return <GateFrame><LoadingState /></GateFrame>
  if (board.isError && !board.data) {
    return (
      <GateFrame>
        <div className="mx-auto w-full max-w-lg p-4">
          {board.error?.status === 404 || board.error?.status === 403
            ? <NotFoundState title="Función no disponible" description="No existe o no formas parte del equipo de este evento."><Button type="button" variant="outline" onClick={() => navigate(ticketingPath('/checkin'))}>Elegir otra función</Button></NotFoundState>
            : <ErrorState title="No se pudo abrir el control de acceso" onRetry={() => board.refetch()} />}
        </div>
      </GateFrame>
    )
  }
  const { session, stats, recent } = board.data
  const total = stats.admitted + stats.pending
  const w = windowState(session)

  return (
    <GateFrame>
      <header className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 sm:px-5">
        <Button type="button" variant="ghost" size="icon" aria-label="Volver a las funciones" onClick={() => navigate(ticketingPath('/checkin'))}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{session.title}</p>
          <p className={`${MUTED} truncate`}>{formatDateTime(session.startsAt, session.timezone)} · <span>{w.label}</span></p>
        </div>
        <StatusPill tone={online && !board.isError ? 'success' : 'danger'} size="sm" icon={online && !board.isError ? Wifi : WifiOff}>{online && !board.isError ? 'En línea' : 'Sin conexión'}</StatusPill>
      </header>

      {!online ? (
        <div role="alert" className="shrink-0 bg-red-600 px-4 py-2 text-center text-sm font-medium text-white">Sin conexión: ninguna entrada se puede confirmar hasta recuperar la red.</div>
      ) : null}

      <div className="mx-auto grid w-full max-w-6xl min-w-0 flex-1 gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <SegmentedControl ariaLabel="Modo de lectura" value={mode} onChange={setMode} options={[{ value: 'admit', label: 'Registrar entrada' }, { value: 'verify', label: 'Solo verificar' }]} className="w-full" />
          <CheckinScanner onText={onText} paused={busy} />
          <CheckinResult result={result} timezone={session.timezone} deviceId={deviceId} onAdmit={admitManual} admitting={busy} onDismiss={() => setResult(null)} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Asistencia" className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Counter label="Admitidos" value={stats.admitted} strong />
              <Counter label="Pendientes" value={stats.pending} />
              <Counter label="Rechazos" value={stats.rejected} />
            </div>
            <ProgressBar value={total ? Math.round((stats.admitted / total) * 100) : 0} className="mt-3 h-1.5" aria-label="Asistentes admitidos" />
            <p className={`${MUTED} mt-1.5`}>{stats.admitted} de {total} boletos vigentes ya entraron{board.isFetching ? ' · actualizando' : ''}</p>
          </section>

          <section aria-label="Entrada manual" className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <form onSubmit={submitCode} className="flex items-start gap-2" noValidate>
              <TextField label="Código del boleto" icon={Keyboard} value={code} onChange={(e) => setCode(e.target.value)} error={codeError} placeholder="Ej. 3FA2C91B0D" autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono uppercase" />
              <Button type="submit" variant="outline" disabled={busy} className="mt-6 shrink-0">Buscar</Button>
            </form>
            <p className={`${MUTED} mt-2`}>Para un QR que no se lee. Revisa el nombre antes de registrar la entrada.</p>
          </section>

          <section aria-label="Lecturas recientes" className="min-h-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h2 className="text-sm font-semibold">Lecturas recientes</h2>
            <RecentScans items={recent} timezone={session.timezone} />
          </section>
        </div>
      </div>
    </GateFrame>
  )
}

function Counter({ label, value, strong }) {
  return (
    <div>
      <p className={`text-3xl font-bold tabular-nums ${strong ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{value}</p>
      <p className={MUTED}>{label}</p>
    </div>
  )
}

// Full screen over the app shell: the gate is the only task on this device.
function GateFrame({ children }) {
  return <div className="fixed inset-0 z-50 flex h-dvh flex-col overflow-x-hidden overflow-y-auto bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">{children}</div>
}
