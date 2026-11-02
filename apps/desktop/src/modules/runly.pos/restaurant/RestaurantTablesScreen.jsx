import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@runly/ui'
import { Armchair, LayoutGrid, List, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { classifyPosError } from '../retail/lib/retailErrors.js'
import { usePosCommand } from '../retail/hooks/usePosCommand.js'
import CommandFailureAlert from '../../runly.catalog/components/CommandFailureAlert.jsx'
import CreateTableDialog from './components/CreateTableDialog.jsx'
import RestaurantShell from './components/RestaurantShell.jsx'
import ConnectionNotice from './components/ConnectionNotice.jsx'
import TableCard from './components/TableCard.jsx'
import { usePendingCount } from './hooks/usePendingCount.js'

const ORDER_BASE = '/app/m/runly.pos/pos/comandero/mesa'
const FILTERS = [
  { value: 'all', label: 'Todas' },
  { value: 'free', label: 'Libres' },
  { value: 'busy', label: 'Ocupadas' },
  { value: 'bill', label: 'Por cobrar' },
]
const MINE_KEY = 'runly.pos.restaurant.mineOnly'

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

function readFlag(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1' } catch { return fallback }
}

function TablesBoard({ outlet, token, caps, currency, companyId, online }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const now = useNow()
  const { userProfile } = useAuth()
  const pending = usePendingCount({ userId: userProfile?.id, companyId })
  const [filter, setFilter] = useState('all')
  const [layout, setLayout] = useState('grid')
  const [mineOnly, setMineOnly] = useState(() => readFlag(`${MINE_KEY}.${userProfile?.id}`, false))
  const [creating, setCreating] = useState(false)

  const tablesKey = ['pos-restaurant-tables', companyId, outlet.id, mineOnly, token]
  const query = useQuery({
    queryKey: tablesKey,
    queryFn: () => runly.commerce.tables({ outletId: outlet.id, ...(mineOnly ? { myTablesOnly: true } : {}) }, token),
    enabled: Boolean(token),
    refetchInterval: 10_000,
    retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
  })
  const tables = (query.data?.data ?? []).filter((t) => t.enabled !== false)

  const clean = usePosCommand({
    prefix: 'table-clean', scope: outlet.id,
    run: (body, options) => runly.commerce.updateTable(body.tableId, { expectedVersion: body.expectedVersion, status: 'AVAILABLE' }, token, options),
    onSuccess: () => { toast.success('Mesa lista para usarse'); queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables', companyId] }) },
    onError: (info) => { if (info.kind === 'conflict') query.refetch() },
  })

  function setMine(value) {
    setMineOnly(value)
    try { localStorage.setItem(`${MINE_KEY}.${userProfile?.id}`, value ? '1' : '0') } catch { /* tab-local only */ }
  }

  const visible = tables.filter((t) => {
    if (filter === 'free') return t.status === 'AVAILABLE'
    if (filter === 'busy') return Boolean(t.activeOrder)
    if (filter === 'bill') return t.status === 'BILL_REQUESTED' || (t.activeOrder?.readyLineCount ?? 0) > 0
    return true
  })
  const counts = { free: tables.filter((t) => t.status === 'AVAILABLE').length, busy: tables.filter((t) => t.activeOrder).length }
  const nextName = `Mesa ${tables.length + 1}`

  let body
  if (query.isPending) {
    body = <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Cargando mesas">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
  } else if (query.isError && !query.data) {
    const info = classifyPosError(query.error)
    body = <ErrorState title="No se pudieron cargar las mesas" description={info.message} onRetry={query.refetch} />
  } else if (tables.length === 0) {
    body = (
      <EmptyState icon={Armchair} title={mineOnly ? 'No tienes mesas asignadas' : 'Esta sucursal aún no tiene mesas'}
        description={mineOnly ? 'Muestra todas las mesas para abrir una cuenta nueva.' : caps.floorPlanner ? 'Crea tus mesas con un nombre y su capacidad. No necesitas diseñar un plano.' : 'Pide a un encargado que cree las mesas de la sucursal.'}
        action={mineOnly ? { label: 'Ver todas las mesas', onClick: () => setMine(false) } : caps.floorPlanner ? { label: 'Crear la primera mesa', onClick: () => setCreating(true) } : undefined} />
    )
  } else if (visible.length === 0) {
    body = <EmptyState icon={Armchair} title="Ninguna mesa coincide" description="Cambia el filtro para ver otras mesas." action={{ label: 'Ver todas', onClick: () => setFilter('all') }} />
  } else {
    body = (
      <ul className={layout === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-2'} aria-label={`${visible.length} mesas`}>
        {visible.map((table) => (
          <li key={table.id}>
            <TableCard table={table} currency={currency} now={now} layout={layout}
              onOpen={(t) => navigate(`${ORDER_BASE}/${t.id}`)}
              onClean={caps.floorPlanner ? (t) => clean.mutate({ tableId: t.id, expectedVersion: t.version }) : undefined} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl size="lg" ariaLabel="Filtrar mesas" className="w-auto" value={filter} onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, label: f.value === 'free' ? `Libres · ${counts.free}` : f.value === 'busy' ? `Ocupadas · ${counts.busy}` : f.label }))} />
        <Button variant={mineOnly ? 'default' : 'outline'} size="lg" className="h-11" aria-pressed={mineOnly} onClick={() => setMine(!mineOnly)}>Mis mesas</Button>
        <span className="flex-1" />
        <div role="group" aria-label="Vista" className="flex gap-1">
          <Button variant={layout === 'grid' ? 'default' : 'outline'} size="icon" className="h-11 w-11 sm:h-11 sm:w-11" aria-label="Cuadrícula" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid className="h-5 w-5" aria-hidden="true" /></Button>
          <Button variant={layout === 'list' ? 'default' : 'outline'} size="icon" className="h-11 w-11 sm:h-11 sm:w-11" aria-label="Lista" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List className="h-5 w-5" aria-hidden="true" /></Button>
        </div>
        {caps.floorPlanner && <Button size="lg" className="h-11 gap-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden="true" />Nueva mesa</Button>}
      </div>
      <ConnectionNotice online={online} isError={query.isError} hasData={Boolean(query.data)} isFetching={query.isFetching} pending={pending} updatedAt={query.dataUpdatedAt} onRetry={query.refetch} />
      <CommandFailureAlert failure={clean.failure} onRetry={clean.retry} retrying={clean.isPending} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4" aria-busy={query.isFetching}>{body}</div>
      {creating && (
        <CreateTableDialog outletId={outlet.id} token={token} suggestedName={nextName} onClose={() => setCreating(false)}
          onCreated={(table) => { setCreating(false); toast.success(`${table.name} creada`); queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables', companyId] }) }} />
      )}
    </div>
  )
}

// Tables: a card grid, no floor plan needed. Opening a table (free or taken)
// goes to the same account screen; the server decides who may do what.
export default function RestaurantTablesScreen({ comanderoMode = false }) {
  return (
    <RestaurantShell title={comanderoMode ? 'Comandero' : 'Mesas'}>
      {({ outlet, token, caps, currency, companyId, online }) => (
        <TablesBoard key={outlet.id} outlet={outlet} token={token} caps={caps} currency={currency} companyId={companyId} online={online} />
      )}
    </RestaurantShell>
  )
}
