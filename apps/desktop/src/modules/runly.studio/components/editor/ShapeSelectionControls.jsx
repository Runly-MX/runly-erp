import { NumberStepper, Popover, PopoverContent, PopoverTrigger, SegmentedControl, SliderRow, Switch, ToolButton } from '@runly/ui'
import { ImagePlus, SquareDashed } from 'lucide-react'
import { shapeStyle } from '../../../../../../shared/studio/shape-properties.js'
import { canHoldPhoto } from '../../lib/photo-target.js'
import { LINE_DASHES } from '../../lib/element-library.js'
import { ColorPopover } from './StudioColorPicker.jsx'
import { ImageSelectionControls } from './image/ImageSelectionControls.jsx'

// Fill on/off, border (color, width, dash) and corner radius of a shape (v5
// `shape`). Shared by the selection bar popover and the Propiedades panel.
// Radius exists only for rectangles; dash and color need a visible border.
export function ShapeStyleFields({ selection, disabled, tools }) {
  const style = shapeStyle(selection.shape ?? {}), border = style.strokeWidth > 0
  const photo = Boolean(selection.fillPaint?.type === 'image')
  return (
    <div className="space-y-4">
      <label className="flex min-h-10 items-center justify-between gap-3 text-sm">
        <span>{photo ? 'Mostrar la foto' : 'Relleno'}</span>
        <Switch checked={style.fillEnabled} disabled={disabled} aria-label={photo ? 'Mostrar la foto' : 'Relleno'} onCheckedChange={fillEnabled => tools.shapeStyle({ fillEnabled })} />
      </label>
      {!style.fillEnabled && !border ? <p className="-mt-2 text-xs text-[hsl(var(--muted-foreground))]">Sin relleno ni borde la forma queda invisible.</p> : null}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Borde</p>
        <div className="flex items-center gap-2">
          <NumberStepper label="Grosor del borde" size="sm" min={0} max={128} step={1} value={Math.round(style.strokeWidth)} disabled={disabled}
            onChange={strokeWidth => tools.shapeStyle({ strokeWidth })} />
          <ColorPopover label="Color del borde" value={style.strokeColor} disabled={disabled || !border} onChange={strokeColor => tools.shapeStyle({ strokeColor })} />
        </div>
        <SegmentedControl ariaLabel="Tipo de borde" value={style.dash} disabled={disabled || !border} onChange={dash => tools.shapeStyle({ dash })}
          options={LINE_DASHES} className="w-full [&_button]:min-w-0 [&_button]:px-1.5 [&_button]:text-xs" />
      </div>
      {selection.type === 'rectangle' ? (
        <SliderRow label="Radio de esquinas" min={0} max={Math.max(1, Math.round(Math.min(selection.width, selection.height) / 2))} zero={0} value={Math.round(style.radius)}
          format={value => `${value} px`} disabled={disabled} onStart={tools.begin} onCommit={tools.end} onChange={radius => tools.shapeStyle({ radius })} />
      ) : null}
    </div>
  )
}

// Selection bar for rectangles, ellipses and vectors. A shape with a photo
// fill gets the photo tools (no frame masks or frame borders: the shape's own
// geometry and border apply); otherwise its color plus "put a photo inside".
export function ShapeSelectionControls({ selection, disabled, onPatch, tools }) {
  const photo = tools?.photo?.shape
  const style = shapeStyle(selection.shape ?? {})
  return (
    <div role="group" aria-label="Formato de la forma" className="flex flex-wrap items-center justify-center gap-0.5 max-sm:flex-nowrap max-sm:[&>*]:shrink-0">
      {photo ? <ImageSelectionControls selection={selection} disabled={disabled} tools={tools} />
        : <ColorPopover label="Color de relleno" value={selection.fill} disabled={disabled || !style.fillEnabled} onChange={fill => onPatch({ fill })} />}
      {!photo && tools && canHoldPhoto(selection) ? (
        <ToolButton label="Poner una foto dentro" side="bottom" disabled={disabled} onClick={tools.fillShape}><ImagePlus /></ToolButton>
      ) : null}
      {tools ? (
        <Popover>
          <PopoverTrigger asChild>
            <ToolButton label="Relleno, borde y esquinas" side="bottom" disabled={disabled} active={style.strokeWidth > 0 || style.radius > 0 || !style.fillEnabled}><SquareDashed /></ToolButton>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-72 p-3">
            <ShapeStyleFields selection={selection} disabled={disabled} tools={tools} />
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}
