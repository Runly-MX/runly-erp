import { Button, Popover, PopoverContent, PopoverTrigger, SegmentedControl, ToolButton, cn } from '@runly/ui'
import { ImageIcon, ImagePlus, PaintBucket, PanelRight, RectangleHorizontal } from 'lucide-react'
import { canHoldPhoto } from '../../../lib/photo-target.js'
import { fillKind, paintCss } from '../../../lib/paint.js'
import { StudioColorPicker } from '../StudioColorPicker.jsx'
import { GradientEditor, GradientPresets } from './GradientEditor.jsx'

const KINDS = [{ value: 'none', label: 'Ninguno' }, { value: 'solid', label: 'Color' }, { value: 'gradient', label: 'Degradado' }, { value: 'image', label: 'Foto' }]
const kindsFor = item => (canHoldPhoto(item) ? KINDS : KINDS.slice(0, 2))

// Small swatch of the current fill (used on triggers and in the picker).
export function FillSwatch({ item, className }) {
  const kind = fillKind(item)
  return (
    <span aria-hidden className={cn('relative block h-5 w-5 overflow-hidden rounded-md ring-1 ring-inset ring-black/15 dark:ring-white/20', className)}
      style={{ background: kind === 'gradient' ? paintCss(item.fillPaint) : kind === 'solid' ? item.fill : 'transparent' }}>
      {kind === 'none' ? <span className="absolute left-1/2 top-1/2 h-px w-7 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500" /> : null}
      {kind === 'image' ? <ImageIcon className="h-full w-full p-0.5 text-[hsl(var(--muted-foreground))]" /> : null}
    </span>
  )
}

function KindTabs({ item, disabled, paint }) {
  return <SegmentedControl ariaLabel="Tipo de relleno" options={kindsFor(item)} value={fillKind(item)} disabled={disabled} onChange={paint.setKind}
    className="w-full [&_button]:min-w-0 [&_button]:px-1 [&_button]:text-[11px]" />
}

// Detailed fill editor for Propiedades: none / solid / gradient / photo.
export function FillPicker({ item, disabled, tools, onPatch, onError }) {
  const kind = fillKind(item), paint = tools.paint
  return (
    <div className="space-y-3">
      <KindTabs item={item} disabled={disabled} paint={paint} />
      {kind === 'none' ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.shape?.strokeWidth ? 'La forma solo muestra su borde.' : 'Sin relleno ni borde la forma queda invisible. Añade un borde abajo.'}</p> : null}
      {kind === 'solid' ? <StudioColorPicker value={item.fill} disabled={disabled} onChange={fill => onPatch({ fill })} /> : null}
      {kind === 'gradient' ? (
        <GradientEditor key={item.id} paint={item.fillPaint} disabled={disabled} api={paint.shape} onError={onError}>
          <Button variant="ghost" size="sm" className="w-full gap-1.5" disabled={disabled} onClick={() => paint.toPage(item.fillPaint)}><RectangleHorizontal className="h-3.5 w-3.5" />Usar como fondo de la página</Button>
        </GradientEditor>
      ) : null}
      {kind === 'image' ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" disabled={disabled} onClick={tools.replace}><ImagePlus />Reemplazar foto</Button>
          <Button variant="outline" size="sm" disabled={disabled} onClick={tools.removePhotoFill}><PaintBucket />Quitar foto</Button>
        </div>
      ) : null}
    </div>
  )
}

// Quick fill switch in the canvas bar; detailed gradient options live in Propiedades.
export function FillPopover({ item, disabled, tools, onPatch, onProperties }) {
  const kind = fillKind(item), paint = tools.paint
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolButton label="Relleno" side="bottom" disabled={disabled}><FillSwatch item={item} /></ToolButton>
      </PopoverTrigger>
      <PopoverContent align="center" className="max-h-[min(70dvh,560px)] w-72 space-y-3 overflow-y-auto p-3">
        <KindTabs item={item} disabled={disabled} paint={paint} />
        {kind === 'solid' ? <StudioColorPicker value={item.fill} disabled={disabled} onChange={fill => onPatch({ fill })} /> : null}
        {kind === 'gradient' ? (
          <>
            <GradientPresets paint={item.fillPaint} disabled={disabled} onPick={preset => paint.toSelection(preset)} />
            <Button variant="outline" size="sm" className="w-full" disabled={disabled} onClick={() => paint.shape.reverse().catch(() => {})}>Invertir colores</Button>
          </>
        ) : null}
        {kind === 'none' ? <p className="text-xs text-[hsl(var(--muted-foreground))]">La forma no tiene relleno.</p> : null}
        {kind === 'image' ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Encuadre, filtros y ajustes están en la barra de la foto.</p> : null}
        {onProperties && kind === 'gradient' ? <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={onProperties}><PanelRight className="h-3.5 w-3.5" />Editar puntos, ángulo y opacidad</Button> : null}
        {!onProperties && kind === 'gradient' ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Edita puntos, ángulo y opacidad en Propiedades.</p> : null}
      </PopoverContent>
    </Popover>
  )
}
