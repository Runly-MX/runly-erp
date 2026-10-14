import { useMemo, useState } from 'react'
import { Button, ComboboxField, EmptyState } from '@runly/ui'
import { Boxes, X } from 'lucide-react'
import { useItemSearch } from '../../hooks/useInventoryCustody.js'

const MAX_ITEMS = 200

// value: [{ id, name, assetTag, serialNumber }]. Search runs on the API
// (name, asset tag, serial); selected rows stay listed below the picker.
// excludeIds hides items already on the record; max caps value + excluded.
export function CustodyItemsPicker({ value, onChange, disabled, excludeIds = [], max = MAX_ITEMS }) {
  const [search, setSearch] = useState('')
  const query = useItemSearch(search)
  const selectedIds = useMemo(() => new Set([...excludeIds, ...value.map((row) => row.id)]), [value, excludeIds])
  const limit = Math.max(0, max - excludeIds.length)

  const options = useMemo(() => (query.data ?? [])
    .filter((item) => !selectedIds.has(item.id))
    .map((item) => ({
      value: item.id,
      label: item.name ?? item.assetTag ?? item.id,
      description: [item.assetTag, item.serialNumber && `S/N ${item.serialNumber}`, item.assignedToName && `Asignado a ${item.assignedToName}`].filter(Boolean).join(' · ') || undefined,
      keywords: [item.assetTag, item.serialNumber].filter(Boolean),
      item,
    })), [query.data, selectedIds])

  function add(id) {
    const option = options.find((o) => o.value === id)
    if (!option || value.length >= limit) return
    const { item } = option
    onChange([...value, { id: item.id, name: item.name, assetTag: item.assetTag, serialNumber: item.serialNumber }])
  }

  return (
    <div className="space-y-2">
      <ComboboxField
        label="Artículos"
        required
        options={options}
        value=""
        onChange={add}
        onSearchChange={setSearch}
        filter={false}
        loading={query.isFetching}
        disabled={disabled || value.length >= limit}
        placeholder="Agregar artículo..."
        searchPlaceholder="Buscar por nombre, etiqueta o serie..."
        emptyText="Sin artículos que coincidan"
        hint={`${value.length + excludeIds.length} de ${max} artículos como máximo`}
      />
      {value.length === 0 ? (
        <EmptyState icon={Boxes} title="Sin artículos" description="Busca y agrega los artículos que forman parte del resguardo." />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]">
          {value.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{row.assetTag ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate">{row.name ?? '—'}</span>
              {row.serialNumber ? <span className="hidden shrink-0 text-xs text-[hsl(var(--muted-foreground))] sm:inline">S/N {row.serialNumber}</span> : null}
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={disabled}
                aria-label={`Quitar ${row.name ?? 'artículo'}`} onClick={() => onChange(value.filter((r) => r.id !== row.id))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
