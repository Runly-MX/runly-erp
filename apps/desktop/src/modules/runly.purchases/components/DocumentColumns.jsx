import { Link } from 'react-router-dom'
import { cn } from '@runly/ui'
import { PurchaseStatusBadge } from './PurchaseStatusBadge.jsx'
import { MoneyText } from './MoneyText.jsx'
import { ItemChips } from './ItemChips.jsx'
import { BillingSummary, ReceptionSummary } from './OrderProgress.jsx'
import { PRIORITY_OPTIONS } from '../lib/purchases-constants.js'
import { daysUntil, formatDate, toNumber } from '../lib/format.js'

const PRIORITY_TONE = { LOW: 'text-slate-500', NORMAL: 'text-[hsl(var(--foreground))]', HIGH: 'text-amber-600 dark:text-amber-400', URGENT: 'text-rose-600 dark:text-rose-400 font-semibold' }
const OPEN_INVOICE = new Set(['PENDING', 'PARTIALLY_PAID', 'PENDING_APPROVAL'])

// A real link: Ctrl/Cmd + click or middle click opens the document in a new tab.
function Folio({ number, sub, to }) {
  return (
    <Link to={to} className="group block max-w-[18rem] text-left focus-visible:outline-none">
      <span className="block truncate font-semibold tabular-nums text-[hsl(var(--foreground))] group-hover:text-(--brand-primary-computed) group-hover:underline group-focus-visible:underline dark:group-hover:text-(--brand-primary-computed)">{number || 'Sin folio'}</span>
      <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{sub}</span>
    </Link>
  )
}

