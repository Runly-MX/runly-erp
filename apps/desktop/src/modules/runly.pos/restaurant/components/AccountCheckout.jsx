import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, Checkbox, ErrorState, SegmentedControl, Skeleton, StatusPill, cn } from '@runly/ui'
import { Banknote, CircleCheck, Receipt } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import ChargeDialog from '../../retail/components/ChargeDialog.jsx'
import ReceiptDialog from '../../retail/components/ReceiptDialog.jsx'
import SaleCompletePanel from '../../retail/components/SaleCompletePanel.jsx'
import { classifyPosError } from '../../retail/lib/retailErrors.js'
import { formatMoney, formatQuantity } from '../../retail/lib/retailRules.js'
import { TABLE_STATUS_META, activeLines, buildAllocations, lineModifiersText, lineOutstanding } from '../lib/restaurantRules.js'

const MODES = [
  { value: 'full', label: 'Cuenta completa' },
  { value: 'seat', label: 'Por comensal' },
  { value: 'lines', label: 'Por partidas' },
  { value: 'amount', label: 'Por importe' },
]

function Row({ label, value, strong }) {
  return <div className={cn('flex justify-between gap-3', strong && 'text-lg font-extrabold text-[hsl(var(--foreground))]')}><dt className={strong ? '' : 'text-[hsl(var(--muted-foreground))]'}>{label}</dt><dd className="tabular-nums">{value}</dd></div>
}

