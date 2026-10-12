import { ComboboxField, SelectField, TextareaField, TextField } from '@runly/ui'
import { toOptions } from '../shared.jsx'
import { DaysChipsField } from './DaysChipsField.jsx'
import { formatHoursShort, weeklyMinutes } from '../../lib/shiftSchedule.js'
import { ScheduleField } from './ScheduleField.jsx'
import { SiteLocationField } from './SiteLocationField.jsx'
import { StepperField } from './StepperField.jsx'
import { TimeSelectField } from './TimeSelectField.jsx'
import { TimezoneField } from './TimezoneField.jsx'

// Renders one catalog field (see lib/catalogConfig.js) with the friendliest control for its type.
// Props: { field, value, onChange(value), error, lookups, draft } - draft is the whole form (for suggestions).
export default function CatalogFieldRenderer({ field, value, onChange, error, lookups, draft }) {
  const common = { label: field.label, required: field.required, error }
  switch (field.type) {
    case 'textarea':
      return <TextareaField {...common} value={value} onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return <SelectField {...common} options={field.options} value={value} onValueChange={onChange} />
    case 'ref':
      return <ComboboxField {...common} options={toOptions(lookups.rows[field.ref])} value={value} onChange={onChange} clearable placeholder="Cualquiera" />
    case 'days':
      return <DaysChipsField label={field.label} value={value} onChange={onChange} error={error} hint="Elige los días o usa un atajo." />
    case 'schedule':
      return <ScheduleField label={field.label} value={value} onChange={onChange} error={error} weeklySummary={`Horas por semana: ${formatHoursShort(weeklyMinutes(value, draft?.breakMinutes))} (esperadas)`} />
    case 'timezone':
      return <TimezoneField {...common} value={value} onChange={onChange} />
    case 'location':
      return <SiteLocationField label={field.label} value={value} onChange={onChange} />
    case 'time':
      return <TimeSelectField {...common} value={value} onChange={onChange} />
    case 'number':
      if (field.options) {
        return <SelectField {...common} options={field.options} value={value === '' || value == null ? '' : String(value)} onValueChange={(v) => onChange(Number(v))} />
      }
      if (field.stepper) return <StepperField {...common} value={value} onChange={onChange} min={field.min} max={field.max} />
      return <TextField {...common} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} inputMode="decimal" />
    default: {
      const suggestion = field.autoName ? field.autoName(draft ?? {}, lookups) : ''
      return (
        <TextField
          {...common} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={suggestion ? `Sugerido: ${suggestion}` : field.placeholder}
          hint={field.autoName ? 'Si lo dejas vacío se usa el nombre sugerido.' : undefined}
        />
      )
    }
  }
}
