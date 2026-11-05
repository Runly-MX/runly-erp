import { CheckboxField, SelectField } from '@runly/ui'

// Where a field shows up: only on the assets it is added to (default), on every type, or on the chosen types.
const SCOPES = [
  { value: 'onDemand', label: 'Solo en los activos seleccionados' },
  { value: 'all', label: 'En todos los tipos' },
  { value: 'types', label: 'En los tipos que elijas' },
]
const SCOPE_HINTS = {
  onDemand: 'No se pide automáticamente. Agrégalo a cada activo desde su formulario o en grupo con el botón Activos.',
  all: 'Se pide al registrar cualquier activo.',
  types: 'Se pide al registrar activos de los tipos marcados.',
}

export const scopeOf = (row) => (row.onDemand ? 'onDemand' : row.categoryIds?.length ? 'types' : 'all')

// { scope, categoryIds } -> API payload fields.
export const scopePayload = ({ scope, categoryIds }) => ({ onDemand: scope === 'onDemand', categoryIds: scope === 'types' ? categoryIds : [] })

export function CustomFieldScopeFields({ value, onChange, types, label = 'Dónde aparece' }) {
  const toggle = (id, on) => onChange({ ...value, categoryIds: on ? [...new Set([...value.categoryIds, id])] : value.categoryIds.filter((v) => v !== id) })
  return (
    <>
      <SelectField label={label} value={value.scope} onValueChange={(scope) => onChange({ ...value, scope })} hint={SCOPE_HINTS[value.scope]} options={SCOPES} />
      {value.scope === 'types' ? (
        <fieldset className="space-y-1 rounded-md border border-[hsl(var(--border))] p-3">
          <legend className="px-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">Tipos ({value.categoryIds.length})</legend>
          {types.map((type) => (
            <CheckboxField key={type.id} label={type.name} checked={value.categoryIds.includes(type.id)} onChange={(e) => toggle(type.id, e.target.checked)} />
          ))}
        </fieldset>
      ) : null}
    </>
  )
}
