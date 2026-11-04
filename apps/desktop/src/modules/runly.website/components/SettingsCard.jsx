const TONES = {
  blue: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
}

// Settings section: tinted icon chip, title, purpose and an optional status on the right.
export function SettingsCard({ icon: Icon, tone = 'blue', title, description, status, children }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <header className="flex flex-wrap items-start gap-3 border-b border-[hsl(var(--border))] p-4 md:p-5">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}><Icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </header>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  )
}
