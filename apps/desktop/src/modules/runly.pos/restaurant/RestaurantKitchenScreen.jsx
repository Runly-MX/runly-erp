import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, ErrorState, SegmentedControl, Skeleton, cn } from '@runly/ui'
import { ChefHat, RefreshCw } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { classifyPosError } from '../retail/lib/retailErrors.js'
import RestaurantShell from './components/RestaurantShell.jsx'
import TicketCard from './components/TicketCard.jsx'
import { nextStatus, useKitchenActions, useKitchenBoard } from './hooks/useKitchenBoard.js'
import { useWideLayout } from './hooks/useWideLayout.js'

const COLUMNS = [
  { status: 'PENDING', label: 'Nuevas', empty: 'No hay comandas nuevas.' },
  { status: 'IN_PREPARATION', label: 'Preparando', empty: 'Nada en preparación.' },
  { status: 'READY', label: 'Listas', empty: 'Nada listo por entregar.' },
]
const STATION_KEY = 'runly.pos.kitchen.station'

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

function KitchenBoard({ outlet, token, caps, companyId, online, userProfile }) {
  const storageKey = `${STATION_KEY}.${userProfile?.id}.${outlet.id}`
  const [stationId, setStationId] = useState(() => { try { return localStorage.getItem(storageKey) || null } catch { return null } })
  const [column, setColumn] = useState('PENDING')
  const [bulkBusy, setBulkBusy] = useState(false)
  const wide = useWideLayout()
  const now = useNow()

  const stations = useQuery({
    queryKey: ['pos-restaurant-stations', companyId, outlet.id, token],
    queryFn: () => runly.commerce.stations({ outletId: outlet.id }, token),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
  const stationList = stations.data?.data ?? []
  const activeStation = stationList.some((s) => s.id === stationId) ? stationId : null
  const board = useKitchenBoard({ token, companyId, outletId: outlet.id, stationId: activeStation })
  const actions = useKitchenActions({ token, companyId })
  const canOperate = Boolean(caps.kitchenOperate) && online

  function chooseStation(id) {
    setStationId(id)
    try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey) } catch { /* tab-local only */ }
  }

  async function bulk(ticket, lines) {
    setBulkBusy(true)
    try { for (const line of lines) { if (nextStatus(line.status)) await actions.advance(ticket, line) } }
    finally { setBulkBusy(false) }
  }

  const tickets = board.data?.tickets ?? []
  const by = (status) => tickets.filter((t) => t.status === status)

  let content
  if (board.isPending) {
    content = <div className="grid gap-3 lg:grid-cols-3" aria-label="Cargando comandas">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>
  } else if (board.isError && !board.data) {
    const info = classifyPosError(board.error)
    content = info.kind === 'forbidden'
      ? <EmptyState icon={ChefHat} title="No tienes acceso a Cocina" description="Pide a un administrador el permiso de Cocina." />
      : <ErrorState title="No se pudo cargar Cocina" description={info.message} onRetry={board.refetch} />
  } else {
    const renderColumn = (c) => (
      <section key={c.status} aria-label={c.label} className="flex min-h-0 min-w-0 flex-col gap-3">
        <h2 className="flex items-center justify-between rounded-xl bg-[hsl(var(--muted))] px-4 py-2 text-lg font-extrabold text-[hsl(var(--foreground))]">
          {c.label}<span className="tabular-nums">{by(c.status).length}</span>
        </h2>
        {by(c.status).length === 0
          ? <p className="py-6 text-center text-base text-[hsl(var(--muted-foreground))]">{c.empty}</p>
          : by(c.status).map((t) => <TicketCard key={t.id} ticket={t} now={now} actions={actions} canOperate={canOperate} onBulk={bulk} bulkBusy={bulkBusy} />)}
      </section>
    )
    content = wide
      ? <div className="grid min-h-0 flex-1 grid-cols-3 gap-4 overflow-y-auto pb-4">{COLUMNS.map(renderColumn)}</div>
      : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <SegmentedControl size="lg" ariaLabel="Estado de las comandas" value={column} onChange={setColumn} options={COLUMNS.map((c) => ({ value: c.status, label: `${c.label} · ${by(c.status).length}` }))} />
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">{renderColumn(COLUMNS.find((c) => c.status === column))}</div>
        </div>
      )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {stationList.length > 1 && (
          <div role="group" aria-label="Estación" className="flex flex-wrap gap-2">
            {[{ id: null, name: 'Todas' }, ...stationList].map((s) => (
              <button key={s.id ?? 'all'} type="button" aria-pressed={activeStation === s.id} onClick={() => chooseStation(s.id)}
                className={cn('h-11 rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                  activeStation === s.id ? 'border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]')}>{s.name}</button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        {(!online || (board.isError && board.data)) && (
          <span role="status" className="text-sm font-semibold text-red-800 dark:text-red-300">No se pudo actualizar: se muestra el último tablero conocido y puede estar desactualizado.</span>
        )}
        <Button variant="outline" size="lg" className="h-11 gap-2" onClick={() => board.refetch()} loading={board.isFetching}><RefreshCw className="h-4 w-4" aria-hidden="true" />Actualizar</Button>
      </div>
      {!caps.kitchenOperate && (
        <Alert><AlertTitle>Solo consulta</AlertTitle><AlertDescription>Tu puesto puede ver las comandas pero no cambiar su estado.</AlertDescription></Alert>
      )}
      {board.data?.truncated && (
        <Alert variant="warning"><AlertDescription>Hay más comandas de las que se pueden mostrar a la vez. Entrega las listas para ver el resto.</AlertDescription></Alert>
      )}
      <div className="flex min-h-0 flex-1 flex-col" aria-busy={board.isFetching}>{content}</div>
    </div>
  )
}

// Cocina (KDS): large touch targets, no drag. The queue is polled; a network
// hiccup keeps the last known board visible and says so.
export default function RestaurantKitchenScreen() {
  return (
    <RestaurantShell title="Cocina">
      {(props) => <KitchenBoard key={props.outlet.id} {...props} />}
    </RestaurantShell>
  )
}
