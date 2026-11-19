import { useState } from 'react'
import {
  ActivityTimeline, Button, ConfirmDialog, DetailSkeleton, ErrorState, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, TextareaField,
} from '@runly/ui'
import { CalendarSync, Check, CircleCheckBig, Link2, UserX, X, XCircle } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation, useHistory, useIdempotencyKey, useReservation } from '../hooks/useBookings.js'
import { ACTIONS, STATUS } from '../lib/bookingsLabels.js'
import { formatDateTime, formatTime } from '../lib/bookingsTime.js'
import { RescheduleDialog } from './BookingDialogs.jsx'
import { Field, StatusBadge } from './shared.jsx'

const ICONS = { confirm: Check, reject: X, cancel: XCircle, complete: CircleCheckBig, 'no-show': UserX, reschedule: CalendarSync }
const HISTORY_LABEL = {
  create: 'Reservación registrada', confirmed: 'Confirmada', rejected: 'Rechazada', cancelled: 'Cancelada', completed: 'Completada',
  no_show: 'Marcada como no presentada', expire: 'Venció sin confirmarse', reschedule: 'Reprogramada', manage_link: 'Se envió un nuevo enlace al cliente',
}

// One reservation: data, the actions the engine allows right now (`actions`),
// and its append-only history.
export function BookingDetailSheet({ bookingId, onOpenChange, space, services, resources, canOperate }) {
  const tz = space.timezone
  const booking = useReservation(bookingId)
  const history = useHistory(bookingId)
  const keyFor = useIdempotencyKey(Boolean(bookingId))
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const act = useBookingsMutation((t, { action, data, key }) => runly.bookings.transition(bookingId, action, data, t, key), { success: (_d, v) => ACTIONS[v.action].done })
  const rotate = useBookingsMutation((t) => runly.bookings.rotateManageLink(bookingId, t), { success: 'Enlace nuevo en camino al correo del cliente.' })
  const b = booking.data
  const service = services.find((s) => s.id === b?.serviceId)
  const resourceNames = (b?.resourceIds ?? []).map((id) => resources.find((r) => r.id === id)?.name).filter(Boolean)

  async function run(action) {
    const data = { expectedVersion: b.version, ...(reason.trim() ? { reason: reason.trim() } : {}) }
    await act.mutateAsync({ action, data, key: keyFor({ action, ...data }) }).catch(() => {})
    setPending(null); setReason('')
  }

  const items = (history.data ?? []).map((h) => ({
    id: h.id,
    createdAt: h.createdAt,
    actor: h.actorName ? { displayName: h.actorName, name: h.actorName } : { displayName: h.actorKind === 'system' ? 'Sistema' : 'Cliente (portal)', name: h.actorKind === 'system' ? 'Sistema' : 'Cliente (portal)' },
    summary: [
      HISTORY_LABEL[h.action] ?? h.action,
      h.action === 'reschedule' && h.before && h.after ? `de ${formatDateTime(h.before.startsAt, tz)} a ${formatDateTime(h.after.startsAt, tz)}` : null,
      h.after?.reason ? `Motivo: ${h.after.reason}` : null,
    ].filter(Boolean).join(' · '),
  }))
  const actions = canOperate ? (b?.actions ?? []) : []

  return (
    <Sheet open={Boolean(bookingId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <SheetTitle>{b?.guestName || 'Reservación'}</SheetTitle>
          <SheetDescription>{b ? `${service?.name ?? 'Servicio'} · ${formatDateTime(b.startsAt, tz)}` : 'Cargando…'}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {booking.isLoading ? <DetailSkeleton /> : booking.isError ? <ErrorState title="No se pudo abrir la reservación" onRetry={() => booking.refetch()} /> : b ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={b.status} />
                {b.status === 'PENDING' && b.holdExpiresAt ? <span className="text-xs text-[hsl(var(--muted-foreground))]">Vence {formatDateTime(b.holdExpiresAt, tz)}</span> : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Horario">{formatTime(b.startsAt, tz)} a {formatTime(b.endsAt, tz)}</Field>
                <Field label="Recurso">{resourceNames.join(', ') || '—'}</Field>
                <Field label="Personas">{b.partySize}</Field>
                <Field label="Zona horaria">{tz}</Field>
                <Field label="Correo">{b.guestEmail || '—'}</Field>
                <Field label="Teléfono">{b.guestPhone || '—'}</Field>
              </div>
              {b.notes ? <Field label="Notas internas"><span className="whitespace-pre-wrap font-normal">{b.notes}</span></Field> : null}
              {actions.length ? (
                <div className="flex flex-wrap gap-2">
                  {actions.map((action) => {
                    const Icon = ICONS[action]
                    const meta = ACTIONS[action]
                    return (
                      <Button key={action} type="button" variant={action === 'confirm' || action === 'complete' ? 'default' : 'outline'}
                        onClick={() => (action === 'reschedule' ? setRescheduling(true) : meta.destructive ? setPending(action) : run(action))} disabled={act.isPending}>
                        <Icon />{meta.label}
                      </Button>
                    )
                  })}
                </div>
              ) : null}
              {canOperate && b.guestEmail && ['PENDING', 'CONFIRMED'].includes(b.status) ? (
                <div className="space-y-1">
                  <Button type="button" variant="ghost" size="sm" disabled={rotate.isPending} onClick={() => rotate.mutate()}><Link2 />Enviar nuevo enlace al cliente</Button>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">El enlace anterior deja de funcionar. Úsalo si el cliente lo perdió o lo compartió por error.</p>
                </div>
              ) : null}
              <section aria-label="Historial de cambios" className="space-y-2">
                <h3 className="text-sm font-semibold">Historial</h3>
                <ActivityTimeline items={items} loading={history.isLoading} error={history.isError ? 'No se pudo cargar el historial.' : null} emptyMessage="Sin cambios registrados." heightClass="" />
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(v) => { if (!v) { setPending(null); setReason('') } }}
        title={pending ? ACTIONS[pending].label : ''}
        description={pending ? `${ACTIONS[pending].confirm} Estado actual: ${STATUS[b?.status]?.label ?? ''}.` : ''}
        confirmLabel={pending ? ACTIONS[pending].label : 'Confirmar'}
        cancelLabel="Volver"
        loading={act.isPending}
        onConfirm={() => run(pending)}
      >
        <TextareaField label="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
      </ConfirmDialog>
      {b ? <RescheduleDialog open={rescheduling} onOpenChange={setRescheduling} space={space} service={service} resources={resources} booking={b} /> : null}
    </Sheet>
  )
}
