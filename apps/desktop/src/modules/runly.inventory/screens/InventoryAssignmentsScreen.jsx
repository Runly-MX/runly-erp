import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, CheckboxField, DataTable, PageHeader } from '@runly/ui'
import { UserCheck, X } from 'lucide-react'
import { useInventoryAssignments } from '../hooks/useInventoryItems.js'
import { CUSTODY_LIST_PATH } from '../lib/custody-links.js'

const ITEM_PATH = '/app/m/runly.inventory/inventory'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function employeeName(row) {
  const e = row.employee
  if (!e) return row.employeeName ?? '—'
  return [e.firstName, e.lastName].filter(Boolean).join(' ') || '—'
}

// The delivery resguardo created the assignment; a return resguardo closed it.
function originCustody(row) {
  const custodies = (row.custodyItems ?? []).map((ci) => ci.custody).filter(Boolean)
  return custodies.find((c) => c.kind === 'DELIVERY') ?? custodies[0] ?? null
}

// Read-only "Quién tiene qué": changes happen in resguardos.
export default function InventoryAssignmentsScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const employeeId = searchParams.get('employee') ?? ''
  const [activeOnly, setActiveOnly] = useState(true)

  const params = useMemo(() => ({
    active: activeOnly || undefined,
    employeeId: employeeId || undefined,
    limit: 100,
  }), [activeOnly, employeeId])
  const { data, isLoading, isError, refetch } = useInventoryAssignments(params)
  const rows = data?.data ?? (Array.isArray(data) ? data : [])

  const columns = useMemo(() => [
    {
      id: 'item',
      header: 'Activo',
      accessorFn: (r) => `${r.item?.name ?? ''} ${r.item?.assetTag ?? ''}`,
      cell: ({ row }) => (
        <button type="button" onClick={() => row.original.itemId && navigate(`${ITEM_PATH}/${row.original.itemId}`)}
          className="text-left font-medium hover:underline">
          {row.original.item?.name ?? '—'}
        </button>
      ),
    },
    {
      id: 'assetTag',
      header: 'Número de activo',
      accessorFn: (r) => r.item?.assetTag ?? '',
      cell: ({ row }) => <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.original.item?.assetTag ?? '—'}</span>,
    },
    { id: 'employee', header: 'Colaborador', accessorFn: employeeName },
    { id: 'assignedAt', header: 'Desde', accessorFn: (r) => r.assignedAt, cell: ({ row }) => formatDate(row.original.assignedAt) },
    { id: 'returnedAt', header: 'Hasta', accessorFn: (r) => r.returnedAt ?? '', cell: ({ row }) => formatDate(row.original.returnedAt) },
    {
      id: 'status',
      header: 'Estado',
      accessorFn: (r) => (r.returnedAt ? 'Devuelta' : 'Vigente'),
      cell: ({ row }) => (row.original.returnedAt
        ? <Badge variant="secondary">Devuelta</Badge>
        : <Badge variant="success">Vigente</Badge>),
    },
    {
      id: 'custody',
      header: 'Resguardo',
      accessorFn: (r) => originCustody(r)?.folio ?? '',
      cell: ({ row }) => {
        const custody = originCustody(row.original)
        if (!custody) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin resguardo</span>
        return (
          <button type="button" onClick={() => navigate(`${CUSTODY_LIST_PATH}/${custody.id}`)}
            className="font-mono text-xs font-medium text-[var(--brand-primary)] hover:underline">
            {custody.folio}
          </button>
        )
      },
    },
  ], [navigate])

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Quién tiene qué"
        description="Consulta quién tiene cada activo y su historial. Para entregar o devolver equipo, crea un resguardo."
        actions={<Button variant="outline" onClick={() => navigate(CUSTODY_LIST_PATH)}><UserCheck className="mr-1.5 h-4 w-4" />Ir a resguardos</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar por activo o colaborador..."
        toolbarStart={(
          <div className="flex flex-wrap items-center gap-3">
            <CheckboxField label="Solo vigentes" checked={activeOnly} onChange={(e) => setActiveOnly(Boolean(e?.target ? e.target.checked : e))} />
            {employeeId ? (
              <Button variant="outline" size="sm" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('employee'); setSearchParams(next, { replace: true }) }}>
                <X className="mr-1.5 h-3.5 w-3.5" />Quitar filtro de colaborador
              </Button>
            ) : null}
          </div>
        )}
        emptyIcon={UserCheck}
        emptyTitle="Sin asignaciones"
        emptyDescription={activeOnly ? 'No hay activos asignados actualmente.' : 'No hay asignaciones registradas.'}
      />
    </div>
  )
}
