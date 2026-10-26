import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, ToolButton, cn } from '@runly/ui'
import { Hand, Maximize, Minus, Plus } from 'lucide-react'

const PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2]

export function ZoomPill({ zoom, onZoom, onFit, hand, onHand, compact = false }) {
  return (
    <div role="group" aria-label="Zoom y vista" className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1 shadow-lg">
      {compact ? null : <ToolButton label="Alejar" shortcut="Ctrl+rueda" onClick={() => onZoom(zoom / 1.2)}><Minus /></ToolButton>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" aria-label={`Zoom ${Math.round(zoom * 100)} %`} className={cn('rounded-lg px-0 font-mono text-xs tabular-nums', compact ? 'h-10 w-12' : 'h-9 w-14')}>
            {Math.round(zoom * 100)}%
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="center" className="min-w-36">
          {PRESETS.map(value => <DropdownMenuItem key={value} onSelect={() => onZoom(value)} className="justify-between tabular-nums">{value * 100} %{Math.abs(zoom - value) < 0.005 ? <span aria-hidden>•</span> : null}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onFit}>Ajustar a la pantalla</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {compact ? null : <ToolButton label="Acercar" shortcut="Ctrl+rueda" onClick={() => onZoom(zoom * 1.2)}><Plus /></ToolButton>}
      <span aria-hidden className="mx-0.5 h-6 w-px bg-[hsl(var(--border))]" />
      <ToolButton label="Ajustar a la pantalla" onClick={onFit} className={compact ? 'h-10 w-10' : undefined}><Maximize /></ToolButton>
      <ToolButton label="Mover la vista (o mantén la rueda del ratón)" shortcut="H" active={hand} onClick={() => onHand(!hand)} className={compact ? 'h-10 w-10' : undefined}><Hand /></ToolButton>
    </div>
  )
}
