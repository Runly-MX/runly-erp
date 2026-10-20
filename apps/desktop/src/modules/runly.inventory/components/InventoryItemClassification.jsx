import { useMemo, useState } from 'react'
import { ComboboxField, CreatableComboboxField } from '@runly/ui'
import { Boxes } from 'lucide-react'
import { modelLabel } from '../hooks/useInventoryModels.js'
import { useInventoryData } from '../hooks/inventoryData.js'
import { InventoryBrandPicker, InventoryTypePicker } from './InventoryCatalogPickers.jsx'
import { InventoryModelDialog } from './InventoryModelDialog.jsx'
import { InventoryPurchaseLinkField } from './InventoryPurchaseLinkField.jsx'
import { InventoryAreaField } from './areas/InventoryAreaField.jsx'

const LEGACY = '__legacy__'
const NONE = '__none__'

// Searchable model selector; "Crear modelo «X»" is offered only when the data source allows creating.
function ModelCombobox({ canCreate, onCreate, ...props }) {
  const common = { ...props, placeholder: canCreate ? 'Buscar o crear...' : 'Buscar modelo...', searchPlaceholder: 'Ej. Dell XPS 2023' }
  return canCreate ? <CreatableComboboxField {...common} onCreate={onCreate} /> : <ComboboxField {...common} />
}

// RunlyForm "component" section: model, type (categoryId) and brand. Picking a
// catalog model fills Tipo and Marca; "+ Crear «X»" opens the model dialog,
// which can itself create types and brands.
// Data comes from the injected inventory adapter (lib/inventory-data-context.js); the default is the
// company user's own. `hideArea` is for hosts that pick the folder elsewhere (supplier portal).
export function InventoryItemClassification({ value, onChange, errors = {}, disabled, renderPin, hideArea = false }) {
  const { useModelRows, useCanCreate } = useInventoryData()
  const models = useModelRows()
  const canCreate = useCanCreate(value.areaId)
  const [dialog, setDialog] = useState(null)

  const selected = value.modelId || (value.model ? LEGACY : '')
  const options = useMemo(() => {
    const rows = models.map((row) => ({ value: row.id, label: modelLabel(row), keywords: row.description ?? '' }))
    if (!value.modelId && value.model) rows.unshift({ value: LEGACY, label: `${value.model} (sin catálogo)` })
    if (value.modelId || value.model) rows.unshift({ value: NONE, label: 'Sin modelo' })
    return rows
  }, [models, value.modelId, value.model])

  function applyModel(row) {
    onChange({ modelId: row.id, model: row.name, categoryId: row.typeId, brandId: row.brandId })
  }

  function handleSelect(id) {
    if (id === NONE) return onChange({ modelId: null, model: '' })
    const row = models.find((model) => model.id === id)
    if (row) applyModel(row)
  }

  return (
    <fieldset disabled={disabled} className="grid gap-4 lg:grid-cols-2">
      <div className="relative col-span-full">
        {renderPin?.(['modelId', 'model'], 'Modelo')}
        <ModelCombobox
          canCreate={canCreate}
          label="Modelo"
          icon={Boxes}
          value={selected}
          options={options}
          error={errors.modelId || errors.model}
          hint="Busca por nombre, marca, tipo o año. Al elegir un modelo se completan tipo y marca."
          onChange={handleSelect}
          onCreate={(name) => setDialog({ name, typeId: value.categoryId ?? '', brandId: value.brandId ?? '' })}
        />
      </div>
      <div className="relative">
        {renderPin?.(['categoryId'], 'Tipo')}
        <InventoryTypePicker areaId={value.areaId} value={value.categoryId} onChange={(categoryId) => onChange({ categoryId })} error={errors.categoryId} />
      </div>
      <div className="relative">
        {renderPin?.(['brandId'], 'Marca')}
        <InventoryBrandPicker areaId={value.areaId} value={value.brandId} onChange={(brandId) => onChange({ brandId })} error={errors.brandId} />
      </div>
      {hideArea ? null : (
        <div className="col-span-full">
          <InventoryAreaField value={value.areaId} onChange={(areaId) => onChange({ areaId })} error={errors.areaId} isEdit={Boolean(value.id)} />
        </div>
      )}
      <InventoryModelDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => { if (!open) setDialog(null) }}
        initialValues={dialog ?? undefined}
        onSaved={applyModel}
        areaId={value.areaId}
      />
    </fieldset>
  )
}

export const inventoryFormComponents = {
  resolve: (key) => {
    if (key === 'inventory.item-classification') return InventoryItemClassification
    if (key === 'inventory.purchase-link') return InventoryPurchaseLinkField
    return null
  },
}
