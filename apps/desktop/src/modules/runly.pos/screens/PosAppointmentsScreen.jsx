// apps/desktop/src/modules/runly.pos/screens/PosAppointmentsScreen.jsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button, ComboboxField, ConfirmDialog, DateTimeField, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  EmptyState, ErrorState, PageHeader, SelectField, Skeleton, StatusPill, TextField, TextareaField,
} from '@runly/ui'
import { toLocalIso } from '@runly/core'
import { CalendarClock, ChevronLeft, ChevronRight, Ellipsis, Phone, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly'
import FormDialog from '../../runly.catalog/components/FormDialog.jsx'
import { formatMoney } from '../retail/lib/retailRules.js'

const STATUS = {
  SCHEDULED: { label: 'Agendada', tone: 'info' },
  ARRIVED: { label: 'Llegó', tone: 'warning' },
  COMPLETED: { label: 'Cobrada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  NO_SHOW: { label: 'No asistió', tone: 'danger' },
}
const DURATIONS = [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 h'], ['90', '1 h 30 min'], ['120', '2 h'], ['180', '3 h']].map(([value, label]) => ({ value, label }))

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const time = (value) => new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
// DateTimeField works with local "YYYY-MM-DDTHH:mm".
const localInput = (value) => { const d = new Date(value); return `${toLocalIso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export default function PosAppointmentsScreen() {
  const { session } = useAuth()
  const token = session?.access_token
  const { activeCompanyId } = useActiveCompany()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const range = { from: day.toISOString(), to: addDays(day, 1).toISOString() }

  const context = useQuery({
    queryKey: ['pos-retail-context', activeCompanyId, 'appointments', token],
    queryFn: () => runly.commerce.context({}, token),
    enabled: Boolean(token && activeCompanyId),
    staleTime: 60_000,
  })
  const outlets = context.data?.data?.outlets ?? []
  const currency = context.data?.data?.currency ?? 'MXN'
  const list = useQuery({
    queryKey: ['pos-appointments', activeCompanyId, range.from, token],
    queryFn: () => runly.pos.appointments.list(range, token),
    enabled: Boolean(token && activeCompanyId),
  })
  const status = useMutation({
    mutationFn: ({ id, value }) => runly.pos.appointments.setStatus(id, { status: value }, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos-appointments'] }),
    onError: (e) => toast.error(e?.message ?? 'No se pudo cambiar la cita.'),
  })
  const rows = list.data?.data ?? []
  const today = toLocalIso(day) === toLocalIso(new Date())
  const title = day.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-full bg-[hsl(var(--background))] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <PageHeader
          title="Citas"
          description="Agenda servicios con tus clientes y cóbralos desde la caja. También aparecen en el calendario."
          actions={<Button size="lg" onClick={() => setEditing({})} disabled={!outlets.length}><Plus className="h-5 w-5" aria-hidden="true" />Nueva cita</Button>}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setDay(addDays(day, 1))} aria-label="Día siguiente"><ChevronRight className="h-5 w-5" aria-hidden="true" /></Button>
          {!today && <Button variant="ghost" size="lg" onClick={() => setDay(startOfDay(new Date()))}>Hoy</Button>}
          <h2 className="ml-1 text-lg font-bold text-[hsl(var(--foreground))] first-letter:uppercase">{title}</h2>
          <span className="ml-auto text-sm text-[hsl(var(--muted-foreground))]">{rows.length} cita(s)</span>
        </div>

        {list.isPending ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : list.isError ? (
          <ErrorState title="No se pudieron cargar las citas" description={list.error?.message} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Sin citas este día" description="Agenda la primera con «Nueva cita»." />
        ) : (
          <ul className="space-y-3" aria-label="Citas del día">
            {rows.map((a) => {
              const open = ['SCHEDULED', 'ARRIVED'].includes(a.status)
              const total = (a.items ?? []).reduce((sum, i) => sum + Number(i.price || 0), 0)
              return (
                <li key={a.id} className="flex gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
                  <div className="w-24 shrink-0 text-center">
                    <p className="whitespace-nowrap text-base font-bold tabular-nums text-[hsl(var(--foreground))]">{time(a.startsAt)}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{a.durationMinutes} min</p>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-[hsl(var(--foreground))]">{a.customerName}</p>
                      <StatusPill size="sm" tone={STATUS[a.status]?.tone}>{STATUS[a.status]?.label}</StatusPill>
                    </div>
                    {a.customerPhone && <p className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{a.customerPhone}</p>}
                    {(a.items ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {a.items.map((i, n) => <span key={n} className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--foreground))]">{i.name}</span>)}
                        <span className="px-1 text-xs font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">{formatMoney(total, currency)}</span>
                      </div>
                    )}
                    {a.notes && <p className="text-sm text-[hsl(var(--muted-foreground))]">{a.notes}</p>}
                  </div>
                  {open && (
                    <div className="flex shrink-0 items-start gap-1">
                      <Button size="lg" onClick={() => navigate(`/app/m/runly.pos/pos/caja?cita=${a.id}`)}><Wallet className="h-5 w-5" aria-hidden="true" /><span className="hidden sm:inline">Cobrar</span></Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Más acciones de la cita de ${a.customerName}`}><Ellipsis className="h-5 w-5" aria-hidden="true" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem className="min-h-11" onSelect={() => setEditing(a)}>Editar</DropdownMenuItem>
                          {a.status === 'SCHEDULED' && <DropdownMenuItem className="min-h-11" onSelect={() => status.mutate({ id: a.id, value: 'ARRIVED' })}>Marcar que llegó</DropdownMenuItem>}
                          <DropdownMenuItem className="min-h-11" onSelect={() => status.mutate({ id: a.id, value: 'NO_SHOW' })}>No asistió</DropdownMenuItem>
                          <DropdownMenuItem className="min-h-11 text-red-700" onSelect={() => setCancelling(a)}>Cancelar cita</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {editing && <AppointmentDialog appointment={editing} day={day} outlets={outlets} token={token} currency={currency} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['pos-appointments'] }) }} />}
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(v) => !v && setCancelling(null)}
        tone="destructive"
        icon={CalendarClock}
        title="Cancelar cita"
        description={cancelling ? `La cita de ${cancelling.customerName} a las ${time(cancelling.startsAt)} se cancela y sale del calendario.` : ''}
        confirmLabel="Cancelar cita"
        onConfirm={() => { status.mutate({ id: cancelling.id, value: 'CANCELLED' }); setCancelling(null) }}
      />
    </div>
  )
}

