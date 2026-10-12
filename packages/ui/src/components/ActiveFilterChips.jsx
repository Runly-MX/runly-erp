import { X } from 'lucide-react'
import { OptionGlyph } from './FilterMenuPanes.jsx'
import { buildChips, clearAllPatch } from './filter-menu-helpers.js'
import { cn } from '../lib/utils.js'

/**
 * Removable chips ("Tipo: Empleado") for the active filters of a FilterMenu.
 * Renders nothing when no filter is active. Scrolls horizontally on mobile.
 */
export function ActiveFilterChips({ filters = [], value = {}, onChange, className }) {
  const chips = buildChips(filters, value)
  if (!chips.length) return null
  return (
    <div className={cn('flex items-center gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible', className)} aria-label="Filtros activos">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-(--brand-primary) bg-(--brand-soft) pl-2.5 pr-1 text-xs">
          {chip.icon ? <chip.icon className="h-3 w-3 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /> : null}
          <span className="text-[hsl(var(--muted-foreground))]">{chip.label}:</span>
          <OptionGlyph icon={chip.optionIcon} color={chip.optionColor} className="h-3 w-3" />
          <span className="max-w-48 truncate font-medium">{chip.text}</span>
          <button
            type="button"
            aria-label={`Quitar filtro ${chip.label}`}
            onClick={() => onChange?.({ ...value, ...chip.patch })}
            className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-[hsl(var(--muted))]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 ? (
        <button
          type="button"
          onClick={() => onChange?.({ ...value, ...clearAllPatch(filters) })}
          className="shrink-0 px-1 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          Limpiar todo
        </button>
      ) : null}
    </div>
  )
}
