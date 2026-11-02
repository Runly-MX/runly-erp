import { Button, StatusPill, cn } from '@runly/ui'
import { BellRing, CheckCheck, Clock, Receipt, Sparkles, Users, UtensilsCrossed } from 'lucide-react'
import { formatMoney } from '../../retail/lib/retailRules.js'
import { TABLE_STATUS_META, elapsedLabel } from '../lib/restaurantRules.js'

const STATUS_ICON = { AVAILABLE: CheckCheck, OCCUPIED: UtensilsCrossed, BILL_REQUESTED: Receipt, DIRTY: Sparkles, RESERVED: Clock }

// One table. State is never color alone: every status has a label and an icon.
export default function TableCard({ table, currency, now, layout = 'grid', onOpen, onClean, onEdit }) {
  const meta = TABLE_STATUS_META[table.enabled===false?'DISABLED':table.status] ?? TABLE_STATUS_META.AVAILABLE
  const Icon = STATUS_ICON[table.status] ?? CheckCheck
  const order = table.activeOrder
  const ready = order?.readyLineCount ?? 0
  const busy = Boolean(order)
  const reconcile = table.reconciliationRequired
  const label = [
    `${table.name}, ${meta.label}`,
    order ? `cuenta ${order.orderNumber ?? ''}, ${formatMoney(order.totalAmount, currency)}${order.waiterName ? `, mesero ${order.waiterName}` : ''}` : `capacidad ${table.capacity}`,
    ready ? `${ready} listas para llevar` : null,
  ].filter(Boolean).join(', ')
  const disabled = table.enabled===false || reconcile || table.status === 'DISABLED' || table.status === 'RESERVED' && !busy

  return (
    <div className={cn('relative rounded-2xl border bg-[hsl(var(--card))] transition-colors',
      ready ? 'border-2 border-emerald-600 dark:border-emerald-400' : table.status === 'BILL_REQUESTED' ? 'border-2 border-(--brand-primary)' : 'border-[hsl(var(--border))]')}>
      <button
        type="button"
        onClick={() => onOpen(table)}
        disabled={disabled || table.status === 'DIRTY'}
        aria-label={label}
        className={cn('flex w-full gap-3 rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed',
          layout === 'grid' ? 'min-h-36 flex-col' : 'min-h-20 flex-row items-center',
          !disabled && table.status !== 'DIRTY' && 'hover:bg-[hsl(var(--muted))]/60 active:scale-[0.99]')}
      >
        <span className={cn('flex items-start justify-between gap-2', layout === 'list' && 'w-48 shrink-0')}>
          <span className="min-w-0">
            <span className="block truncate text-xl font-extrabold text-[hsl(var(--foreground))]">{table.name}</span>
            <span className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]"><Users className="h-4 w-4" aria-hidden="true" />{order ? `${order.guestCount ?? '—'} comensales` : `Para ${table.capacity}`}</span>
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <StatusPill tone={meta.tone} icon={Icon}>{reconcile ? 'Requiere conciliación' : meta.label}</StatusPill>
          {order && (
            <>
              <span className="text-lg font-bold tabular-nums text-[hsl(var(--foreground))]">{formatMoney(order.totalAmount, currency)}</span>
              <span className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]"><Clock className="h-4 w-4" aria-hidden="true" />{elapsedLabel(order.openedAt, now)}</span>
              {order.waiterName && <span className="truncate text-sm text-[hsl(var(--muted-foreground))]">{order.waiterName}</span>}
            </>
          )}
        </span>
      </button>
      {ready > 0 && (
        <span className="absolute right-3 top-3"><StatusPill tone="success" icon={BellRing}>{ready} {ready === 1 ? 'lista' : 'listas'}</StatusPill></span>
      )}
      {table.status === 'DIRTY' && onClean && (
        <div className="px-4 pb-4">
          <button type="button" onClick={() => onClean(table)} className="h-11 w-full rounded-md border border-[hsl(var(--border))] text-sm font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
            Marcar como limpia
          </button>
        </div>
      )}
      {onEdit&&<div className="px-4 pb-4"><Button variant="outline" size="lg" className="h-11 w-full" aria-label={`Editar mesa ${table.name}`} onClick={()=>onEdit(table)}>Editar mesa</Button></div>}
    </div>
  )
}
