import { NumberStepper, Popover, PopoverContent, PopoverTrigger, SegmentedControl, SliderRow, ToolButton } from '@runly/ui'
import { SquareDashed } from 'lucide-react'
import { shapeStyle } from '../../../../../../shared/studio/shape-properties.js'
import { LINE_DASHES } from '../../lib/element-library.js'
import { ColorPopover } from './StudioColorPicker.jsx'
import { ImageSelectionControls } from './image/ImageSelectionControls.jsx'
import { FillPopover } from './paint/FillControls.jsx'

// Border (color, width, dash) and corner radius of a shape (v5 `shape`).
// Shared by the selection bar popover and Propiedades. Radius exists only for
// rectangles; dash and color need a visible border. Fill lives in FillPicker.
export function ShapeStyleFields({ selection, disabled, tools }) {
  const style = shapeStyle(selection.shape ?? {}), border = style.strokeWidth > 0
  return (
    <div className="space-y-4">
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

// Selection bar for rectangles, ellipses and vectors: fill (none / color /
// gradient / photo), the photo tools when the fill is a photo (no frame masks
// or frame borders: the shape's own geometry and border apply), then border.
export function ShapeSelectionControls({ selection, disabled, onPatch, tools, onProperties }) {
  const photo = tools?.photo?.shape
  const style = shapeStyle(selection.shape ?? {})
  if (!tools) return <ColorPopover label="Color de relleno" value={selection.fill} disabled={disabled} onChange={fill => onPatch({ fill })} />
  return (
    <div role="group" aria-label="Formato de la forma" className="flex flex-wrap items-center justify-center gap-0.5 max-sm:flex-nowrap max-sm:[&>*]:shrink-0">
      <FillPopover item={selection} disabled={disabled} tools={tools} onPatch={onPatch} onProperties={onProperties} />
      {photo ? <ImageSelectionControls selection={selection} disabled={disabled} tools={tools} /> : null}
      <Popover>
        <PopoverTrigger asChild>
          <ToolButton label="Borde y esquinas" side="bottom" disabled={disabled} active={style.strokeWidth > 0 || style.radius > 0}><SquareDashed /></ToolButton>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-3">
          <ShapeStyleFields selection={selection} disabled={disabled} tools={tools} />
        </PopoverContent>
      </Popover>
    </div>
  )
}
