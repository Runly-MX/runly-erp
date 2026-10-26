import { useContext, useState } from 'react'
import { Input, Popover, PopoverContent, PopoverTrigger, ToolButton, cn } from '@runly/ui'
import { Check, Pipette } from 'lucide-react'
import { EyedropperContext, nativeEyedropper, rememberColor, useEyedropper, useRecentColors } from '../../lib/studio-colors.js'

export const STUDIO_SWATCHES = [
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#0f0a1f',
  '#d946ef', '#a855f7', '#7c3aed', '#4f46e5', '#2563eb', '#0ea5e9',
  '#14b8a6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#ec4899',
]
const HEX = /^#[0-9a-f]{6}$/i
const LIGHT = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 186 }

function Swatches({ label, colors, value, disabled, onPick, columns = 6 }) {
  if (!colors.length) return null
  return (
    <div className="space-y-1.5">
      {label ? <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">{label}</p> : null}
      <div role="radiogroup" aria-label={label ?? 'Colores'} className={cn('grid gap-2', columns === 6 ? 'grid-cols-6' : 'grid-cols-8')}>
        {colors.map(hex => {
          const active = value?.toLowerCase() === hex
          return (
            <button key={hex} type="button" role="radio" aria-checked={active} aria-label={hex} title={hex.toUpperCase()} disabled={disabled} onClick={() => onPick(hex)}
              className={cn('flex aspect-square w-full items-center justify-center rounded-md border border-black/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:opacity-50 dark:border-white/15 motion-reduce:transition-none',
                active && 'ring-2 ring-[hsl(var(--foreground))] ring-offset-2 ring-offset-[hsl(var(--card))]')}
              style={{ backgroundColor: hex }}>
              {active ? <Check className={cn('h-4 w-4 drop-shadow', LIGHT(hex) ? 'text-slate-900' : 'text-white')} strokeWidth={3} /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Swatches + recents + colors already in the design + eyedropper + hex field.
// The document only stores #rrggbb. `onBeforePick` lets a popover close so the
// user can tap the canvas when the native EyeDropper is unavailable.
export function StudioColorPicker({ value, onChange, disabled = false, onBeforePick }) {
  const [text, setText] = useState(value ?? '')
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) { setLastValue(value); setText(value ?? '') }
  const recent = useRecentColors(), { documentColors = [] } = useContext(EyedropperContext), dropper = useEyedropper()
  const apply = hex => { rememberColor(hex); if (hex !== value?.toLowerCase()) onChange(hex) }
  const commit = () => {
    const next = (text.startsWith('#') ? text : `#${text}`).toLowerCase()
    if (HEX.test(next)) apply(next); else setText(value ?? '')
  }
  async function eyedrop() {
    if (!nativeEyedropper()) onBeforePick?.()
    const hex = await dropper.pick()
    if (hex) onChange(hex)
  }
  const inDesign = documentColors.filter(hex => !recent.includes(hex)).slice(0, 12)
  return (
    <div className="space-y-3">
      <Swatches colors={STUDIO_SWATCHES} value={value} disabled={disabled} onPick={apply} />
      <Swatches label="Recientes" colors={recent} value={value} disabled={disabled} onPick={apply} />
      <Swatches label="En este diseño" colors={inDesign} value={value} disabled={disabled} onPick={apply} />
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-[hsl(var(--border))]" style={{ backgroundColor: HEX.test(text) ? text : value }} />
        <Input aria-label="Color hexadecimal" value={text} maxLength={7} disabled={disabled} className="min-w-0 font-mono uppercase"
          onChange={event => setText(event.target.value.trim())} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
        {dropper.available ? (
          <ToolButton label={nativeEyedropper() ? 'Cuentagotas: toma un color de la pantalla' : 'Cuentagotas: toca el diseño'} shortcut="I" side="bottom" disabled={disabled}
            onClick={eyedrop} className="h-9 w-9 shrink-0 border border-[hsl(var(--border))]"><Pipette /></ToolButton>
        ) : null}
      </div>
    </div>
  )
}

// Compact trigger (selection bar) that opens the picker in a popover.
export function ColorPopover({ value, onChange, disabled, label = 'Color' }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={`${label}: ${value}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 sm:h-9 sm:w-9">
          <span className="h-6 w-6 rounded-full border-2 border-[hsl(var(--card))] shadow-[0_0_0_1px_hsl(var(--border))]" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[min(80dvh,560px)] w-64 overflow-y-auto p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
        <StudioColorPicker value={value} onChange={onChange} disabled={disabled} onBeforePick={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
