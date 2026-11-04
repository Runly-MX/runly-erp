// Section container of the site tabs: tinted icon chip, title, one-line purpose, optional action.
// tone: blue | violet | emerald | amber | rose | neutral (same tints as SiteSectionHeader).
export const CHIP_TONES = {
  blue: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  neutral: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
}

export function SiteIconChip({ icon: Icon, tone = 'neutral', size = 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-lg'
  const glyph = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  return <span className={`grid shrink-0 place-items-center ${box} ${CHIP_TONES[tone] ?? CHIP_TONES.neutral}`}><Icon className={glyph} aria-hidden /></span>
}

export function SitePanel({ id, icon, tone = 'neutral', title, description, action, children, danger = false, dashed = false, className = '' }) {
  const border = danger ? 'border-rose-500/35' : 'border-[hsl(var(--border))]'
  return (
    <section aria-labelledby={id} className={`rounded-2xl border ${dashed ? 'border-dashed' : ''} ${border} bg-[hsl(var(--card))] p-4 md:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        {icon && <SiteIconChip icon={icon} tone={tone} />}
        <div className="min-w-0 flex-1">
          <h2 id={id} className="flex flex-wrap items-center gap-2 text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// Interactive row-card class shared by list items in the tabs (hover + visible focus).
export const ROW_CARD = 'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 transition-colors duration-200 hover:border-[hsl(var(--ring))]/40 hover:bg-[hsl(var(--muted))]/30 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]/40'
// Buttons on phones get a 44px touch target; desktop keeps the compact size.
export const TOUCH = 'h-11 sm:h-8'
