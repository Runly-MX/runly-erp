import { Checkbox } from '@runly/ui'
import { Lock } from 'lucide-react'

// Pages of a template to create, as checkable rows (44px+ targets). Required pages show "Base" with icon.
export function TemplatesPageSelector({ pages, selectedIds, disabled, onToggle }) {
  return (
    <ul className="space-y-1.5">
      {pages.map((p) => {
        const checked = selectedIds.includes(p.id)
        const id = `tpl-page-${p.id}`
        return (
          <li key={p.id}>
            <label
              htmlFor={id}
              className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 transition-colors duration-150 ${checked ? 'border-[hsl(var(--ring))]/40 bg-[hsl(var(--ring))]/5' : 'border-[hsl(var(--border))]'} ${p.required ? 'opacity-70' : 'cursor-pointer hover:bg-[hsl(var(--muted))]/50'}`}
            >
              <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={() => onToggle(p.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.label}</span>
                <span className="block truncate font-mono text-[11px] text-[hsl(var(--muted-foreground))]">{p.routePath}</span>
              </span>
              {p.required && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><Lock className="h-3 w-3" aria-hidden />Base</span>
              )}
            </label>
          </li>
        )
      })}
    </ul>
  )
}
