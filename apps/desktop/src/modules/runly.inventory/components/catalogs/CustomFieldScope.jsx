import { ComboboxField, SelectField } from '@runly/ui'
import { typeOptions } from '../InventoryCatalogPickers.jsx'

// Where a field shows up: only on the assets it is added to (default), on every type, or on the chosen types.
const SCOPES = [
  { value: 'onDemand', label: 'Solo en los activos seleccionados' },
  { value: 'all', label: 'En todos los tipos' },
  { value: 'types', label: 'En los tipos que elijas' },
]
const SCOPE_HINTS = {
  onDemand: 'No se pide automáticamente. Agrégalo a cada activo desde su formulario o en grupo con el botón Activos.',
  all: 'Se pide al registrar cualquier activo.',
  types: 'Se pide al registrar activos de los tipos elegidos.',
}

export const scopeOf = (row) => (row.onDemand ? 'onDemand' : row.categoryIds?.length ? 'types' : 'all')

// Short "Dónde aparece" text for a field row: "A demanda", "Todos los tipos" or its type names.
export function scopeLabelOf(row, typeById) {
  if (row.onDemand) return 'A demanda'
  const names = (row.categoryIds ?? []).map((id) => typeById.get(id)?.name).filter(Boolean)
  return names.length ? names.join(', ') : 'Todos los tipos'
}

// { scope, categoryIds } -> API payload fields.
export const scopePayload = ({ scope, categoryIds }) => ({ onDemand: scope === 'onDemand', categoryIds: scope === 'types' ? categoryIds : [] })

export function CustomFieldScopeFields({ value, onChange, types, label = 'Dónde aparece' }) {
  return (
    <>
      <SelectField label={label} value={value.scope} onValueChange={(scope) => onChange({ ...value, scope })} hint={SCOPE_HINTS[value.scope]} options={SCOPES} />
      {value.scope === 'types' ? (
        <ComboboxField multiple clearable label="Tipos" required placeholder="Buscar tipos..." searchPlaceholder="Buscar tipo..."
          maxChips={Math.max(types.length, 1)} options={typeOptions(types)} value={value.categoryIds}
          onValueChange={(categoryIds) => onChange({ ...value, categoryIds: categoryIds ?? [] })}
          hint={value.categoryIds.length ? `${value.categoryIds.length} ${value.categoryIds.length === 1 ? 'tipo elegido' : 'tipos elegidos'}` : 'Elige uno o varios tipos.'} />
      ) : null}
    </>
  )
}