// The cashier's view of one restaurant account. Split amounts are built from
// figures the server already calculated (line totals and seat-totals
// allocations); the server validates and attributes every payment, so a split
// can neither exceed the account nor lose money.
export default function AccountCheckout({ orderId, token, companyId, session, methods, currency, canCharge, onSettled, onBack }) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState('full')
  const [picked, setPicked] = useState(() => new Set())
  const [charge, setCharge] = useState(null)
  const [done, setDone] = useState(null)
  const [receiptId, setReceiptId] = useState(null)

  const orderQ = useQuery({ queryKey: ['pos-restaurant-account', companyId, orderId, token], queryFn: () => runly.commerce.getOrder(orderId, token), refetchInterval: 8000, retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2 })
  const totalsQ = useQuery({ queryKey: ['pos-restaurant-seats', companyId, orderId, token], queryFn: () => runly.commerce.seatTotals(orderId, token), refetchInterval: 8000, retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2 })
  const order = orderQ.data?.data
  const totals = totalsQ.data?.data
  const money = (v) => formatMoney(v, currency)

  const refresh = () => {
    orderQ.refetch(); totalsQ.refetch()
    queryClient.invalidateQueries({ queryKey: ['pos-restaurant-accounts', companyId] })
    queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables', companyId] })
    onSettled?.()
  }

  const tableQ = useQuery({
    queryKey: ['pos-restaurant-table-after', companyId, order?.outletId, order?.tableId, token],
    queryFn: () => runly.commerce.tables({ outletId: order.outletId }, token),
    enabled: Boolean(done && order?.tableId),
  })

  if (orderQ.isPending || totalsQ.isPending) return <div className="space-y-3 p-4" aria-label="Cargando cuenta"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
  if (orderQ.isError || totalsQ.isError) return <ErrorState title="No se pudo cargar la cuenta" description={classifyPosError(orderQ.error ?? totalsQ.error).message} onRetry={refresh} />

  if (done) {
    const table = tableQ.data?.data?.find((t) => t.id === order.tableId)
    return (
      <div className="flex h-full flex-col">
        <SaleCompletePanel result={done} methods={methods} onReceipt={() => setReceiptId(done.receiptId)} onNext={onBack} />
        <p role="status" className="border-t border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          {table ? `${table.name}: ${TABLE_STATUS_META[table.status]?.label ?? table.status}` : tableQ.isPending && order.tableId ? 'Confirmando el estado de la mesa…' : 'Cuenta cerrada.'}
        </p>
        {receiptId && <ReceiptDialog receiptId={receiptId} token={token} onClose={() => setReceiptId(null)} />}
      </div>
    )
  }

  const lines = activeLines(order)
  const allocations = totals?.allocations ?? []
  const closed = ['PAID', 'CANCELLED', 'REFUNDED'].includes(order.status)
  const remaining = order.remainingAmount
  const payable = canCharge && !closed && Number(remaining) > 0 && Boolean(session)
  const seatLines = (seat) => lines.filter((l) => seat.lineIds.includes(l.id))

  function openCharge(title, rows) {
    const built = buildAllocations(rows, allocations)
    if (!built.allocations.length) return
    setCharge({ title, allocations: built.allocations, fixedAmount: built.amount })
  }
  function chargeFull() {
    const built = buildAllocations(lines, allocations)
    // Earlier general payments make the per-line balances add up to more than
    // the account balance: then it is paid as one general amount.
    if (built.amount === remaining) setCharge({ title: 'Cobrar la cuenta completa', allocations: built.allocations, fixedAmount: built.amount })
    else setCharge({ title: 'Cobrar el saldo de la cuenta', allocations: null, fixedAmount: remaining })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" className="h-11 lg:hidden" onClick={onBack}>Cuentas</Button>
          <h2 className="text-2xl font-extrabold text-[hsl(var(--foreground))]">{order.table?.name ?? `Cuenta #${order.orderNumber}`}</h2>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">Cuenta #{order.orderNumber} · {order.waiterName ?? 'sin mesero'} · {order.guestCount} comensales</span>
          {closed && <StatusPill tone="success" icon={CircleCheck}>{order.status === 'PAID' ? 'Pagada' : 'Cerrada'}</StatusPill>}
        </div>
        {!session && <Alert variant="warning"><AlertDescription>Abre la caja para poder cobrar.</AlertDescription></Alert>}
        {!canCharge && <Alert><AlertDescription>Tu puesto puede consultar la cuenta pero no cobrar.</AlertDescription></Alert>}

        <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label="Consumo">
          {lines.map((l) => (
            <li key={l.id} className="flex items-start gap-3 px-3 py-2.5 text-base">
              <span className="w-10 shrink-0 font-bold tabular-nums">{formatQuantity(l.quantity)}×</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{l.productName}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</span>
                {lineModifiersText(l) && <span className="block text-sm text-[hsl(var(--muted-foreground))]">{lineModifiersText(l)}</span>}
                {lineOutstanding(l, allocations) === 0 && <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Cubierta</span>}
              </span>
              <span className="font-semibold tabular-nums">{money(l.totalAmount)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-base">
          <Row label="Subtotal" value={money(order.subtotalAmount)} />
          {Number(order.discountAmount) > 0 && <Row label="Descuentos" value={`-${money(order.discountAmount)}`} />}
          <Row label="Impuestos" value={money(order.taxAmount)} />
          <Row label="Total" value={money(order.totalAmount)} strong />
          {Number(order.paidAmount) > 0 && <Row label="Pagos previos" value={money(order.netPaidAmount)} />}
          <Row label="Saldo pendiente" value={money(remaining)} strong />
        </dl>

        {payable && (
          <div className="space-y-3">
            <SegmentedControl size="lg" ariaLabel="Cómo cobrar" value={mode} onChange={(v) => { setMode(v); setPicked(new Set()) }} options={MODES} />
            {mode === 'full' && (
              <Button size="lg" className="h-14 w-full text-lg font-bold" onClick={chargeFull}><Banknote className="h-5 w-5" aria-hidden="true" />Cobrar {money(remaining)}</Button>
            )}
            {mode === 'seat' && (
              <ul className="space-y-2" aria-label="Comensales">
                {totals.seats.map((seat) => (
                  <li key={seat.id ?? 'none'} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{seat.label}</span>
                      <span className="text-sm text-[hsl(var(--muted-foreground))]">Total {money(seat.totalAmount)} · pagado {money(seat.paidAmount)}</span>
                    </span>
                    {Number(seat.remainingAmount) > 0
                      ? <Button size="lg" className="h-12 min-w-36 font-bold" onClick={() => openCharge(`Cobrar a ${seat.label}`, seatLines(seat))}>Cobrar {money(seat.remainingAmount)}</Button>
                      : <StatusPill tone="success" icon={CircleCheck}>Cubierto</StatusPill>}
                  </li>
                ))}
                {Number(totals.generalPaidAmount) > 0 && <li className="px-1 text-sm text-[hsl(var(--muted-foreground))]">Pagos generales sin asignar a un comensal: {money(totals.generalPaidAmount)}.</li>}
              </ul>
            )}
            {mode === 'lines' && (
              <>
                <ul className="space-y-2" aria-label="Partidas por cobrar">
                  {lines.filter((l) => lineOutstanding(l, allocations) > 0).map((l) => (
                    <li key={l.id}>
                      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2">
                        <Checkbox checked={picked.has(l.id)} onCheckedChange={(on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(l.id); else next.delete(l.id); return next })} aria-label={`Cobrar ${l.productName}`} />
                        <span className="min-w-0 flex-1 font-semibold">{formatQuantity(l.quantity)}× {l.productName}</span>
                        <span className="tabular-nums">{money(buildAllocations([l], allocations).amount)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button size="lg" className="h-14 w-full text-lg font-bold" disabled={picked.size === 0} onClick={() => openCharge('Cobrar partidas seleccionadas', lines.filter((l) => picked.has(l.id)))}>
                  {picked.size ? `Cobrar ${money(buildAllocations(lines.filter((l) => picked.has(l.id)), allocations).amount)}` : 'Elige las partidas a cobrar'}
                </Button>
              </>
            )}
            {mode === 'amount' && (
              <div className="space-y-2">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Un pago por importe abona al saldo sin asignarse a un comensal ni a una partida.</p>
                <Button size="lg" className="h-14 w-full text-lg font-bold" onClick={() => setCharge({ title: 'Cobrar un importe', allocations: null, fixedAmount: null })}><Receipt className="h-5 w-5" aria-hidden="true" />Elegir el importe</Button>
              </div>
            )}
          </div>
        )}
      </div>
      {charge && (
        <ChargeDialog
          order={order} sessionId={session.id} token={token} methods={methods}
          title={charge.title} allocations={charge.allocations} fixedAmount={charge.fixedAmount}
          onPaid={(result) => { setCharge(null); setDone(result); refresh() }}
          onPartial={() => { setCharge(null); setPicked(new Set()); refresh() }}
          onConflict={refresh}
          onClose={() => { setCharge(null); refresh() }}
        />
      )}
    </div>
  )
}
