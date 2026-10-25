import { useState } from 'react'
import { Input, Popover, PopoverContent, PopoverTrigger, cn } from '@runly/ui'
import { Check } from 'lucide-react'

export const STUDIO_SWATCHES = [
  '#ffffff', '#f1f5f9', '#94a3b8', '#475569', '#1e293b', '#0f0a1f',
  '#d946ef', '#a855f7', '#7c3aed', '#4f46e5', '#2563eb', '#0ea5e9',
  '#14b8a6', '#22c55e', '#facc15', '#f97316', '#ef4444', '#ec4899',
]
const HEX = /^#[0-9a-f]{6}$/i

// Swatch grid + hex field. The document only stores #rrggbb.
export function StudioColorPicker({ value, onChange, disabled = false }) {
  const [text, setText] = useState(value ?? '')
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) { setLastValue(value); setText(value ?? '') }
  const commit = () => {
    const next = text.startsWith('#') ? text : `#${text}`
    if (HEX.test(next)) { if (next.toLowerCase() !== value?.toLowerCase()) onChange(next.toLowerCase()) } else setText(value ?? '')
  }
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Colores" className="grid grid-cols-6 gap-2">
        {STUDIO_SWATCHES.map(hex => {
          const active = value?.toLowerCase() === hex
          return (
            <button key={hex} type="button" role="radio" aria-checked={active} aria-label={hex} disabled={disabled} onClick={() => onChange(hex)}
              className={cn('flex aspect-square w-full items-center justify-center rounded-md border border-black/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:opacity-50 dark:border-white/15 motion-reduce:transition-none',
                active && 'ring-2 ring-[hsl(var(--foreground))] ring-offset-2 ring-offset-[hsl(var(--card))]')}
              style={{ backgroundColor: hex }}>
              {active ? <Check className={cn('h-4 w-4 drop-shadow', ['#ffffff', '#f1f5f9', '#facc15'].includes(hex) ? 'text-slate-900' : 'text-white')} strokeWidth={3} /> : null}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-9 w-9 shrink-0 rounded-md border border-[hsl(var(--border))]" style={{ backgroundColor: HEX.test(text) ? text : value }} />
        <Input aria-label="Color hexadecimal" value={text} maxLength={7} disabled={disabled} className="font-mono uppercase"
          onChange={event => setText(event.target.value.trim())} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
      </div>
    </div>
  )
}

// Compact trigger (selection bar) that opens the picker in a popover.
export function ColorPopover({ value, onChange, disabled, label = 'Color' }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={`${label}: ${value}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 sm:h-9 sm:w-9">
          <span className="h-6 w-6 rounded-full border-2 border-[hsl(var(--card))] shadow-[0_0_0_1px_hsl(var(--border))]" style={{ backgroundColor: value }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
        <StudioColorPicker value={value} onChange={onChange} disabled={disabled} />
      </PopoverContent>
    </Popover>
  )
}
