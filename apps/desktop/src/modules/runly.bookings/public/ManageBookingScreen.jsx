import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, ConfirmDialog, EmptyState, Skeleton, StatusPill } from '@runly/ui'
import { AlertTriangle, CalendarSync, Link2Off, Loader2, XCircle } from 'lucide-react'
import { STATUS } from '../lib/bookingsLabels.js'
import { addDays, dayKey, formatDateTime } from '../lib/bookingsTime.js'
import { Card, LocationLines, MeetingJoin, PoliciesList, PortalHeader, SlotChooser, SummaryRows } from './PortalParts.jsx'
import { Shell } from './PublicBookingScreen.jsx'
import { isNetworkError, portalApi, portalError, unwrap, useAttemptKey } from './portalLib.js'

// Customer's own booking from the link in the confirmation email. The token is
// read from the URL fragment (#...), which browsers never send to any server.
export default function ManageBookingScreen() {
  const location = useLocation()
  const token = decodeURIComponent(location.hash.replace(/^#/, ''))
  const client = useQueryClient()
  const view = useQuery({ queryKey: ['bookings-manage', token], queryFn: async () => unwrap(await portalApi.manage(token)), enabled: Boolean(token), retry: false })
  const [mode, setMode] = useState('view')
  const [slot, setSlot] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [keyFor, newAttempt] = useAttemptKey()
  useEffect(() => { setSlot(null) }, [mode])

  if (!token) return <Shell><EmptyState icon={Link2Off} title="Falta el enlace" description="Abre el enlace completo que recibiste por correo." /></Shell>
  if (view.isPending) return <Shell><Skeleton className="h-16 w-2/3" /><Skeleton className="h-64 w-full" /></Shell>
  if (view.isError) {
    return <Shell><EmptyState icon={Link2Off} title="No pudimos abrir tu reservación" description={portalError(view.error)} action={isNetworkError(view.error) ? <Button type="button" onClick={() => view.refetch()}>Reintentar</Button> : null} /></Shell>
  }
  const { booking: b, actions, company, space, page } = view.data
  const tz = b.timezone
  const status = STATUS[b.status] ?? { label: b.status, tone: 'neutral' }

  async function run(fn, done) {
    setBusy(true); setMessage(null)
    try {
      await fn()
      newAttempt(); setMode('view'); setMessage({ tone: 'ok', text: done })
      await view.refetch()
    } catch (error) {
      if (error?.code === 'SLOT_TAKEN' || error?.code === 'SESSION_FULL') { setSlot(null); newAttempt(); client.invalidateQueries({ queryKey: ['bookings-manage-slots'] }) }
      setMessage({ tone: 'error', text: portalError(error) })
    } finally { setBusy(false) }
  }
  const reschedule = () => {
    const data = slot.sessionId ? { sessionId: slot.sessionId } : { startsAt: slot.startsAt }
    return run(() => portalApi.reschedule(token, data, keyFor({ action: 'reschedule', ...data })), 'Tu reservación se reprogramó. Te enviaremos un correo con el nuevo horario.')
  }
  const cancel = () => run(() => portalApi.cancel(token, keyFor({ action: 'cancel' })), 'Tu reservación quedó cancelada.').then(() => setConfirmCancel(false))

  return (
    <Shell accent={page?.accentColor}>
      <PortalHeader company={company} title="Tu reservación" subtitle={space?.name} />
      {message ? <Alert variant={message.tone === 'error' ? 'destructive' : 'default'} aria-live="polite">{message.tone === 'error' ? <AlertTriangle className="h-4 w-4" /> : null}<AlertDescription>{message.text}</AlertDescription></Alert> : null}
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {b.status === 'PENDING' ? <span className="text-sm text-[hsl(var(--muted-foreground))]">El negocio todavía debe confirmarla.</span> : null}
        </div>
        <SummaryRows rows={[
          ['Folio', b.reference], ['Servicio', b.service?.name], ['Fecha y hora', `${formatDateTime(b.startsAt, tz)} (${tz})`],
          ['Duración', b.service ? `${b.service.durationMinutes} min` : null], ['Profesional', b.resourceNames?.join(', ')],
          ['Personas', b.partySize > 1 ? String(b.partySize) : null], ['Nombre', b.guestName], ['Correo', b.guestEmail], ['Teléfono', b.guestPhone],
        ]} />
        {b.meeting ? <MeetingJoin meeting={b.meeting} /> : page ? <LocationLines location={page.location} instructions={page.instructions} /> : null}
        {mode === 'view' && actions.length ? (
          <div className="flex flex-wrap gap-2">
            {actions.includes('reschedule') ? <Button type="button" onClick={() => setMode('reschedule')}><CalendarSync />Reprogramar</Button> : null}
            {actions.includes('cancel') ? <Button type="button" variant="outline" onClick={() => setConfirmCancel(true)}><XCircle />Cancelar reservación</Button> : null}
          </div>
        ) : null}
        {mode === 'view' && !actions.length && ['PENDING', 'CONFIRMED'].includes(b.status) ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Ya no es posible cambiar esta reservación en línea. Si necesitas ayuda, comunícate con el negocio.</p>
        ) : null}
      </Card>

      {mode === 'reschedule' ? (
        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Elige un nuevo horario</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Tu horario actual se mantiene hasta que el nuevo quede confirmado.</p>
          <SlotChooser
            timezone={tz} value={slot} onChange={setSlot}
            maxDay={page?.policies ? addDays(dayKey(new Date(), tz), page.policies.horizonDays) : undefined}
            queryKey={['bookings-manage-slots', token]}
            fetchWeek={(from, to) => portalApi.manageAvailability(token, { from, to })}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMode('view')}>Volver</Button>
            <Button type="button" disabled={!slot || busy} onClick={reschedule}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Confirmar nuevo horario</Button>
          </div>
        </Card>
      ) : null}

      {page?.policies ? <Card className="space-y-2"><h2 className="text-sm font-semibold">Políticas</h2><PoliciesList policies={page.policies} /></Card> : null}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar reservación"
        description="Se libera tu horario. Si quieres volver, tendrás que hacer una reservación nueva."
        confirmLabel="Cancelar reservación"
        cancelLabel="Volver"
        loading={busy}
        onConfirm={cancel}
      />
    </Shell>
  )
}
