import { Check } from 'lucide-react'
import { cn } from '../lib/utils.js'

// Pill toggle that matches the other toolbar controls (same height and radius).
export function ToggleFilter({ label, checked = false, onChange, icon: Icon, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors sm:h-9',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-1',
        checked
          ? 'border-(--brand-primary) bg-(--brand-soft) text-[hsl(var(--foreground))]'
          : 'border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
        className,
      )}
    >
      {checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : Icon ? <Icon className="h-3.5 w-3.5 opacity-70" aria-hidden="true" /> : null}
      {label}
    </button>
  )
}
