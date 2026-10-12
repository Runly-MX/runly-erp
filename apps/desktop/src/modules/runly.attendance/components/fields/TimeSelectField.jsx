import { useMemo } from 'react'
import { ComboboxField } from '@runly/ui'
import { buildTimeOptions } from '../../lib/formHelpers.js'

// "HH:MM" picked from a 15-minute dropdown in 24-hour format (00:00 - 23:45), in order.
export function TimeSelectField({ label, value, onChange, error, required, step = 15, hint }) {
  const options = useMemo(() => buildTimeOptions(step, value), [step, value])
  return (
    <ComboboxField
      label={label} required={required} error={error} hint={hint} options={options} value={value || null}
      onChange={(next) => onChange(next ?? '')} placeholder="Elige la hora" searchPlaceholder="Buscar hora…"
    />
  )
}
