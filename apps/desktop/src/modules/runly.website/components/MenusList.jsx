import { ChevronRight, PanelBottom, PanelLeft, PanelTop } from 'lucide-react'

export const MENU_LOCATION_ICONS = { header: PanelTop, footer: PanelBottom, sidebar: PanelLeft }

// Menu chooser: one row per menu with its location icon and item count.
// Phones scroll it horizontally as cards; from md up it is a vertical list.
export function MenusList({ menus, activeId, locationLabels, onSelect }) {
  return (
    <nav aria-label="Menús" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:px-0">
      {menus.map((menu) => {
        const Icon = MENU_LOCATION_ICONS[menu.location] ?? PanelTop
        const active = activeId === menu.id
        const count = (menu.items ?? []).length
        return (
          <button
            key={menu.id}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(menu.id)}
            className={`group flex min-h-14 min-w-[12rem] items-center gap-3 rounded-xl border p-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] md:min-w-0 ${active ? 'border-[hsl(var(--ring))]/50 bg-[hsl(var(--ring))]/10' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]/60'}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-[hsl(var(--ring))]/15 text-[hsl(var(--ring))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{menu.name}</span>
              <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{locationLabels[menu.location] ?? menu.location} · <span className="tabular-nums">{count}</span> {count === 1 ? 'enlace' : 'enlaces'}</span>
            </span>
            <ChevronRight className="hidden h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] md:block" aria-hidden />
          </button>
        )
      })}
    </nav>
  )
}
