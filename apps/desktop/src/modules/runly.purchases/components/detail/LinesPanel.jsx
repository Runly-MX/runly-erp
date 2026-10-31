import { useMemo } from 'react'
import { PackagePlus, Rows3 } from 'lucide-react'
import { Button, DataTable } from '@runly/ui'
import { MoneyText } from '../MoneyText.jsx'
import { computeTotals } from '../../lib/document-math.js'
import { formatMoney, formatQty, toNumber } from '../../lib/format.js'

const right = (node) => <div className="text-right">{node}</div>

function ReceivedBar({ line }) {
  const qty = toNumber(line.quantity)
  const got = toNumber(line.receivedQuantity)
  const pct = qty ? Math.min(100, Math.round((got / qty) * 100)) : 0
  return (
    <div className="min-w-[6rem]">
      <span className="text-xs tabular-nums">{formatQty(got)} de {formatQty(qty)}</span>
      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <span className={`block h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-(--brand-primary)'}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

// Concepts of a saved document. Goods lines can spawn inventory items.
export function LinesPanel({ kind, doc, canCreateItems, onCreateItems }) {
  const lines = useMemo(() => doc.lines ?? [], [doc.lines])
  const totals = computeTotals(lines.map((l) => ({ ...l, taxRate: l.taxRate ?? 0 })))
  // Control documental: lines without prices, taxes, totals or receipts.
  const documentary = doc.economicMode === 'DOCUMENTARY'
  const priced = kind !== 'receipts' && !documentary
  const showReceived = kind === 'orders' && !documentary && lines.some((l) => l.receivedQuantity != null)

  const columns = useMemo(() => [
    {
      id: 'concept', header: 'Concepto',
      cell: ({ row: { original: l, index } }) => (
        <div className={`flex gap-3 ${showReceived ? 'min-w-[10rem]' : 'min-w-[14rem]'}`}>
          <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}</span>
          <div className="min-w-0">
            <p className="font-medium">{l.description || (l.itemKind === 'SERVICE' ? 'Servicio sin concepto' : 'Sin concepto')}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{l.itemKind === 'SERVICE' ? (showReceived ? 'Servicio · no se recibe' : 'Servicio') : 'Bien'}{l.unit ? `, por ${l.unit}` : ''}</p>
          </div>
        </div>
      ),
    },
    { id: 'qty', header: () => right(showReceived ? 'Pedido' : 'Cantidad'), cell: ({ row: { original: l } }) => right(l.quantity == null ? <span className="text-[hsl(var(--muted-foreground))]">Sin cantidad</span> : <span className="tabular-nums">{formatQty(l.quantity)}</span>) },
    // Orders: what arrived and what is still missing, per line and in its own unit.
    ...(showReceived ? [
      { id: 'received', header: 'Recibido', cell: ({ row: { original: l } }) => (l.itemKind === 'SERVICE' ? <span className="text-[hsl(var(--muted-foreground))]">No aplica</span> : <ReceivedBar line={l} />) },
      {
        id: 'pending', header: () => right('Pendiente'),
        cell: ({ row: { original: l } }) => right(l.itemKind === 'SERVICE' ? <span className="text-[hsl(var(--muted-foreground))]">No aplica</span>
          : <span className={`tabular-nums ${toNumber(l.pendingQuantity) > 0 ? 'font-semibold text-amber-800 dark:text-amber-300' : 'text-[hsl(var(--muted-foreground))]'}`}>{formatQty(l.pendingQuantity ?? Math.max(0, toNumber(l.quantity) - toNumber(l.receivedQuantity)))}</span>),
      },
    ] : []),
    // Orders need room for Pedido / Recibido / Pendiente: the unit price goes
    // under the amount and taxes stay in the totals below.
    ...(priced && !showReceived ? [{ id: 'price', header: () => right('Precio'), cell: ({ row: { original: l } }) => right(<MoneyText value={l.unitAmount} currency={doc.currency} />) },
    { id: 'tax', header: () => right('Impuesto'), cell: ({ row: { original: l } }) => right(<span className="tabular-nums text-[hsl(var(--muted-foreground))]">{l.taxRate != null ? `${Math.round(toNumber(l.taxRate) * 100)}%` : formatMoney(l.taxAmount, doc.currency)}</span>) }] : []),
    ...(priced ? [{
      id: 'total', header: () => right('Importe'),
      cell: ({ row: { original: l } }) => right(
        <span className="block">
          <MoneyText value={l.total} currency={doc.currency} className="font-medium" />
          {showReceived ? <span className="block whitespace-nowrap text-xs text-[hsl(var(--muted-foreground))]">{formatMoney(l.unitAmount, doc.currency)} c/u</span> : null}
        </span>,
      ),
    }] : []),
    ...(canCreateItems ? [{
      id: 'inventory', header: '',
      cell: ({ row: { original: l } }) => (l.itemKind !== 'SERVICE' && l.id ? (
        <Button variant="ghost" size="sm" onClick={() => onCreateItems(l)} title="Dar de alta en Inventario"><PackagePlus className="h-4 w-4" />Crear activos</Button>
      ) : null),
    }] : []),
  ], [priced, showReceived, canCreateItems, doc.currency, onCreateItems])

  return (
    <div className="space-y-4">
      <DataTable columns={columns} data={lines} manualPagination showToolbar={false} showPagination={false} pageSize={Math.max(10, lines.length)}
        emptyIcon={Rows3} emptyTitle="Sin conceptos" emptyDescription="Este documento no tiene conceptos capturados." getRowId={(l, i) => l.id ?? String(i)} />
      {lines.length && priced ? (
        <dl className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Subtotal</dt><dd className="tabular-nums">{formatMoney(doc.subtotal ?? totals.subtotal, doc.currency)}</dd></div>
          <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Impuestos</dt><dd className="tabular-nums">{formatMoney(doc.tax ?? totals.tax, doc.currency)}</dd></div>
          <div className="flex justify-between border-t border-dashed border-[hsl(var(--border))] pt-1.5 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(doc.total ?? doc.estimatedTotal ?? totals.total, doc.currency)}</dd></div>
        </dl>
      ) : null}
    </div>
  )
}
