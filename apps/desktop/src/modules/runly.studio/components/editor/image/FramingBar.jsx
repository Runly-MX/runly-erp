import { Button, SegmentedControl, SliderRow, ToolButton } from '@runly/ui'
import { Check, ImageUp, RotateCcw, X } from 'lucide-react'

const FIT = [{ value: 'cover', label: 'Rellenar' }, { value: 'contain', label: 'Encajar' }]

// Floating controls while framing (replaces the selection bar).
export function FramingBar({ props, disabled, onZoom, onFit, onReset, onReplace, onCancel, onDone }) {
  return (
    <div role="toolbar" aria-label="Editar encuadre" className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl p-1.5 pl-3 shadow-lg">
      <span className="text-sm font-semibold">Encuadre</span>
      <SegmentedControl ariaLabel="Ajuste de la foto en el marco" options={FIT} value={props.fit} disabled={disabled} onChange={onFit} className="w-auto [&_button]:min-w-0 [&_button]:px-2.5" />
      <div className="w-36 sm:w-44">
        <SliderRow label="Zoom" min={50} max={400} zero={100} step={5} value={Math.round(props.zoom * 100)} format={value => `${value} %`} disabled={disabled}
          onChange={value => onZoom(value / 100)} />
      </div>
      <ToolButton label="Restablecer encuadre" side="bottom" disabled={disabled} onClick={onReset}><RotateCcw /></ToolButton>
      {onReplace ? <ToolButton label="Reemplazar foto" side="bottom" disabled={disabled} onClick={onReplace}><ImageUp /></ToolButton> : null}
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5"><X />Cancelar</Button>
      <Button size="sm" onClick={onDone} className="gap-1.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white hover:from-fuchsia-500 hover:to-violet-500"><Check />Listo</Button>
    </div>
  )
}
