import { useMemo, useState } from 'react'
import { Button, DataTable, StatusPill } from '@runly/ui'
import { ConciergeBell, Pencil, Plus } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation, useToken } from '../hooks/useBookings.js'
import { KIND, MUTED_TEXT } from '../lib/bookingsLabels.js'
import { ServiceFormDialog } from './ServiceFormDialog.jsx'

export function SpaceServicesTab({ space, services, resources, canEdit }) {
  const token = useToken()
  const [editing, setEditing] = useState(null)
  const save = useBookingsMutation(async (t, { service, data, resourceIds }) => {
    const saved = service ? await runly.bookings.updateService(service.id, data, t) : await runly.bookings.createService(space.id, data, t)
    const id = (saved?.data ?? saved).id
    await runly.bookings.setServiceResources(id, resourceIds, t)
    return saved
  }, { success: 'Servicio guardado.' })
  const resourceName = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources])

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Servicio', accessorFn: (s) => s.name,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className={`${MUTED_TEXT} truncate`}>{KIND[row.original.kind]}{row.original.kind === 'session' ? ` · cupo ${row.original.capacity}` : ''}</p>
        </div>
      ),
    },
    { id: 'duration', header: 'Duración', accessorFn: (s) => s.durationMinutes, cell: ({ row }) => <span className="tabular-nums">{row.original.durationMinutes} min</span> },
    {
      id: 'buffers', header: 'Márgenes', accessorFn: (s) => s.bufferBeforeMinutes + s.bufferAfterMinutes,
      cell: ({ row }) => <span className={MUTED_TEXT}>{row.original.bufferBeforeMinutes} / {row.original.bufferAfterMinutes} min</span>,
    },
    { id: 'resources', header: 'Recursos', accessorFn: (s) => s.resourceIds.length, cell: ({ row }) => <span className="text-sm">{row.original.resourceIds.map((id) => resourceName.get(id)).filter(Boolean).join(', ') || '—'}</span> },
    { id: 'enabled', header: 'Estado', accessorFn: (s) => (s.enabled ? 1 : 0), cell: ({ row }) => <StatusPill tone={row.original.enabled ? 'success' : 'neutral'} size="sm">{row.original.enabled ? 'Activo' : 'Inactivo'}</StatusPill> },
    ...(canEdit ? [{ id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(row.original)}><Pencil />Editar</Button> }] : []),
  ], [canEdit, resourceName])

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={services}
        getRowId={(s) => s.id}
        pageSize={25}
        searchPlaceholder="Buscar servicio…"
        stateKey={`bookings-services-${space.id}`}
        emptyIcon={ConciergeBell}
        emptyTitle="Aún no hay servicios"
        emptyDescription={canEdit ? 'Define lo que se puede reservar: duración, márgenes, modalidad y quién lo atiende.' : undefined}
        emptyAction={canEdit ? <Button type="button" onClick={() => setEditing('new')}><Plus />Nuevo servicio</Button> : undefined}
        toolbarActions={canEdit && services.length ? <Button type="button" onClick={() => setEditing('new')}><Plus />Nuevo servicio</Button> : null}
      />
      <ServiceFormDialog
        open={Boolean(editing)}
        onOpenChange={(v) => !v && setEditing(null)}
        service={editing && editing !== 'new' ? editing : null}
        resourceIds={editing && editing !== 'new' ? editing.resourceIds : []}
        resources={resources}
        pending={save.isPending}
        onSubmit={async ({ data, resourceIds }) => {
          if (!token) return
          await save.mutateAsync({ service: editing === 'new' ? null : editing, data, resourceIds }).then(() => setEditing(null)).catch(() => {})
        }}
      />
    </div>
  )
}
