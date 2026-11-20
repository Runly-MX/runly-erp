import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, AlertDescription, Button, ConfirmDialog, DateTimeField, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  EmptyState, ErrorState, PageHeader, SelectField, Skeleton, StatusPill, TextField, TextareaField,
} from '@runly/ui'
import { Armchair, CalendarClock, ChevronLeft, ChevronRight, Ellipsis, Phone, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly'
import FormDialog from '../../runly.catalog/components/FormDialog.jsx'
import { addDays, browserTimeZone, dayKey, formatKey, formatTime, keyParts, wallToInstant, zonedParts } from '../../runly.bookings/lib/bookingsTime.js'

const STATUS = {
  PENDING: { label: 'Por confirmar', tone: 'warning' },
  CONFIRMED: { label: 'Confirmada', tone: 'info' },
  SEATED: { label: 'En mesa', tone: 'success' },
  COMPLETED: { label: 'Concluida', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  NO_SHOW: { label: 'No llegó', tone: 'danger' },
}
const DURATIONS = [['60', '1 h'], ['90', '1 h 30 min'], ['120', '2 h'], ['150', '2 h 30 min'], ['180', '3 h']].map(([value, label]) => ({ value, label }))
const AUTO = 'auto'
const pad = (n) => String(n).padStart(2, '0')
// Every date here is the outlet's wall clock (its IANA zone), whatever the device's zone is.
const wallInput = (value, tz) => { const p = zonedParts(new Date(value), tz); return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}` }
const wallToDate = (input, tz) => { const [d, t] = String(input).split('T'); if (!d || !t) return null; const [hour, minute] = t.split(':').map(Number); return wallToInstant({ ...keyParts(d), hour, minute }, tz) }
const dayStart = (key, tz) => wallToInstant({ ...keyParts(key), hour: 0, minute: 0 }, tz)
const attempt = () => `pos-seat-${crypto.randomUUID()}`

// Table reservations of the day for the hostess. Times, tables and capacity come from
// the Reservaciones engine (the outlet must be activated in Administración > Reservas);
// "Llegó" opens the table's account in the same step.
export default function PosReservationsScreen() {
  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [outletId, setOutletId] = useState('')
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const context = useQuery({ queryKey: ['pos-retail-context', activeCompanyId, 'reservas', token], queryFn: () => runly.commerce.context({}, token), enabled: Boolean(token && activeCompanyId), staleTime: 60_000 })
  const outlets = (context.data?.data?.outlets ?? []).filter((o) => ['RESTAURANT', 'HYBRID'].includes(o.mode))
  useEffect(() => { if (!outletId && outlets[0]) setOutletId(outlets[0].id) }, [outlets, outletId])
  const tz = outlets.find((o) => o.id === outletId)?.timezone || browserTimeZone()
  const [dayChoice, setDay] = useState(null)
  const day = dayChoice ?? dayKey(new Date(), tz)
  const links = useQuery({ queryKey: ['pos-bookings-links', outletId, token], queryFn: async () => (await runly.pos.bookings.links(outletId, token)).data ?? [], enabled: Boolean(token && outletId) })
  const engine = links.data?.some((l) => l.kind === 'tables' && l.mode === 'engine')
  const range = { from: dayStart(day, tz).toISOString(), to: dayStart(addDays(day, 1), tz).toISOString() }
  const list = useQuery({
    queryKey: ['pos-reservations', activeCompanyId, outletId, range.from, token],
    queryFn: async () => (await runly.pos.listReservations({ outletId, ...range }, token))?.data ?? [],
    enabled: Boolean(token && outletId), refetchInterval: 60_000,
  })
  const refresh = () => { client.invalidateQueries({ queryKey: ['pos-reservations'] }); client.invalidateQueries({ queryKey: ['pos', 'tables'] }) }
  const rows = list.data ?? []
  const today = day === dayKey(new Date(), tz)
  const title = formatKey(day, { weekday: 'long', day: 'numeric', month: 'long' })

  async function act(promise, done) {
    try { await promise; toast.success(done); refresh() } catch (e) { toast.error(e?.message ?? 'No se pudo completar.') }
  }
  async function arrive(r) {
    try {
      const order = (await runly.commerce.seatReservation(r.id, {}, token, { idempotencyKey: attempt() })).data
      toast.success(`${r.guestName} en ${r.table?.name ?? 'mesa'}`)
      refresh()
      if (order?.tableId) navigate(`/app/m/runly.pos/pos/comandero/mesa/${order.tableId}`)
    } catch (e) { toast.error(e?.message ?? 'No se pudo recibir la reserva.') }
  }

  return (
    <div className="min-h-full bg-[hsl(var(--background))] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <PageHeader
          title="Reservas"
          description="Reservaciones de mesas por horario. Una mesa puede tener varias reservas en el día si no se enciman."
          actions={<Button size="lg" onClick={() => setEditing({})} disabled={!engine}><Plus className="h-5 w-5" aria-hidden="true" />Nueva reserva</Button>}
        />
        {outlets.length > 1 ? <SelectField label="Sucursal" value={outletId} onChange={(v) => setOutletId(v?.target ? v.target.value : v)} options={outlets.map((o) => ({ value: o.id, label: o.name }))} /> : null}
        {outletId && links.isSuccess && !engine ? (
          <Alert><CalendarClock className="h-4 w-4" /><AlertDescription>Para reservar por horario activa Reservaciones en Administración del punto de venta, pestaña Reservas. Mientras tanto se muestran las reservas existentes.</AlertDescription></Alert>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setDay(addDays(day, 1))} aria-label="Día siguiente"><ChevronRight className="h-5 w-5" aria-hidden="true" /></Button>
          {!today && <Button variant="ghost" size="lg" onClick={() => setDay(null)}>Hoy</Button>}
          <h2 className="ml-1 text-lg font-bold first-letter:uppercase">{title}</h2>
          <span className="ml-auto text-sm text-[hsl(var(--muted-foreground))]">{rows.filter((r) => !['CANCELLED', 'NO_SHOW'].includes(r.status)).length} reserva(s)</span>
        </div>

        {list.isPending || context.isPending ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : list.isError ? (
          <ErrorState title="No se pudieron cargar las reservas" description={list.error?.message} onRetry={list.refetch} />
        ) : !outlets.length ? (
          <EmptyState icon={Armchair} title="Sin sucursales con mesas" description="Las reservas de mesas son para sucursales de restaurante." />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin reservas este día" description={engine ? 'Agrega la primera con «Nueva reserva».' : undefined} />
        ) : (
          <ul className="space-y-3" aria-label="Reservas del día">
            {rows.map((r) => {
              const open = r.source === 'engine' && ['CONFIRMED', 'PENDING'].includes(r.status)
              const started = Date.now() >= new Date(r.scheduledAt).getTime()
              const sameDay = dayKey(r.scheduledAt, tz) === dayKey(new Date(), tz)
              return (
                <li key={r.id} className="flex gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
                  <div className="w-24 shrink-0 text-center">
                    <p className="text-base font-bold tabular-nums">{formatTime(r.scheduledAt, tz)}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{r.durationMinutes} min</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{r.guestName}</p>
                      <StatusPill size="sm" tone={STATUS[r.status]?.tone}>{STATUS[r.status]?.label ?? r.status}</StatusPill>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{r.partySize} pers.</span>
                      <span className="flex items-center gap-1"><Armchair className="h-3.5 w-3.5" aria-hidden="true" />{r.table?.name ?? 'Sin mesa'}</span>
                      {r.guestPhone ? <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{r.guestPhone}</span> : null}
                      {r.channel === 'portal' ? <span>En línea</span> : null}
                    </p>
                    {r.notes ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{r.notes}</p> : null}
                  </div>
                  {open ? (
                    <div className="flex shrink-0 items-start gap-1">
                      {r.status === 'CONFIRMED' && sameDay ? <Button size="lg" onClick={() => arrive(r)} disabled={!r.tableId}>Llegó</Button> : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Más acciones de la reserva de ${r.guestName}`}><Ellipsis className="h-5 w-5" aria-hidden="true" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem className="min-h-11" onSelect={() => setEditing(r)}>Cambiar hora o mesa</DropdownMenuItem>
                          {started && r.status === 'CONFIRMED' ? <DropdownMenuItem className="min-h-11" onSelect={() => act(runly.pos.updateReservation(r.id, { status: 'NO_SHOW' }, token), 'Marcada como no llegó')}>No llegó</DropdownMenuItem> : null}
                          <DropdownMenuItem className="min-h-11 text-red-700" onSelect={() => setCancelling(r)}>Cancelar reserva</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {editing ? <ReservationDialog reservation={editing} outletId={outletId} day={day} tz={tz} token={token} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} /> : null}
      <ConfirmDialog
        open={Boolean(cancelling)} onOpenChange={(v) => !v && setCancelling(null)} tone="destructive" icon={CalendarClock} title="Cancelar reserva"
        description={cancelling ? `La reserva de ${cancelling.guestName} a las ${formatTime(cancelling.scheduledAt, tz)} se cancela y su mesa queda libre en ese horario.` : ''}
        confirmLabel="Cancelar reserva" onConfirm={() => { act(runly.pos.updateReservation(cancelling.id, { status: 'CANCELLED' }, token), 'Reserva cancelada'); setCancelling(null) }}
      />
    </div>
  )
}

