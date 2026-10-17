import { NumberField, TextField } from '@runly/ui'
import { VALUE_MAX } from '../lib/lmsIntake.js'

const INPUT = {
  email: { type: 'email', autoComplete: 'email', maxLength: 200 },
  phone: { type: 'tel', autoComplete: 'tel', maxLength: 25 },
  text: { type: 'text', maxLength: VALUE_MAX },
}
const AUTOCOMPLETE = { empresa: 'organization', puesto: 'organization-title' }

// Name + the course intake fields. values = { name, answers }; `skip` hides
// keys the guest does not fill (the invited email).
export function GuestIntakeFields({ fields = [], values, errors = {}, onChange, skip = [], disabled = false }) {
  const setName = (event) => onChange({ ...values, name: event.target.value })
  const setAnswer = (key) => (event) => onChange({ ...values, answers: { ...values.answers, [key]: event.target.value } })
  return (
    <>
      <TextField label="Tu nombre completo" required value={values.name} onChange={setName} error={errors.name} maxLength={80} autoComplete="name" disabled={disabled} />
      {fields.filter((field) => !skip.includes(field.key)).map((field) => {
        const label = field.required ? field.label : `${field.label} (opcional)`
        const common = { label, required: field.required, value: values.answers?.[field.key] ?? '', onChange: setAnswer(field.key), error: errors[field.key], disabled }
        if (field.type === 'number') return <NumberField key={field.key} {...common} min={0} max={999999999999999} />
        return <TextField key={field.key} {...common} {...(INPUT[field.type] ?? INPUT.text)} autoComplete={AUTOCOMPLETE[field.key] ?? INPUT[field.type]?.autoComplete ?? 'off'} />
      })}
    </>
  )
}