function AppointmentDialog({ appointment, day, outlets, token, currency, onClose, onSaved }) {
  const editing = Boolean(appointment.id)
  const defaultStart = useMemo(() => { const d = new Date(day); d.setHours(10, 0, 0, 0); return localInput(d) }, [day])
  const [form, setForm] = useState(() => ({
    outletId: appointment.outletId ?? outlets[0]?.id ?? '',
    customerName: appointment.customerName ?? '',
    customerPhone: appointment.customerPhone ?? '',
    startsAt: appointment.startsAt ? localInput(appointment.startsAt) : defaultStart,
    durationMinutes: String(appointment.durationMinutes ?? 60),
    items: (appointment.items ?? []).map((i) => i.productId),
    notes: appointment.notes ?? '',
  }))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value?.target ? value.target.value : value }))
  const services = useQuery({
    queryKey: ['pos-appointment-services', form.outletId, search, token],
    queryFn: () => runly.commerce.sellables({ outletId: form.outletId, page: 1, pageSize: 30, ...(search ? { search } : {}) }, token),
    enabled: Boolean(token && form.outletId),
    staleTime: 30_000,
  })
  // Keep chosen services listed even when the search no longer returns them.
  const known = useMemo(() => {
    const map = new Map((appointment.items ?? []).map((i) => [i.productId, { value: i.productId, label: i.name }]))
    for (const s of services.data?.data ?? []) if (!s.requiresVariant) map.set(s.productId, { value: s.productId, label: `${s.name} · ${formatMoney(s.price, s.currency ?? currency)}` })
    return [...map.values()]
  }, [services.data, appointment.items, currency])

  async function submit() {
    if (!form.customerName.trim()) { setError('Escribe el nombre del cliente.'); return }
    if (!form.startsAt) { setError('Elige fecha y hora.'); return }
    setSaving(true)
    const body = {
      outletId: form.outletId,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim() || null,
      startsAt: new Date(form.startsAt).toISOString(),
      durationMinutes: Number(form.durationMinutes),
      items: form.items.map((productId) => ({ productId })),
      notes: form.notes.trim() || null,
    }
    try {
      if (editing) await runly.pos.appointments.update(appointment.id, body, token)
      else await runly.pos.appointments.create(body, token)
      toast.success(editing ? 'Cita actualizada' : 'Cita agendada')
      onSaved()
    } catch (e) {
      toast.error(e?.message ?? 'No se pudo guardar la cita.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={CalendarClock}
      title={editing ? 'Editar cita' : 'Nueva cita'}
      description="Cliente, servicios y horario. Al cobrarla se cargan los servicios en la caja."
      onSubmit={submit}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg" loading={saving}>{editing ? 'Guardar' : 'Agendar'}</Button>
        </>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Cliente" required value={form.customerName} onChange={(e) => { set('customerName')(e); setError('') }} maxLength={160} icon={null} error={error} />
        <TextField label="Teléfono" value={form.customerPhone} onChange={set('customerPhone')} maxLength={60} icon={null} inputMode="tel" />
        <DateTimeField label="Fecha y hora" required value={form.startsAt} onChange={set('startsAt')} />
        <SelectField label="Duración" value={form.durationMinutes} onChange={set('durationMinutes')} options={DURATIONS} />
      </div>
      {outlets.length > 1 && <SelectField label="Sucursal" value={form.outletId} onChange={set('outletId')} options={outlets.map((o) => ({ value: o.id, label: o.name }))} />}
      <ComboboxField
        label="Servicios"
        multiple
        options={known}
        value={form.items}
        onChange={set('items')}
        onSearchChange={setSearch}
        placeholder="Elegir servicios del catálogo"
        searchPlaceholder="Buscar servicio..."
        loading={services.isFetching}
      />
      <TextareaField label="Notas" value={form.notes} onChange={set('notes')} rows={2} maxLength={1000} />
    </FormDialog>
  )
}
