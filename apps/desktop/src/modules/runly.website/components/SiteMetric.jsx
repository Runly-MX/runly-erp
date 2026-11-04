import { ChevronRight } from 'lucide-react'

const TONES = {
  blue: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
}

// Compact, clickable key figure: tinted icon, number, label and where it leads.
export function SiteMetric({ icon: Icon, label, value, hint, tone = 'blue', onClick, loading }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-left transition-colors hover:border-[hsl(var(--ring))]/50 hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-semibold leading-none tabular-nums">{loading ? '—' : value}</span>
        <span className="mt-1 block truncate text-xs text-[hsl(var(--muted-foreground))]">{label}{hint ? ` · ${hint}` : ''}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}
