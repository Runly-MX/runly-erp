import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, ToolButton } from '@runly/ui'
import { Grid3x3, Magnet } from 'lucide-react'

const SIZES = [8, 10, 20, 40, 50, 100]
const keep = event => event.preventDefault() // several toggles without reopening the menu

// Canvas preferences in the zoom pill: one-click magnet toggle plus a menu
// with snapping targets, grid, rulers and smart-guide visibility.
export function CanvasPreferencesMenu({ canvas, compact = false }) {
  const { preferences: p, update, toggle } = canvas, snapping = p.snapping
  const size = compact ? 'h-10 w-10' : undefined
  return (
    <>
      <ToolButton label={snapping.enabled ? 'Ajuste magnético activado (mantén Alt para mover libre)' : 'Ajuste magnético desactivado'} active={snapping.enabled}
        aria-pressed={snapping.enabled} onClick={toggle.snapping} className={size}><Magnet /></ToolButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolButton label="Cuadrícula, reglas y guías" active={p.grid.visible || p.grid.rulers} className={size}><Grid3x3 /></ToolButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="min-w-60">
          <DropdownMenuLabel>Ajuste magnético</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={snapping.enabled} onSelect={keep} onCheckedChange={toggle.snapping}>Activado</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={snapping.page} disabled={!snapping.enabled} onSelect={keep} onCheckedChange={page => update({ snapping: { page } })}>Ajustar a la página</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={snapping.objects} disabled={!snapping.enabled} onSelect={keep} onCheckedChange={objects => update({ snapping: { objects } })}>Ajustar a objetos</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={snapping.grid} disabled={!snapping.enabled} onSelect={keep} onCheckedChange={grid => update({ snapping: { grid } })}>Ajustar a la cuadrícula</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Vista</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={p.guides} onSelect={keep} onCheckedChange={guides => update({ guides })}>Mostrar guías inteligentes</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={p.grid.visible} onSelect={keep} onCheckedChange={toggle.grid}>Mostrar cuadrícula<DropdownMenuShortcut>Ctrl+'</DropdownMenuShortcut></DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={p.grid.rulers} onSelect={keep} onCheckedChange={toggle.rulers}>Mostrar reglas<DropdownMenuShortcut>Mayús+R</DropdownMenuShortcut></DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Tamaño de cuadrícula<span className="ml-auto pl-3 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{p.grid.size} px</span></DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={String(p.grid.size)} onValueChange={value => update({ grid: { size: Number(value) } })}>
                {SIZES.map(value => <DropdownMenuRadioItem key={value} value={String(value)} className="tabular-nums">{value} px</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">Mantén Alt al mover para no ajustar.</p>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
