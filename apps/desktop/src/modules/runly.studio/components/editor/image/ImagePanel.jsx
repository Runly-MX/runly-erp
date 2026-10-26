import { useState } from 'react'
import { Button, EmptyState, NumberStepper, SegmentedControl, SliderRow, cn } from '@runly/ui'
import { ChevronDown, ImageIcon, RotateCcw } from 'lucide-react'
import { imageProperties } from '../../../../../../../shared/studio/image-properties.js'
import { FILTER_PRESETS, activeFilter, adjustmentsCss } from '../../../lib/frame-shapes.js'
import { ColorPopover } from '../StudioColorPicker.jsx'

const TABS = [{ value: 'filters', label: 'Filtros' }, { value: 'adjust', label: 'Ajustes' }, { value: 'effects', label: 'Efectos' }]
const SHADOWS = [
  { value: 'none', label: 'Ninguna', shadow: { blur: 0, offsetX: 0, offsetY: 0, color: '#000000' } },
  { value: 'soft', label: 'Suave', shadow: { blur: 32, offsetX: 0, offsetY: 14, color: '#64748b' } },
  { value: 'strong', label: 'Marcada', shadow: { blur: 18, offsetX: 0, offsetY: 18, color: '#0f172a' } },
]
const percent = value => `${value > 0 ? '+' : ''}${value}`

function Heading({ children, action }) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{children}</p>
      {action}
    </div>
  )
}

function Filters({ props, imageUrl, disabled, onApply }) {
  const current = activeFilter(props.adjustments)
  return (
    <div className="grid grid-cols-3 gap-2">
      {FILTER_PRESETS.map(preset => {
        const active = preset.key === current
        return (
          <button key={preset.key} type="button" disabled={disabled} aria-pressed={active} onClick={() => onApply(preset.adjustments)}
            className={cn('group flex flex-col gap-1 rounded-xl p-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50',
              active ? 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]')}>
            <span className={cn('aspect-square w-full overflow-hidden rounded-lg bg-[hsl(var(--muted))]', active && 'ring-2 ring-fuchsia-500 ring-offset-1 ring-offset-[hsl(var(--card))]')}>
              {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none" style={{ filter: adjustmentsCss(preset.adjustments) }} />
                : <span className="block h-full w-full bg-gradient-to-br from-fuchsia-400 via-violet-500 to-sky-400" style={{ filter: adjustmentsCss(preset.adjustments) }} />}
            </span>
            <span className="truncate text-center">{preset.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Adjustments({ props, disabled, api }) {
  const [more, setMore] = useState(props.adjustments.blur > 0)
  const a = props.adjustments
  const slider = (key, label, extra = {}) => (
    <SliderRow key={key} label={label} min={extra.min ?? -100} max={100} zero={0} value={Math.round(a[key] * 100)} format={extra.format ?? percent} disabled={disabled}
      onStart={api.begin} onCommit={api.end} onChange={value => api.adjust({ [key]: value / 100 })} />
  )
  const touched = a.brightness || a.contrast || a.saturation || a.blur || a.grayscale || a.sepia
  return (
    <div className="space-y-1">
      <Heading action={<Button variant="ghost" size="sm" disabled={disabled || !touched} onClick={api.resetAdjustments} className="h-8 gap-1.5 px-2 text-xs"><RotateCcw className="h-3.5 w-3.5" />Restablecer</Button>}>Luz y color</Heading>
      {slider('brightness', 'Brillo')}
      {slider('contrast', 'Contraste')}
      {slider('saturation', 'Saturación')}
      <button type="button" onClick={() => setMore(value => !value)} aria-expanded={more}
        className="flex min-h-10 w-full items-center justify-between rounded-md text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
        Más ajustes<ChevronDown className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', more && 'rotate-180')} />
      </button>
      {more ? slider('blur', 'Desenfoque', { min: 0, format: value => `${value}` }) : null}
    </div>
  )
}

function Effects({ selection, props, disabled, api }) {
  const shadow = SHADOWS.find(option => option.shadow.blur === props.shadow.blur)?.value ?? 'soft'
  return (
    <div className="space-y-5">
      <SliderRow label="Opacidad" min={0} max={100} zero={100} value={Math.round((selection.opacity ?? 1) * 100)} format={value => `${value} %`} disabled={disabled}
        onStart={api.begin} onCommit={api.end} onChange={value => api.patch({ opacity: value / 100 })} />
      {props.mask === 'rounded' ? (
        <SliderRow label="Esquinas" min={0} max={400} zero={24} value={Math.round(props.radius)} format={value => `${value} px`} disabled={disabled}
          onStart={api.begin} onCommit={api.end} onChange={value => api.image({ radius: value })} />
      ) : null}
      <div className="space-y-2">
        <Heading>Borde</Heading>
        <div className="flex items-center gap-2">
          <NumberStepper label="Grosor del borde" size="sm" min={0} max={64} step={2} value={Math.round(props.border.width)} disabled={disabled}
            onChange={width => api.image({ border: { ...props.border, width } })} />
          <ColorPopover label="Color del borde" value={props.border.color} disabled={disabled || !props.border.width} onChange={color => api.image({ border: { ...props.border, color } })} />
        </div>
      </div>
      <div className="space-y-2">
        <Heading>Sombra</Heading>
        <SegmentedControl ariaLabel="Sombra" options={SHADOWS} value={shadow} disabled={disabled}
          onChange={value => api.image({ shadow: SHADOWS.find(option => option.value === value).shadow })} />
      </div>
    </div>
  )
}

// Contextual photo panel (left side panel on desktop, sheet on phones).
export function ImagePanel({ selection, imageUrl, tab, onTab, disabled, api }) {
  if (selection?.type !== 'image') {
    return <EmptyState variant="compact" icon={ImageIcon} title="Selecciona una imagen del diseño para ajustarla." />
  }
  const props = imageProperties(selection.image ?? {})
  return (
    <div className="space-y-4">
      <SegmentedControl ariaLabel="Herramientas de imagen" options={TABS} value={tab} onChange={onTab} />
      {tab === 'filters' ? <Filters props={props} imageUrl={imageUrl} disabled={disabled} onApply={api.filter} /> : null}
      {tab === 'adjust' ? <Adjustments key={selection.id} props={props} disabled={disabled} api={api} /> : null}
      {tab === 'effects' ? <Effects selection={selection} props={props} disabled={disabled} api={api} /> : null}
    </div>
  )
}
