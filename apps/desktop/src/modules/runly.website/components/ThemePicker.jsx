import { CheckCircle2 } from 'lucide-react'

// Theme selector as cards: name plus "En uso" (icon + text) for the theme applied to the site.
export function ThemePicker({ themes, activeThemeId, appliedThemeId, onSelect }) {
  return (
    <div role="radiogroup" aria-label="Temas" className="flex flex-wrap gap-2">
      {themes.map((t) => {
        const selected = activeThemeId === t.id
        const inUse = appliedThemeId === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(t.id)}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${selected ? 'border-[hsl(var(--ring))] bg-[hsl(var(--ring))]/10 font-medium' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]/60'}`}
          >
            <span className="truncate">{t.name}</span>
            {inUse && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" aria-hidden />En uso</span>}
          </button>
        )
      })}
    </div>
  )
}