function ReservationDialog({ reservation, outletId, day, tz, token, onClose, onSaved }) {
  const editing = Boolean(reservation.id)
  const defaultStart = useMemo(() => `${day}T20:00`, [day])
  const [form, setForm] = useState(() => ({
    guestName: reservation.guestName ?? '', guestPhone: reservation.guestPhone ?? '', partySize: String(reservation.partySize ?? 2),
    scheduledAt: reservation.scheduledAt ? wallInput(reservation.scheduledAt, tz) : defaultStart, durationMinutes: String(reservation.durationMinutes ?? 90),
    tableId: reservation.tableId ?? AUTO, notes: reservation.notes ?? '',
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }))
  const at = form.scheduledAt ? wallToDate(form.scheduledAt, tz) : null
  const tables = useQuery({
    queryKey: ['pos-reservation-tables', outletId, form.scheduledAt, form.durationMinutes, form.partySize, token],
    queryFn: async () => (await runly.pos.bookings.tables({ outletId, scheduledAt: at.toISOString(), durationMinutes: form.durationMinutes, partySize: form.partySize }, token)).data ?? [],
    enabled: Boolean(token && outletId && at && !Number.isNaN(at.getTime())),
  })
  // The table it already has stays selectable when editing; the server re-checks everything.
  const options = [{ value: AUTO, label: 'La mejor mesa disponible' }, ...(tables.data ?? []).filter((t) => t.available || t.id === reservation.tableId).map((t) => ({ value: t.id, label: `${t.name} · ${t.capacity} lugares` }))]
  const busy = (tables.data ?? []).filter((t) => !t.available && t.id !== reservation.tableId).length

  async function submit() {
    if (!form.guestName.trim()) { setError('Escribe el nombre del cliente.'); return }
    const party = Number.parseInt(form.partySize, 10)
    if (!(party >= 1 && party <= 50)) { setError('Personas: de 1 a 50.'); return }
    if (!at || Number.isNaN(at.getTime())) { setError('Elige fecha y hora.'); return }
    setSaving(true)
    const body = { guestName: form.guestName.trim(), guestPhone: form.guestPhone.trim() || null, partySize: party, scheduledAt: at.toISOString(),
      durationMinutes: Number(form.durationMinutes), tableId: form.tableId === AUTO ? null : form.tableId, notes: form.notes.trim() || null }
    try {
      if (editing) await runly.pos.updateReservation(reservation.id, body, token)
      else await runly.pos.createReservation({ outletId, ...body, tableId: body.tableId ?? undefined }, token)
      toast.success(editing ? 'Reserva actualizada' : 'Reserva registrada')
      onSaved()
    } catch (e) { setError(e?.message ?? 'No se pudo guardar la reserva.') } finally { setSaving(false) }
  }

  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} icon={CalendarClock} title={editing ? 'Cambiar reserva' : 'Nueva reserva'}
      description="Horario, personas y mesa. Reservaciones confirma que la mesa esté libre en ese horario."
      onSubmit={submit}
      footer={(<><Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button><Button type="submit" size="lg" loading={saving}>{editing ? 'Guardar' : 'Reservar'}</Button></>)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Cliente" required value={form.guestName} onChange={(e) => { set('guestName')(e); setError('') }} maxLength={160} icon={null} />
        <TextField label="Teléfono" value={form.guestPhone} onChange={set('guestPhone')} maxLength={60} icon={null} inputMode="tel" />
        <DateTimeField label="Fecha y hora" required value={form.scheduledAt} onChange={set('scheduledAt')} hint={`Hora de la sucursal (${tz.replace(/_/g, ' ')})`} />
        <TextField label="Personas" type="number" inputMode="numeric" min={1} max={50} value={form.partySize} onChange={set('partySize')} icon={null} />
        <SelectField label="Duración" value={form.durationMinutes} onChange={set('durationMinutes')} options={DURATIONS} />
        <SelectField label="Mesa" value={form.tableId} onChange={set('tableId')} options={options} hint={busy ? `${busy} mesa(s) ocupadas, reservadas o chicas para ese horario.` : undefined} />
      </div>
      <TextareaField label="Notas" value={form.notes} onChange={set('notes')} rows={2} maxLength={1000} />
      {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
    </FormDialog>
  )
}
