// Shared header of every site tab: tinted icon, title, one-line purpose and the tab's primary actions.
// tone: blue | violet | emerald | amber | rose | sky (same tints as SiteMetric).
const TONES = {
  blue: 'from-sky-500/15 text-sky-600 dark:text-sky-400 bg-sky-500/15',
  violet: 'from-orange-500/15 text-orange-600 dark:text-orange-400 bg-orange-500/15',
  emerald: 'from-emerald-500/15 text-emerald-600 dark:text-emerald-400 bg-emerald-500/15',
  amber: 'from-amber-500/15 text-amber-600 dark:text-amber-400 bg-amber-500/15',
  rose: 'from-rose-500/15 text-rose-600 dark:text-rose-400 bg-rose-500/15',
}

export function SiteSectionHeader({ icon: Icon, title, description, actions, tone = 'blue' }) {
  const [grad, ...rest] = TONES[tone].split(' ')
  return (
    <header className={`flex flex-wrap items-center gap-4 rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-r ${grad} via-[hsl(var(--card))] to-[hsl(var(--card))] p-4 md:p-5`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${rest.join(' ')}`}><Icon className="h-6 w-6" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
