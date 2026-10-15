import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, ComboboxField, DataTable, PageHeader, SelectField } from '@runly/ui'
import { FileSignature, Plus } from 'lucide-react'
import { useCustodies, useEmployeeOptions } from '../hooks/useInventoryCustody.js'
import { CUSTODY_KIND, CUSTODY_STATUS_OPTIONS, formatCustodyDate } from '../lib/custody-api.js'
import { CustodyStatusBadge } from '../components/custody/CustodyStatusBadge.jsx'
import { CustodyCreateSheet } from '../components/custody/CustodyCreateSheet.jsx'
import { parseNewCustodyParams } from '../lib/custody-links.js'

const CUSTODY_PATH = '/app/m/runly.inventory/inventory/custodies'
const ALL = 'all'

export default function InventoryCustodyScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status') ?? ALL
  const employeeId = searchParams.get('employee') ?? ''
  const [creating, setCreating] = useState(false)
  const employees = useEmployeeOptions()
  const [linkDefaults, setLinkDefaults] = useState(null)
  const editorDefaults = useMemo(() => linkDefaults ?? (employeeId ? { employeeId } : null), [linkDefaults, employeeId])

  // Deep link from an item (Asignar / Devolver): open the sheet prefilled once.
  useEffect(() => {
    const requested = parseNewCustodyParams(searchParams)
    if (!requested) return
    setLinkDefaults(requested)
    setCreating(true)
    const next = new URLSearchParams(searchParams)
    for (const key of ['new', 'kind', 'items', 'employee']) next.delete(key)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const params = useMemo(() => ({
    status: status === ALL ? undefined : status,
    employeeId: employeeId || undefined,
  }), [status, employeeId])
  const { data, isLoading, isError, refetch } = useCustodies(params)
  const rows = data?.items ?? []

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (!value || value === ALL) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  const open = (row) => navigate(`${CUSTODY_PATH}/${row.id}`)
  const columns = [
    { accessorKey: 'folio', header: 'Folio', cell: ({ row }) => (
      <button type="button" onClick={() => open(row.original)} className="font-mono text-xs font-medium text-[var(--brand-primary)] hover:underline">
        {row.original.folio ?? '—'}
      </button>
    ) },
    { accessorKey: 'kind', header: 'Tipo', cell: ({ row }) => CUSTODY_KIND[row.original.kind] ?? row.original.kind },
    { accessorKey: 'employeeName', header: 'Colaborador', cell: ({ row }) => (
      <button type="button" onClick={() => open(row.original)} className="text-left hover:underline">{row.original.employeeName}</button>
    ) },
    { accessorKey: 'itemCount', header: 'Artículos', cell: ({ row }) => <span className="tabular-nums">{row.original.itemCount}</span> },
    { accessorKey: 'status', header: 'Estado', cell: ({ row }) => <CustodyStatusBadge status={row.original.status} /> },
    { accessorKey: 'date', header: 'Fecha', cell: ({ row }) => formatCustodyDate(row.original.date) },
  ]

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Resguardos"
        description="Entregas y devoluciones de equipo firmadas por los colaboradores, con el formato de tu empresa."
        actions={<Button onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" />Nuevo resguardo</Button>}
      />
      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        getRowId={(row) => row.id}
        searchPlaceholder="Buscar folio o colaborador..."
        toolbarStart={(
          <div className="flex flex-wrap gap-2">
            <SelectField className="w-full sm:w-48" value={status} onValueChange={(v) => setFilter('status', v)}
              options={[{ value: ALL, label: 'Todos los estados' }, ...CUSTODY_STATUS_OPTIONS]} />
            <ComboboxField className="w-full sm:w-60" value={employeeId} onChange={(v) => setFilter('employee', v)}
              options={employees.options} loading={employees.isLoading} clearable
              placeholder="Todos los colaboradores" searchPlaceholder="Buscar colaborador..." />
          </div>
        )}
        emptyIcon={FileSignature}
        emptyTitle="Sin resguardos"
        emptyDescription={status !== ALL || employeeId ? 'Ningún resguardo coincide con los filtros.' : 'Registra la entrega de equipo a un colaborador para generar su resguardo firmado.'}
        emptyAction={{ label: 'Nuevo resguardo', onClick: () => setCreating(true) }}
      />
      <CustodyCreateSheet
        open={creating}
        onOpenChange={(value) => { setCreating(value); if (!value) setLinkDefaults(null) }}
        defaults={editorDefaults}
        onCreated={(custody) => { if (custody?.id) open(custody) }}
      />
    </div>
  )
}
