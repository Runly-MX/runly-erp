import { Minus, Plus } from 'lucide-react'
import { Button } from '@runly/ui'
import { FieldShell } from './FieldShell.jsx'

// [- n +] counter for small whole numbers; no typing needed.
export function StepperField({ label, value, onChange, min = 0, max = 9999, error, required, hint }) {
  const n = Number.isFinite(Number(value)) && value !== '' ? Number(value) : min
  const set = (next) => onChange(Math.min(max, Math.max(min, next)))
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <div className="inline-flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Disminuir" disabled={n <= min} onClick={() => set(n - 1)}><Minus className="h-4 w-4" /></Button>
        <span className="min-w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">{n}</span>
        <Button type="button" variant="outline" size="icon" aria-label="Aumentar" disabled={n >= max} onClick={() => set(n + 1)}><Plus className="h-4 w-4" /></Button>
      </div>
    </FieldShell>
  )
}
