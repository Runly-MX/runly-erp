import { useEffect, useMemo, useState } from 'react'
import {
  Button, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, ErrorState, PageHeader, SelectField, StatusPill, SwitchField, TextField, UserSearchModal,
} from '@runly/ui'
import { CalendarRange, Loader2, Pencil, Plus, UserRound, Users, X } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { ScheduleEditor } from '../components/ScheduleEditor.jsx'
import { MUTED, PageShell } from '../components/shared.jsx'
import { useBookingsMe, useBookingsMutation, useResourceSchedule, useResources } from '../hooks/useBookings.js'
import { RESOURCE_TYPE, optionsOf } from '../lib/bookingsLabels.js'

// Company-wide bookable resources. A person is linked to their Runly user
// instead of being copied; the same resource can serve several spaces.
export default function BookingsResources() {
  const me = useBookingsMe()
  const resources = useResources()
  const canEdit = Boolean(me.data?.canManageCatalog)
  const [editing, setEditing] = useState(null)
  const [scheduleFor, setScheduleFor] = useState(null)
  const save = useBookingsMutation((t, { id, data }) => (id ? runly.bookings.updateResource(id, data, t) : runly.bookings.createResource(data, t)), { success: 'Recurso guardado.' })

  const columns = useMemo(() => [
    { id: 'name', header: 'Recurso', accessorFn: (r) => r.name, cell: ({ row }) => <div className="min-w-0"><p className="truncate font-medium">{row.original.name}</p><p className={MUTED}>{RESOURCE_TYPE[row.original.type]}</p></div> },
    { id: 'user', header: 'Usuario vinculado', accessorFn: (r) => (r.userId ? 1 : 0), cell: ({ row }) => (row.original.userId ? <StatusPill tone="brand" size="sm" icon={UserRound}>Vinculado</StatusPill> : <span className={MUTED}>—</span>) },
    { id: 'enabled', header: 'Estado', accessorFn: (r) => (r.enabled ? 1 : 0), cell: ({ row }) => <StatusPill tone={row.original.enabled ? 'success' : 'neutral'} size="sm">{row.original.enabled ? 'Activo' : 'Inactivo'}</StatusPill> },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setScheduleFor(row.original)}><CalendarRange />Horario</Button>
          {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row.original)}><Pencil />Editar</Button> : null}
        </div>
      ),
    },
  ], [canEdit])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reservaciones"
        title="Recursos"
        description="Personas, salas, equipos y mesas que se pueden reservar. Cada sistema elige cuáles usa; un recurso compartido nunca se reserva dos veces al mismo tiempo."
        actions={canEdit ? <Button type="button" onClick={() => setEditing('new')} className="w-full sm:w-auto"><Plus />Nuevo recurso</Button> : null}
      />
      {resources.isError && resources.error?.status === 403 ? (
        <ErrorState title="Sin acceso a los recursos" description="Necesitas pertenecer a un sistema de reservaciones o administrar los recursos." />
      ) : (
        <DataTable
          columns={columns}
          data={resources.data ?? []}
          getRowId={(r) => r.id}
          isLoading={resources.isLoading}
          isError={resources.isError}
          onRetry={() => resources.refetch()}
          pageSize={25}
          searchPlaceholder="Buscar recurso…"
          stateKey="bookings-resources"
          emptyIcon={Users}
          emptyTitle="Aún no hay recursos"
          emptyDescription={canEdit ? 'Da de alta a las personas, salas o equipos que atienden las reservaciones.' : undefined}
          emptyAction={canEdit ? <Button type="button" onClick={() => setEditing('new')}><Plus />Nuevo recurso</Button> : undefined}
        />
      )}
      <ResourceDialog open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} resource={editing === 'new' ? null : editing} pending={save.isPending}
        onSubmit={async (data) => { await save.mutateAsync({ id: editing === 'new' ? null : editing.id, data }).then(() => setEditing(null)).catch(() => {}) }} />
      <ResourceScheduleDialog resource={scheduleFor} onOpenChange={(v) => !v && setScheduleFor(null)} canEdit={canEdit} />
    </PageShell>
  )
}

function ResourceDialog({ open, onOpenChange, resource, onSubmit, pending }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const [form, setForm] = useState({ name: '', type: 'staff', userId: null, userLabel: '', enabled: true })
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    if (open) { setForm({ name: resource?.name ?? '', type: resource?.type ?? 'staff', userId: resource?.userId ?? null, userLabel: resource?.userId ? 'Usuario vinculado' : '', enabled: resource?.enabled ?? true }); setError('') }
  }, [open, resource])

  async function submit(event) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Escribe un nombre.'); return }
    await onSubmit({ name: form.name.trim(), type: form.type, userId: form.type === 'staff' ? form.userId : null, ...(resource ? { enabled: form.enabled } : {}) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={Users} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{resource ? 'Editar recurso' : 'Nuevo recurso'}</DialogTitle>
            <DialogDescription>Lo que una reservación ocupa durante su horario.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField label="Nombre" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={error} maxLength={160} placeholder="Ej. Dra. López o Sala 2" autoComplete="off" />
            <SelectField label="Tipo" options={optionsOf(RESOURCE_TYPE)} value={form.type} onValueChange={(type) => setForm((f) => ({ ...f, type }))} />
            {form.type === 'staff' ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Usuario de Runly (opcional)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setPicking(true)}><UserRound />{form.userId ? form.userLabel || 'Cambiar usuario' : 'Vincular usuario'}</Button>
                  {form.userId ? <Button type="button" variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, userId: null, userLabel: '' }))}><X />Quitar vínculo</Button> : null}
                </div>
                <p className={MUTED}>Vincula a la persona con su usuario en lugar de duplicar su registro.</p>
              </div>
            ) : null}
            {resource ? <SwitchField label="Recurso activo" description="Un recurso inactivo deja de recibir reservaciones nuevas." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} /> : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar recurso</Button>
          </DialogFooter>
        </form>
        {picking ? (
          <UserSearchModal open={picking} onClose={() => setPicking(false)} apiBase={getApiUrl()} token={session?.access_token} companyId={activeCompanyId}
            onConfirm={(userId) => { setForm((f) => ({ ...f, userId, userLabel: 'Usuario vinculado' })); setPicking(false) }} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ResourceScheduleDialog({ resource, onOpenChange, canEdit }) {
  const schedule = useResourceSchedule(resource?.id)
  const save = useBookingsMutation((t, rules) => runly.bookings.setResourceSchedule(resource.id, rules, t), { success: 'Horario del recurso guardado.' })
  return (
    <Dialog open={Boolean(resource)} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="xl" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={CalendarRange} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Horario de {resource?.name}</DialogTitle>
          <DialogDescription>Opcional. Sin horario propio, el recurso sigue el horario de cada sistema. Con horario, solo se reserva donde ambos coinciden, en la zona de cada sistema.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {resource ? <ScheduleEditor title="Horario semanal" rules={schedule.data} loading={schedule.isLoading} canEdit={canEdit} saving={save.isPending} onSave={(rules) => save.mutateAsync(rules).catch(() => {})} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
