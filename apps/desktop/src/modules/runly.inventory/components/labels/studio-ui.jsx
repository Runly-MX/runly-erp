import { useId, useState } from 'react'
import { cn } from '@runly/ui'
import { ChevronDown } from 'lucide-react'

// Small layout pieces shared by the Etiquetas studio.

// Single choice for 2-4 short options: rounded-md, selected = flat fill.
// (The shared SegmentedControl is pill-shaped; the studio keeps rounded-md.)
export function SegmentTabs({ options, value, onChange, ariaLabel, size = 'md', className, disabled = false }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel}
      className={cn('grid gap-1 rounded-md bg-[hsl(var(--muted)/0.7)] p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-2 font-medium transition-colors',
              size === 'sm' ? 'min-h-8 text-xs' : 'min-h-10 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-(--brand-soft) text-(--brand-primary) font-semibold'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
            )}>
            {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{option.label}</span>
            {option.count != null ? (
              <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', active ? 'bg-(--brand-primary) text-(--brand-primary-foreground)' : 'bg-[hsl(var(--background)/0.7)]')}>
                {option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

// Collapsible settings section (progressive disclosure). The header is a real
// button with aria-expanded; the summary shows the current value when closed.
export function StudioSection({ title, icon: Icon, summary, defaultOpen = true, children, actions }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="border-b border-[hsl(var(--border))] last:border-b-0">
      <div className="flex items-center gap-2">
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{title}</span>
            {!open && summary ? <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{summary}</span> : null}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
        </button>
        {actions}
      </div>
      <div id={id} hidden={!open} className="space-y-4 pb-5 pt-1">{open ? children : null}</div>
    </section>
  )
}

export function FieldHint({ children, tone = 'muted' }) {
  return (
    <p className={cn('text-xs leading-relaxed', tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : tone === 'error' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]')}>
      {children}
    </p>
  )
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