function DueDate({ value, status }) {
  if (!value) return <span className="text-[hsl(var(--muted-foreground))]">Sin vencimiento</span>
  const days = daysUntil(value)
  const open = OPEN_INVOICE.has(status)
  return (
    <span className="block">
      <span className="block whitespace-nowrap tabular-nums">{formatDate(value)}</span>
      {open && days != null ? (
        <span className={cn('block whitespace-nowrap text-xs', days < 0 ? 'text-rose-600 dark:text-rose-400' : days <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-[hsl(var(--muted-foreground))]')}>
          {days < 0 ? `Vencida hace ${-days} d` : days === 0 ? 'Vence hoy' : `En ${days} d`}
        </span>
      ) : null}
    </span>
  )
}

const right = (node) => <div className="text-right">{node}</div>

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
// Control documental columns: the reference people use, the internal folio
// under it; dates and supplier only when known; related documents and items.
const docFolioSub = (r) => (r.economicMode === 'DOCUMENTARY' ? `Folio interno ${r.number}` : `Folio ${r.number} · con importes`)

const orderSub = (r) => (r.status === 'PENDING_APPROVAL' ? 'Espera aprobación' : r.expectedDate ? `Entrega ${formatDate(r.expectedDate)}` : 'Sin fecha de entrega')

// Column builders keyed by name (see lib/list-config.js). The server pages
// and sorts (newest first), so no column offers a sort that would only
// reorder the visible page.
export function buildColumns(names, { kind, href }) {
  const defs = {
    reference: { id: 'reference', header: 'Referencia', cell: ({ row: { original: r } }) => <Folio number={r.reference ?? r.number} sub={docFolioSub(r)} to={href(r.id)} /> },
    docDate: { id: 'docDate', header: 'Fecha', cell: ({ row: { original: r } }) => (r.issueDate ? <span className="whitespace-nowrap tabular-nums">{formatDate(r.issueDate)}</span> : <span className="text-[hsl(var(--muted-foreground))]">Sin fecha</span>) },
    related: {
      id: 'related', header: 'Relacionados',
      cell: ({ row: { original: r } }) => {
        const text = kind === 'orders'
          ? (r.billing?.count ? plural(r.billing.count, 'factura', 'facturas') : r.billing === null ? '' : 'Sin factura')
          : (r.orderNumber ? 'Con orden de compra' : 'Sin orden')
        return <span className={cn('whitespace-nowrap text-sm', /^Sin/.test(text) && 'text-[hsl(var(--muted-foreground))]')}>{text}</span>
      },
    },
    itemsCount: { id: 'itemsCount', header: 'Inventarios', cell: ({ row: { original: r } }) => <span className={cn('whitespace-nowrap text-sm', !r.items?.count && 'text-[hsl(var(--muted-foreground))]')}>{r.items?.count ? plural(r.items.count, 'activo', 'activos') : 'Sin activos'}</span> },
    orderFolio: { id: 'orderFolio', header: 'Orden', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={orderSub(r)} to={href(r.id)} /> },
    // Compact form (narrow screens): supplier and order go under the folio.
    invoiceFolioCompact: { id: 'invoiceFolio', header: 'Factura', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={[r.supplierName || 'Sin proveedor', r.orderNumber ? `Orden ${r.orderNumber}` : 'Sin orden'].join(' · ')} to={href(r.id)} /> },
    invoiceFolio: { id: 'invoiceFolio', header: 'Factura', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={r.issueDate ? `Emitida ${formatDate(r.issueDate)}` : 'Sin fecha de emisión'} to={href(r.id)} /> },
    supplier: { id: 'supplier', header: 'Proveedor', cell: ({ row: { original: r } }) => <span className={cn('block max-w-[14rem] truncate', !r.supplierName && 'text-[hsl(var(--muted-foreground))]')} title={r.supplierName ?? undefined}>{r.supplierName || 'Sin proveedor'}</span> },
    reception: { id: 'reception', header: 'Recepción', cell: ({ row: { original: r } }) => <ReceptionSummary receipt={r.receipt} className="max-w-[12rem]" /> },
    billing: { id: 'billing', header: 'Factura', cell: ({ row: { original: r } }) => <BillingSummary billing={r.billing} className="max-w-[13rem]" /> },
    folio: { id: 'folio', header: 'Folio', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={r.supplierName || 'Sin proveedor'} to={href(r.id)} /> },
    request: { id: 'request', header: 'Solicitud', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={r.title} to={href(r.id)} /> },
    caseTitle: { id: 'caseTitle', header: 'Expediente', cell: ({ row: { original: r } }) => <Folio number={r.number} sub={[r.title, r.supplierName].filter(Boolean).join(', ')} to={href(r.id)} /> },
    items: { id: 'items', header: 'Activos', cell: ({ row: { original: r } }) => <ItemChips items={r.items} className="max-w-[16rem]" /> },
    order: { id: 'order', header: 'Orden', cell: ({ row: { original: r } }) => <span className="whitespace-nowrap tabular-nums">{r.orderNumber ?? r.order?.number ?? 'Sin orden'}</span> },
    issueDate: { accessorKey: 'issueDate', header: 'Fecha', cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDate(getValue())}</span> },
    createdAt: { accessorKey: 'createdAt', header: 'Abierto', cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue())}</span> },
    receivedAt: { accessorKey: 'receivedAt', header: 'Recibida', cell: ({ getValue }) => <span className="tabular-nums">{formatDate(getValue())}</span> },
    expectedDate: { accessorKey: 'expectedDate', header: 'Entrega', cell: ({ getValue }) => <span className="tabular-nums">{getValue() ? formatDate(getValue()) : 'Sin fecha'}</span> },
    neededBy: { accessorKey: 'neededBy', header: 'Se necesita', cell: ({ getValue }) => <DueDate value={getValue()} status="PENDING" /> },
    dueDate: { accessorKey: 'dueDate', header: 'Vence', cell: ({ row: { original: r } }) => <DueDate value={r.dueDate} status={r.status} /> },
    priority: {
      accessorKey: 'priority', header: 'Prioridad',
      cell: ({ getValue }) => <span className={PRIORITY_TONE[getValue()] ?? ''}>{PRIORITY_OPTIONS.find((p) => p.value === getValue())?.label ?? 'Normal'}</span>,
    },
    status: { accessorKey: 'status', header: 'Estado', cell: ({ getValue }) => <PurchaseStatusBadge kind={kind} status={getValue()} /> },
    total: { accessorKey: 'total', header: () => right('Total'), cell: ({ row: { original: r } }) => right(<MoneyText value={r.total} currency={r.currency} className="font-medium" />) },
    estimatedTotal: { accessorKey: 'estimatedTotal', header: () => right('Estimado'), cell: ({ row: { original: r } }) => right(<MoneyText value={r.estimatedTotal} currency={r.currency} />) },
    paid: { accessorKey: 'paidAmount', header: () => right('Pagado'), cell: ({ row: { original: r } }) => right(<MoneyText value={r.paidAmount} currency={r.currency} tone="emerald" />) },
    balance: {
      id: 'balance', header: () => right('Saldo'),
      cell: ({ row: { original: r } }) => {
        if (r.total == null) return right(<MoneyText value={null} />)
        const balance = r.status === 'CANCELLED' ? 0 : Math.max(0, toNumber(r.total) - toNumber(r.paidAmount))
        return right(<MoneyText value={balance} currency={r.currency} tone={balance > 0 ? 'amber' : undefined} className="font-medium" />)
      },
    },
  }
  return names.map((name) => defs[name]).filter(Boolean).map((def) => ({ ...def, enableSorting: false }))
}
