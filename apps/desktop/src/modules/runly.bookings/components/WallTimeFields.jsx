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
    <div className="grid grid-cols-[1fr_8rem] items-end gap-2">
      <DateField label={`${label} (${timeZone})`} value={value?.date ?? ''} onChange={(e) => onChange({ ...value, date: e.target.value })} error={error} disabled={disabled} />
      <SelectField label="Hora" options={TIME_OPTIONS} value={value?.time ?? ''} onValueChange={(time) => onChange({ ...value, time })} disabled={disabled} />
    </div>
  )
}
