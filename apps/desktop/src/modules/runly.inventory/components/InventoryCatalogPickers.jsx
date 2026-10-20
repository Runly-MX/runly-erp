import { ComboboxField, CreatableComboboxField } from '@runly/ui'
import { Layers, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryData } from '../hooks/inventoryData.js'
import { createdRow } from '../lib/inventory-data-context.js'

export { useBrandRows, useTypeRows } from '../hooks/useInventoryCatalogRows.js'

// Subtypes read "Laptop › Gamer" so the hierarchy is visible in a flat list.
export function typeOptions(types) {
  const byId = new Map(types.map((type) => [type.id, type]))
  return types.map((type) => ({
    value: type.id,
    label: type.parentId && byId.has(type.parentId) ? `${byId.get(type.parentId).name} › ${type.name}` : type.name,
  }))
}

// Shared by the type and brand pickers: a creatable combobox when the data source allows creating,
// a plain searchable one otherwise (supplier without the "crear modelos" capability).
function CatalogPicker({ canCreate, create, noun, article, options, ...props }) {
  async function handleCreate(name) {
    try {
      const row = createdRow(await create.mutateAsync({ name }))
      if (row?.id) props.onChange(row.id)
      toast.success(`${noun} «${name}» ${article}`)
    } catch (err) { toast.error(err?.message || `No se pudo crear ${noun === 'Tipo' ? 'el tipo' : 'la marca'}.`) }
  }
  if (!canCreate) return <ComboboxField {...props} options={options} placeholder="Buscar..." searchPlaceholder={props.searchPlaceholder} />
  return <CreatableComboboxField {...props} options={options} onCreate={handleCreate} isCreating={create.isPending} placeholder="Buscar o crear..." />
}

export function InventoryTypePicker({ value, onChange, error, required, areaId, label = 'Tipo', icon = Layers }) {
  const { useTypeRows, useCreateType, useCanCreate } = useInventoryData()
  const types = useTypeRows()
  return (
    <CatalogPicker canCreate={useCanCreate(areaId)} create={useCreateType()} noun="Tipo" article="creado"
      label={label} icon={icon} required={required} error={error} value={value ?? ''} onChange={onChange}
      options={typeOptions(types)} searchPlaceholder="Buscar tipo..." />
  )
}

export function InventoryBrandPicker({ value, onChange, error, required, areaId, label = 'Marca', icon = Tag }) {
  const { useBrandRows, useCreateBrand, useCanCreate } = useInventoryData()
  const brands = useBrandRows()
  return (
    <CatalogPicker canCreate={useCanCreate(areaId)} create={useCreateBrand()} noun="Marca" article="creada"
      label={label} icon={icon} required={required} error={error} value={value ?? ''} onChange={onChange}
      options={brands.map((brand) => ({ value: brand.id, label: brand.name }))} searchPlaceholder="Buscar marca..." />
  )
}
