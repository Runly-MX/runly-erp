import { cn } from '@runly/ui'
import { Frame, Images, Layers, Shapes, Type } from 'lucide-react'

export const RAIL_ITEMS = [
  { key: 'elements', label: 'Elementos', icon: Shapes },
  { key: 'text', label: 'Texto', icon: Type },
  { key: 'images', label: 'Imágenes', icon: Images },
  { key: 'layers', label: 'Capas', icon: Layers },
  { key: 'page', label: 'Página', icon: Frame },
]

// Vertical rail (tablet/desktop) or bottom bar (phone). Choosing the active
// item again closes its panel.
export function StudioRail({ value, onChange, orientation = 'vertical' }) {
  const vertical = orientation === 'vertical'
  return (
    <nav aria-label="Herramientas de diseño"
      className={cn('flex shrink-0 bg-[hsl(var(--card))]', vertical
        ? 'w-[76px] flex-col gap-1 border-r border-[hsl(var(--border))] px-1.5 py-2'
        : 'items-stretch justify-around border-t border-[hsl(var(--border))] px-1 pb-[max(0.25rem,var(--sab))] pt-1')}>
      {RAIL_ITEMS.map(item => {
        const Icon = item.icon, active = value === item.key
        return (
          <button key={item.key} type="button" aria-pressed={active} onClick={() => onChange(active ? null : item.key)}
            className={cn('group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              vertical ? 'w-full py-1.5' : 'min-w-14 flex-1 py-1',
              active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')}>
            <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 group-active:scale-95 motion-reduce:transition-none',
              active ? 'bg-gradient-to-br from-fuchsia-600 to-violet-600 text-white shadow-md shadow-fuchsia-600/25' : 'group-hover:bg-[hsl(var(--muted))]')}>
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
