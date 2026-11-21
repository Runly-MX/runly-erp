import { DateField, SelectField } from '@runly/ui'
import { keyParts, wallToInstant } from '../lib/bookingsTime.js'

export const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const value = `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`
  return { value, label: value }
})

// { date: 'YYYY-MM-DD', time: 'HH:MM' } in the space zone -> ISO instant (or null).
export function wallValueToIso(value, timeZone) {
  if (!value?.date || !value?.time) return null
  const [hour, minute] = value.time.split(':').map(Number)
  return wallToInstant({ ...keyParts(value.date), hour, minute }, timeZone).toISOString()
}

// Date + time picked in the booking space's own zone (shown next to the label).
export function WallTimeFields({ label, value, onChange, timeZone, error, disabled }) {
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3">
        <DateField label={label} value={value?.date ?? ''} onChange={(e) => onChange({ ...value, date: e.target.value })} error={error} disabled={disabled} />
        <SelectField label="Hora" icon={null} options={TIME_OPTIONS} value={value?.time ?? ''} onValueChange={(time) => onChange({ ...value, time })} disabled={disabled} />
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Hora de {timeZone.replaceAll('_', ' ')}</p>
    </div>
  )
}
