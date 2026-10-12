import { useMemo } from 'react'
import { ComboboxField } from '@runly/ui'
import { buildTimezoneOptions } from '../../lib/formHelpers.js'

// Searchable IANA time zone picker with Spanish city labels and the UTC offset.
export function TimezoneField({ label = 'Zona horaria', value, onChange, error, required }) {
  const options = useMemo(() => buildTimezoneOptions({ current: value || undefined }), [value])
  return (
    <ComboboxField
      label={label} required={required} error={error} options={options} value={value || null}
      onChange={(next) => onChange(next ?? '')} placeholder="Buscar ciudad o país…"
    />
  )
}
