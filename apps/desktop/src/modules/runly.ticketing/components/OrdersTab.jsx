import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DataTable, SelectField } from '@runly/ui'
import { ChevronRight, ListChecks } from 'lucide-react'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { useOrders } from '../hooks/useTicketing.js'
import { CHANNEL, MUTED, ORDER_STATUS, money, optionsOf, ticketingPath } from '../lib/ticketingLabels.js'
import { OrderStatus } from './shared.jsx'

const ALL = 'all'

// Orders of the event (newest first) with their buyer and active tickets; the table
// searches reference, buyer and email; holders and codes are searched on the server.
export function OrdersTab({ event }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(ALL)
  const [sessionId, setSessionId] = useState(ALL)
  const orders = useOrders(event.id, { ...(status !== ALL ? { status } : {}), ...(sessionId !== ALL ? { sessionId } : {}) })
  const sessionLabel = useMemo(() => new Map((event.sessions ?? []).map((s) => [s.id, formatDateTime(s.startsAt, event.timezone ?? 'UTC')])), [event])
  const open = (o) => navigate(ticketingPath(`/events/${event.id}/orders/${o.id}`))
  const columns = useMemo(() => [
    { id: 'reference', header: 'Orden', accessorFn: (o) => `${o.reference} ${o.buyerName ?? ''} ${o.buyerEmail ?? ''}`, cell: ({ row: { original: o } }) => (
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold">{o.reference}</p>
        <p className={`${MUTED} truncate`}>{o.buyerName || o.buyerEmail || 'Sin nombre'}</p>
      </div>
    ) },
    { id: 'session', header: 'Función', accessorFn: (o) => sessionLabel.get(o.sessionId) ?? '', cell: ({ getValue }) => <span className="text-sm">{getValue()}</span> },
    { id: 'tickets', header: 'Boletos', accessorFn: (o) => o.activeTickets, cell: ({ row: { original: o } }) => <span className="text-sm tabular-nums">{o.activeTickets}{o.cancelledTickets ? <span className={MUTED}> · {o.cancelledTickets} cancel.</span> : null}</span> },
    { id: 'amount', header: 'Importe', accessorFn: (o) => Number(o.totals?.amount ?? 0), cell: ({ row: { original: o } }) => <span className="text-sm tabular-nums">{Number(o.totals?.amount ?? 0) ? money(o.totals.amount, o.totals.currency) : 'Gratis'}</span> },
    { id: 'channel', header: 'Canal', accessorFn: (o) => CHANNEL[o.channel], cell: ({ getValue }) => <span className={MUTED}>{getValue()}</span> },
    { id: 'status', header: 'Estado', accessorFn: (o) => o.status, cell: ({ getValue }) => <OrderStatus status={getValue()} /> },
    { id: 'open', header: '', enableSorting: false, cell: ({ row }) => <Button type="button" variant="ghost" size="sm" onClick={() => open(row.original)} aria-label={`Abrir orden ${row.original.reference}`}>Ver<ChevronRight /></Button> },
  ], [sessionLabel]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DataTable
      columns={columns}
      data={orders.data ?? []}
      getRowId={(o) => o.id}
      isLoading={orders.isPending}
      isError={orders.isError}
      onRetry={() => orders.refetch()}
      pageSize={25}
      searchPlaceholder="Buscar por orden, comprador o correo…"
      stateKey={`ticketing-orders-${event.id}`}
      emptyIcon={ListChecks}
      emptyTitle="Sin órdenes"
      emptyDescription="Las órdenes aparecen al emitir o apartar boletos en Taquilla."
      toolbarStart={(
        <div className="flex flex-wrap gap-2">
          <SelectField aria-label="Estado" className="w-full sm:w-48" options={[{ value: ALL, label: 'Todos los estados' }, ...optionsOf(ORDER_STATUS)]} value={status} onValueChange={setStatus} />
          <SelectField aria-label="Función" className="w-full sm:w-64" options={[{ value: ALL, label: 'Todas las funciones' }, ...(event.sessions ?? []).map((s) => ({ value: s.id, label: sessionLabel.get(s.id) }))]} value={sessionId} onValueChange={setSessionId} />
        </div>
      )}
    />
  )
}
