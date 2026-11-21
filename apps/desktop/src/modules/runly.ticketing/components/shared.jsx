import { StatusPill, cn } from '@runly/ui'
import { ORDER_STATUS, TICKET_STATUS } from '../lib/ticketingLabels.js'

export function PageShell({ children, className }) {
  return <div className={cn('mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6', className)}>{children}</div>
}

export function OrderStatus({ status, size = 'sm' }) {
  const s = ORDER_STATUS[status] ?? { label: status, tone: 'neutral' }
  return <StatusPill tone={s.tone} size={size}>{s.label}</StatusPill>
}

export function TicketStatus({ status, size = 'sm' }) {
  const s = TICKET_STATUS[status] ?? { label: status, tone: 'neutral' }
  return <StatusPill tone={s.tone} size={size}>{s.label}</StatusPill>
}

// Big number + label, used in summaries.
export function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'warning' && 'text-amber-700 dark:text-amber-300')}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </div>
  )
}
