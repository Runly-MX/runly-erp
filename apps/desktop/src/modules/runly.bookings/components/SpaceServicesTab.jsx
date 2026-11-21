import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DataTable, StatusPill } from '@runly/ui'
import { ConciergeBell, Pencil, Plus } from 'lucide-react'
import { KIND, MUTED_TEXT, bookingsPath } from '../lib/bookingsLabels.js'

// Services list; creating and editing happen on their own full page.
export function SpaceServicesTab({ space, services, resources, canEdit }) {
  const navigate = useNavigate()
  const setEditing = (target) => navigate(bookingsPath(`/spaces/${space.id}/services/${target === 'new' ? 'new' : target.id}`))
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
    </div>
  )
}
