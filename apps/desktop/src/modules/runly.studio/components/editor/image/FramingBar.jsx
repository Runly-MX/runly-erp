import { Button, ToolButton, cn } from '@runly/ui'
import { Check, ImageUp, Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from 'lucide-react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Floating controls while framing (replaces the selection bar). One compact
// row on desktop; on phones the actions drop to a second row instead of
// squeezing the zoom slider.
export function FramingBar({ props, disabled, onZoom, onFit, onReset, onReplace, onCancel, onDone }) {
  const zoom = Math.round(props.zoom * 100)
  const fitButton = (value, label, Icon) => (
    <ToolButton label={label} side="bottom" active={props.fit === value} disabled={disabled} onClick={() => onFit(value)} className="h-9 w-9"><Icon /></ToolButton>
  )
  return (
    <div role="toolbar" aria-label="Editar encuadre"
      className="glass pointer-events-auto flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl p-1.5 shadow-lg">
      <div className="flex items-center gap-1">
        <span className="hidden px-1.5 text-sm font-semibold sm:inline">Encuadre</span>
        {fitButton('cover', 'Rellenar el marco', Maximize2)}
        {fitButton('contain', 'Mostrar la foto completa', Minimize2)}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-[hsl(var(--border))]" />
        <ToolButton label="Alejar la foto" side="bottom" disabled={disabled} onClick={() => onZoom(clamp((zoom - 10) / 100, 0.5, 4))} className="h-9 w-9"><Minus /></ToolButton>
        <input type="range" min={50} max={400} step={5} value={zoom} disabled={disabled} aria-label="Zoom de la foto" onChange={event => onZoom(Number(event.target.value) / 100)}
          className="h-2 w-24 cursor-pointer accent-fuchsia-600 sm:w-32" />
        <ToolButton label="Acercar la foto" side="bottom" disabled={disabled} onClick={() => onZoom(clamp((zoom + 10) / 100, 0.5, 4))} className="h-9 w-9"><Plus /></ToolButton>
        <span className="w-11 text-center text-xs font-medium tabular-nums text-[hsl(var(--muted-foreground))]">{zoom}%</span>
      </div>
      <div className="flex items-center gap-1">
        <ToolButton label="Restablecer encuadre" side="bottom" disabled={disabled} onClick={onReset} className="h-9 w-9"><RotateCcw /></ToolButton>
        {onReplace ? <ToolButton label="Reemplazar foto" side="bottom" disabled={disabled} onClick={onReplace} className="h-9 w-9"><ImageUp /></ToolButton> : null}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-[hsl(var(--border))]" />
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-9 gap-1.5 px-2.5"><X /><span className={cn('max-sm:sr-only')}>Cancelar</span></Button>
        <Button size="sm" onClick={onDone} className="h-9 gap-1.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 text-white hover:from-fuchsia-500 hover:to-violet-500"><Check />Listo</Button>
      </div>
    </div>
  )
}
