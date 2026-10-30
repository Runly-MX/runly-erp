import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { EmptyState, cn } from '@runly/ui'
import { ROOT } from '../../lib/purchases-constants.js'
import { formatDate } from '../../lib/format.js'

const DOT = {
  done: 'bg-emerald-600 dark:bg-emerald-400',
  progress: 'bg-(--brand-primary)',
  warning: 'bg-amber-500',
  danger: 'bg-rose-600 dark:bg-rose-400',
  neutral: 'bg-[hsl(var(--muted-foreground))]',
}
const hasTime = (at) => /T\d{2}:\d{2}/.test(at)
const when = (at) => {
  if (!hasTime(at)) return formatDate(at)
  const d = new Date(at)
  return `${formatDate(at)} · ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`
}

// Vertical chronology (direction C): what happened, when, and a link to the
// document it belongs to. Events come from lib/case-timeline.js.
export function Timeline({ events = [], label, emptyTitle = 'Sin movimientos todavía' }) {
  if (!events.length) return <EmptyState icon={History} title={emptyTitle} />
  return (
    <ol aria-label={label} className="relative space-y-4 border-l border-[hsl(var(--border))] pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className={cn('absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[hsl(var(--card))]', DOT[e.tone] ?? DOT.neutral)} />
          <p className="text-sm font-semibold leading-snug">
            {e.kind && e.docId
              ? <Link to={`${ROOT}/${e.kind}/${e.docId}`} className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">{e.title}</Link>
              : e.title}
          </p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{[when(e.at), e.detail].filter(Boolean).join(' · ')}</p>
        </li>
      ))}
    </ol>
  )
}
