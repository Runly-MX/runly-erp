import { Button, StatusPill, cn } from '@runly/ui'
import { AlarmClock, Check, ChefHat, Flame, MessageSquareText, Plus, Undo2, UtensilsCrossed } from 'lucide-react'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import { formatQuantity } from '../../retail/lib/retailRules.js'
import { clockLabel, elapsedLabel, elapsedMinutes } from '../lib/restaurantRules.js'

const ACTION = {
  PENDING: { label: 'Empezar', icon: Flame },
  IN_PREPARATION: { label: 'Listo', icon: Check },
  READY: { label: 'Entregar', icon: UtensilsCrossed },
}
const STATUS_LABEL = { PENDING: 'Pendiente', IN_PREPARATION: 'Preparando', READY: 'Lista', DELIVERED: 'Entregada', CANCELLED: 'Cancelada' }
const STATUS_TONE = { PENDING: 'neutral', IN_PREPARATION: 'warning', READY: 'success', DELIVERED: 'neutral', CANCELLED: 'danger' }

function LineRow({ ticket, line, actions, canOperate }) {
  const next = ACTION[line.status]
  const busy = actions.busy.has(line.id)
  const failure = actions.failures[line.id]
  const mods = (line.modifiers ?? []).map((m) => m.optionName).filter(Boolean).join(', ')
  const canUndo = actions.undo?.lineId === line.id
  return (
    <li className="space-y-2 rounded-xl bg-[hsl(var(--muted))]/60 p-3">
      <div className="flex items-start gap-3">
        <span className="min-w-10 text-2xl font-extrabold tabular-nums text-[hsl(var(--foreground))]">{formatQuantity(line.quantity)}×</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold leading-tight text-[hsl(var(--foreground))]">{line.productName ?? 'Producto'}{line.variantLabel ? ` · ${line.variantLabel}` : ''}</span>
          {mods && <span className="block text-base text-[hsl(var(--foreground))]">{mods}</span>}
          {line.historicalSnapshotUnknown && <span className="block text-sm italic text-[hsl(var(--muted-foreground))]">Detalle histórico no disponible</span>}
        </span>
        <StatusPill tone={STATUS_TONE[line.status]}>{STATUS_LABEL[line.status] ?? line.status}</StatusPill>
      </div>
      {line.note && (
        <p className="flex items-start gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 px-3 py-2 text-base font-bold text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100">
          <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span>{line.note}</span>
        </p>
      )}
      <CommandFailureAlert failure={failure} onRetry={() => actions.retry(ticket, line)} retrying={busy} />
      {(next || canUndo) && (
        <div className="flex gap-2">
          {next && (
            <Button type="button" size="lg" className="h-14 flex-1 text-lg font-bold" disabled={!canOperate || busy} loading={busy}
              aria-label={`${next.label}: ${formatQuantity(line.quantity)} ${line.productName ?? ''}`} onClick={() => actions.advance(ticket, line)}>
              <next.icon className="h-5 w-5" aria-hidden="true" />{next.label}
            </Button>
          )}
          {canUndo && (
            <Button type="button" variant="outline" size="lg" className="h-14 px-5 text-base font-semibold" disabled={busy} onClick={() => actions.undoLast(ticket)}>
              <Undo2 className="h-5 w-5" aria-hidden="true" />Deshacer
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

// One kitchen ticket (one dispatch to one station). Every value comes from
// the server DTO; nothing is invented for historical tickets.
export default function TicketCard({ ticket, now, actions, canOperate, onBulk, bulkBusy }) {
  const lines = ticket.lines ?? []
  const open = lines.filter((l) => ['PENDING', 'IN_PREPARATION', 'READY'].includes(l.status))
  const allSame = open.length > 1 && open.every((l) => l.status === open[0].status) ? open[0].status : null
  const late = ticket.isLate
  const extra = ticket.dispatchSequence > 1
  const lateMinutes = ticket.dispatchedAt ? Math.max(0, (elapsedMinutes(ticket.dispatchedAt, now) ?? 0) - (ticket.lateAfterMinutes ?? 0)) : 0
  const bulk = allSame ? ACTION[allSame] : null
  return (
    <article className={cn('space-y-3 rounded-2xl border-2 bg-[hsl(var(--card))] p-4', late ? 'border-red-700 dark:border-red-400' : 'border-[hsl(var(--border))]')} aria-label={`Comanda ${ticket.orderLabel}`}>
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-2xl font-extrabold leading-tight text-[hsl(var(--foreground))]">{ticket.orderLabel}</h3>
          <span className="flex flex-wrap gap-1.5">
            {extra && <StatusPill tone="brand" icon={Plus}>Extra · envío {ticket.dispatchSequence}</StatusPill>}
            {ticket.historicalDispatchUnknown && <StatusPill tone="neutral">Sin datos de envío</StatusPill>}
            {late && <StatusPill tone="danger" icon={AlarmClock}>Retrasada{lateMinutes ? ` +${lateMinutes} min` : ''}</StatusPill>}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-[hsl(var(--muted-foreground))]">
          {ticket.tableName && <span className="font-semibold text-[hsl(var(--foreground))]">{ticket.tableName}</span>}
          <span className="inline-flex items-center gap-1"><ChefHat className="h-4 w-4" aria-hidden="true" />{ticket.waiterName ?? 'Sin mesero'}</span>
          <span>Enviada {clockLabel(ticket.dispatchedAt)}</span>
          <span className={cn('font-bold tabular-nums', late && 'text-red-800 dark:text-red-300')}>{elapsedLabel(ticket.dispatchedAt, now)}</span>
        </p>
      </header>
      <ul className="space-y-2">{lines.map((line) => <LineRow key={line.id} ticket={ticket} line={line} actions={actions} canOperate={canOperate} />)}</ul>
      {bulk && (
        <Button type="button" variant="outline" size="lg" className="h-14 w-full text-lg font-bold" disabled={!canOperate || bulkBusy} onClick={() => onBulk(ticket, open)}>
          <bulk.icon className="h-5 w-5" aria-hidden="true" />{bulk.label} todo
        </Button>
      )}
    </article>
  )
}
