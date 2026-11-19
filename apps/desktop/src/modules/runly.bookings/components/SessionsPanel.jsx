import { useEffect, useState } from 'react'
import {
  Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ProgressBar, SectionCard, SelectField, Skeleton, StatusPill, TextField,
} from '@runly/ui'
import { Loader2, Plus, UsersRound, XCircle } from 'lucide-react'
import { useBookingsMutation, useSessions } from '../hooks/useBookings.js'
import { runly } from '../../../lib/runly.js'
import { MUTED_TEXT } from '../lib/bookingsLabels.js'
import { dayKey, formatDateTime, formatTime } from '../lib/bookingsTime.js'
import { WallTimeFields, wallValueToIso } from './WallTimeFields.jsx'

// Scheduled occurrences of session services: date, room and shared capacity.
export function SessionsPanel({ space, services, resources, canEdit }) {
  const tz = space.timezone
  const sessionServices = services.filter((s) => s.kind === 'session' && s.enabled)
  const [from] = useState(() => new Date(Date.now() - 3600000).toISOString())
  const sessions = useSessions(space.id, { from })
  const [open, setOpen] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const create = useBookingsMutation((t, data) => runly.bookings.createSession(space.id, data, t), { success: 'Sesión programada.' })
  const cancel = useBookingsMutation((t, id) => runly.bookings.cancelSession(id, t), { success: 'Sesión cancelada.' })
  const serviceName = new Map(services.map((s) => [s.id, s.name]))
  const resourceName = new Map(resources.map((r) => [r.id, r.name]))

  if (!services.some((s) => s.kind === 'session')) return null
  return (
    <SectionCard
      title="Sesiones con cupo"
      description="Clases, grupos o eventos con lugares compartidos. Se reservan lugares hasta llenar el cupo."
      icon={UsersRound}
      action={canEdit && sessionServices.length ? <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Plus />Programar sesión</Button> : null}
    >
      {sessions.isLoading ? <Skeleton className="h-24 w-full" /> : !sessions.data?.length ? (
        <EmptyState icon={UsersRound} title="Sin sesiones programadas" description={canEdit ? 'Programa la primera sesión para empezar a reservar lugares.' : undefined} />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))]">
          {sessions.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{serviceName.get(s.serviceId) ?? 'Sesión'}</span>
                  {s.status === 'cancelled' ? <StatusPill tone="neutral" size="sm">Cancelada</StatusPill> : null}
                </div>
                <p className={MUTED_TEXT}>{formatDateTime(s.startsAt, tz)} a {formatTime(s.endsAt, tz)}{s.resourceId ? ` · ${resourceName.get(s.resourceId) ?? ''}` : ''}</p>
                <div className="mt-1.5 flex max-w-xs items-center gap-2">
                  <ProgressBar value={Math.round((s.seatsTaken / s.capacity) * 100)} className="h-1.5" aria-label="Ocupación" />
                  <span className="text-xs tabular-nums">{s.seatsTaken}/{s.capacity}</span>
                </div>
              </div>
              {canEdit && s.status === 'scheduled' ? <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(s)}><XCircle />Cancelar</Button> : null}
            </li>
          ))}
        </ul>
      )}
      <SessionDialog open={open} onOpenChange={setOpen} space={space} services={sessionServices} resources={resources} pending={create.isPending}
        onSubmit={async (data) => { await create.mutateAsync(data); setOpen(false) }} />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(v) => !v && setCancelling(null)}
        title="Cancelar sesión"
        description="Solo se pueden cancelar sesiones sin reservaciones activas. Libera el recurso asignado."
        confirmLabel="Cancelar sesión"
        cancelLabel="Volver"
        loading={cancel.isPending}
        onConfirm={async () => { await cancel.mutateAsync(cancelling.id).catch(() => {}); setCancelling(null) }}
      />
    </SectionCard>
  )
}

function SessionDialog({ open, onOpenChange, space, services, resources, onSubmit, pending }) {
  const tz = space.timezone
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setForm({ serviceId: services[0]?.id ?? '', resourceId: '', start: { date: dayKey(new Date(Date.now() + 86400000), tz), time: '10:00' }, capacity: String(services[0]?.capacity ?? 10) }); setError('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const service = services.find((s) => s.id === form.serviceId)

  async function submit(event) {
    event.preventDefault()
    const startsAt = wallValueToIso(form.start, tz)
    const capacity = Number.parseInt(form.capacity, 10)
    if (!service) { setError('Elige un servicio.'); return }
    if (!startsAt) { setError('Elige fecha y hora.'); return }
    if (!(capacity >= 1)) { setError('El cupo debe ser al menos 1.'); return }
    await onSubmit({ serviceId: service.id, startsAt, capacity, resourceId: form.resourceId || null }).catch(() => {})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={UsersRound} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Programar sesión</DialogTitle>
            <DialogDescription>La duración la define el servicio. Si eliges una sala o persona, queda ocupada toda la sesión.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <SelectField label="Servicio" options={services.map((s) => ({ value: s.id, label: s.name }))} value={form.serviceId ?? ''}
              onValueChange={(serviceId) => setForm((f) => ({ ...f, serviceId, capacity: String(services.find((s) => s.id === serviceId)?.capacity ?? f.capacity) }))} />
            <WallTimeFields label="Inicio" timeZone={tz} value={form.start} onChange={(start) => setForm((f) => ({ ...f, start }))} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Cupo" type="number" inputMode="numeric" min={1} value={form.capacity ?? ''} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              <SelectField label="Recurso (opcional)" options={[{ value: 'none', label: 'Sin recurso' }, ...resources.map((r) => ({ value: r.id, label: r.name }))]} value={form.resourceId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, resourceId: v === 'none' ? '' : v }))} />
            </div>
            {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Programar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
