import { CalendarCheck, Target, UserCheck, Users } from 'lucide-react'
import { Skeleton, cn } from '@runly/ui'

const TONES = {
  teal: 'bg-teal-600/10 text-teal-700 dark:text-teal-300',
  blue: 'bg-blue-600/10 text-blue-700 dark:text-blue-300',
  emerald: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-600/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-600/10 text-rose-700 dark:text-rose-300',
}
const STATE_TEXT = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-rose-700 dark:text-rose-400',
  muted: 'text-[hsl(var(--muted-foreground))]',
}

function StatTile({ icon: Icon, tone, label, value, caption, state = 'muted', loading }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl surface-card p-4 sm:p-5">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        {loading ? <Skeleton className="mt-1 h-8 w-16" /> : <p className="text-3xl font-bold leading-tight tabular-nums">{value}</p>}
        {loading ? <Skeleton className="mt-1 h-3 w-24" /> : <p className={cn('truncate text-xs font-medium', STATE_TEXT[state])}>{caption}</p>}
      </div>
    </div>
  )
}

// Hero strip of the four key figures, with a state line under each one.
export function SummaryStats({ data, loading }) {
  const present = data?.present?.total ?? 0
  const people = data?.people ?? 0
  const failing = data?.quotas?.failing ?? 0
  const totalQuotas = data?.quotas?.rows?.length ?? 0
  const flagged = data?.flaggedLast7d ?? 0
  const pct = people > 0 ? Math.round((present / people) * 100) : 0
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile icon={UserCheck} tone="teal" label="Presentes ahora" value={present} loading={loading} state={present > 0 ? 'ok' : 'muted'} caption={people ? `${pct}% del personal activo` : 'Sin personal activo'} />
      <StatTile icon={Users} tone="blue" label="Personal activo" value={people} loading={loading} caption="Personas que pueden checar" />
      <StatTile
        icon={Target} tone={failing ? 'rose' : 'emerald'} label="Cuotas en incumplimiento" value={failing} loading={loading}
        state={totalQuotas === 0 ? 'muted' : failing ? 'bad' : 'ok'}
        caption={totalQuotas === 0 ? 'Sin cuotas configuradas' : failing ? `de ${totalQuotas} cuotas` : 'Todas las cuotas cumplen'}
      />
      <StatTile
        icon={CalendarCheck} tone={flagged ? 'amber' : 'emerald'} label="Checadas marcadas (7 días)" value={flagged} loading={loading}
        state={flagged ? 'warn' : 'ok'} caption={flagged ? 'Revísalas en Checadas' : 'Sin incidencias'}
      />
    </div>
  )
}
