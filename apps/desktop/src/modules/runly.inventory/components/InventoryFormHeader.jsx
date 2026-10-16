import { Eye, Plus, Trash2 } from 'lucide-react'
import { RecordHeader } from '@runly/ui'
import { useNavigate } from 'react-router-dom'
import { formHeaderModel } from '../lib/form-header.js'

export const INVENTORY_FORM_ID = 'inventory-item-form'

// Create/edit header: the shared RecordHeader with the save/cancel actions (the
// submit button targets the RunlyForm by id). Edit mode adds "Ver detalle" and
// the "Más acciones" menu.
export function InventoryFormHeader({ isEdit, item, id, onCancel, onView, onNew, onDeactivate }) {
  const navigate = useNavigate()
  const model = formHeaderModel({ isEdit, item, id })
  return (
    <RecordHeader
      bleed
      crumbs={model.crumbs.map(({ label, to }) => ({ label, onClick: to ? () => navigate(to) : undefined }))}
      title={model.title}
      subtitle={model.subtitle}
      actions={[
        ...(isEdit ? [
          { key: 'view', label: 'Ver detalle', icon: <Eye className="h-4 w-4" />, placement: 'collapse', onClick: onView },
          { key: 'new', label: 'Nuevo inventario', icon: <Plus className="h-4 w-4" />, placement: 'menu', onClick: onNew },
          { key: 'deactivate', label: 'Desactivar activo', icon: <Trash2 className="h-4 w-4" />, placement: 'menu', destructive: true, onClick: onDeactivate },
        ] : []),
        { key: 'cancel', label: 'Cancelar', onClick: onCancel },
        { key: 'save', label: 'Guardar', type: 'submit', form: INVENTORY_FORM_ID },
      ]}
    />
  )
}
