import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckboxField, ComboboxField } from '@runly/ui'
import { Link2 } from 'lucide-react'
import { useInventoryItem, useInventoryItems } from '../hooks/useInventoryItems.js'
import { itemLabel } from '../lib/item-label.js'

// RunlyForm "custom" field of the item form: "Es componente de otro activo".
// The checkbox reveals a remote-search picker of the main item (a component
// cannot itself be a main item; the API enforces the one-level rule too).
// The id is saved as parent_item_id together with the item.
export function InventoryParentLinkField({ value, onChange, error, initialData }) {
  const itemId = initialData?.id ?? null
  const [enabled, setEnabled] = useState(Boolean(value))
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const known = useRef(new Map())

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  if (initialData?.parentItem?.id) known.current.set(initialData.parentItem.id, initialData.parentItem)
  const query = useInventoryItems({ search: debounced || undefined, pageSize: 20, adminStatus: 'all' }, { enabled })
  // A prefilled id ("Agregar componente" from a detail) has no label yet.
  const prefilled = useInventoryItem(value && !known.current.has(value) ? value : null)
  const prefilledItem = prefilled.data?.data ?? prefilled.data
  if (prefilledItem?.id) known.current.set(prefilledItem.id, prefilledItem)
  const rows = useMemo(() => (query.data?.data ?? []).filter((row) => row.id !== itemId && !row.parentItemId), [query.data?.data, itemId])
  rows.forEach((row) => known.current.set(row.id, row))

  const options = useMemo(() => {
    const list = rows.map((row) => ({ value: row.id, label: itemLabel(row), description: [row.folio, row.serialNumber].filter(Boolean).join(' · ') || undefined }))
    const current = value && known.current.get(value)
    if (current && !list.some((option) => option.value === value)) list.unshift({ value, label: itemLabel(current) })
    return list
  }, [rows, value])

  return (
    <div className="col-span-full space-y-3">
      <CheckboxField
        label="Es componente de otro activo"
        hint="Para piezas con su propio registro que forman parte de un equipo principal (p. ej. condensadora y evaporadora de un aire acondicionado)."
        checked={enabled}
        onChange={(event) => { setEnabled(event.target.checked); if (!event.target.checked) onChange('') }}
      />
      {enabled ? (
        <ComboboxField
          label="Activo principal"
          icon={Link2}
          error={error}
          value={value ?? ''}
          options={options}
          onValueChange={(next) => onChange(next || '')}
          onSearchChange={setSearch}
          filter={false}
          clearable
          loading={query.isFetching && !rows.length}
          placeholder="Buscar el activo principal..."
          searchPlaceholder="Nombre, folio, serie o número de activo"
          emptyText="Sin resultados"
        />
      ) : null}
    </div>
  )
}
