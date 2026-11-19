import { useEffect, useState } from 'react'
import {
  Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, SectionCard, SegmentedControl, SelectField, Skeleton, StatusPill, TextField,
} from '@runly/ui'
import { CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { useBookingsMutation, useExceptions } from '../hooks/useBookings.js'
import { runly } from '../../../lib/runly.js'
import { MUTED_TEXT } from '../lib/bookingsLabels.js'
import { dayKey, formatDateTime } from '../lib/bookingsTime.js'
import { WallTimeFields, wallValueToIso } from './WallTimeFields.jsx'

const KIND_OPTIONS = [{ value: 'closed', label: 'Bloqueo o cierre' }, { value: 'open', label: 'Apertura extra' }]

// Dated exceptions to the weekly hours: closures (holidays, breaks, a blocked
// resource) and extra openings. Shown and entered in the space's time zone.
export function ExceptionsPanel({ space, resources, canEdit, canEditResources }) {
  const tz = space.timezone
  const [from] = useState(() => new Date(Date.now() - 86400000).toISOString())
  const exceptions = useExceptions(space.id, { from })
  const [open, setOpen] = useState(false)
  const [removing, setRemoving] = useState(null)
  const create = useBookingsMutation((t, data) => runly.bookings.createException(data, t), { success: 'Excepción guardada.' })
  const remove = useBookingsMutation((t, id) => runly.bookings.deleteException(id, t), { success: 'Excepción eliminada.' })
  const resourceName = new Map(resources.map((r) => [r.id, r.name]))
  const canDelete = (e) => (e.spaceId ? canEdit : canEditResources)

  return (
    <SectionCard
      title="Excepciones, bloqueos y cierres"
      description={`Días festivos, descansos puntuales o aperturas extra. Horario de ${tz}.`}
      icon={CalendarOff}
      action={canEdit || canEditResources ? <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Plus />Agregar</Button> : null}
    >
      {exceptions.isLoading ? <Skeleton className="h-24 w-full" /> : !exceptions.data?.length ? (
        <EmptyState icon={CalendarOff} title="Sin excepciones próximas" description="El horario semanal se aplica sin cambios." />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))]">
          {exceptions.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={e.kind === 'closed' ? 'danger' : 'success'} size="sm">{e.kind === 'closed' ? 'Cerrado' : 'Apertura'}</StatusPill>
                  <span className="text-sm font-medium">{e.resourceId ? resourceName.get(e.resourceId) ?? 'Recurso' : 'Todo el sistema'}</span>
                </div>
                <p className={MUTED_TEXT}>{formatDateTime(e.startsAt, tz)} a {formatDateTime(e.endsAt, tz)}{e.reason ? ` · ${e.reason}` : ''}</p>
              </div>
              {canDelete(e) ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Eliminar excepción" onClick={() => setRemoving(e)}><Trash2 /></Button> : null}
            </li>
          ))}
        </ul>
      )}
      <ExceptionDialog open={open} onOpenChange={setOpen} space={space} resources={canEditResources ? resources : []} allowSpace={canEdit} pending={create.isPending}
        onSubmit={async (data) => { await create.mutateAsync(data); setOpen(false) }} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title="Eliminar excepción"
        description="El horario semanal vuelve a aplicarse en esas fechas."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={async () => { await remove.mutateAsync(removing.id).catch(() => {}); setRemoving(null) }}
      />
    </SectionCard>
  )
}

function ExceptionDialog({ open, onOpenChange, space, resources, allowSpace, onSubmit, pending }) {
  const tz = space.timezone
  const today = dayKey(new Date(), tz)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setForm({ kind: 'closed', owner: allowSpace ? 'space' : resources[0]?.id ?? '', start: { date: today, time: '09:00' }, end: { date: today, time: '18:00' }, reason: '' }); setError('') }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const owners = [...(allowSpace ? [{ value: 'space', label: 'Todo el sistema' }] : []), ...resources.map((r) => ({ value: r.id, label: r.name }))]

  async function submit(event) {
    event.preventDefault()
    const startsAt = wallValueToIso(form.start, tz), endsAt = wallValueToIso(form.end, tz)
    if (!startsAt || !endsAt || endsAt <= startsAt) { setError('El fin debe ser posterior al inicio.'); return }
    if (!form.owner) { setError('Elige a qué aplica.'); return }
    await onSubmit({ kind: form.kind, startsAt, endsAt, reason: form.reason.trim() || null, ...(form.owner === 'space' ? { spaceId: space.id } : { resourceId: form.owner }) }).catch(() => {})
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={CalendarOff} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nueva excepción</DialogTitle>
            <DialogDescription>Un cierre quita horario disponible; una apertura agrega horario fuera del semanal.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <SegmentedControl ariaLabel="Tipo de excepción" options={KIND_OPTIONS} value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind }))} />
            <SelectField label="Aplica a" options={owners} value={form.owner ?? ''} onValueChange={(owner) => setForm((f) => ({ ...f, owner }))} />
            <WallTimeFields label="Inicio" timeZone={tz} value={form.start} onChange={(start) => setForm((f) => ({ ...f, start }))} />
            <WallTimeFields label="Fin" timeZone={tz} value={form.end} onChange={(end) => setForm((f) => ({ ...f, end }))} />
            <TextField label="Motivo" value={form.reason ?? ''} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} maxLength={500} placeholder="Ej. Día festivo" />
            {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar excepción</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
