import { ComboboxField, CreatableComboboxField } from '@runly/ui'
import { toast } from 'sonner'
import { useGuestCreateEntry } from '../../hooks/useInventoryGuestCatalog.js'
import { guestErrorMessage } from '../../lib/guest-session.js'

// Location / condition picker. "+ Crear «X»" only when the supplier may create catalog entries in the folder.
// `multiple`: the value is an id array (conditions).
export function GuestCatalogField({ kind, noun, label, icon, rows = [], value, onChange, canCreate, error, multiple = false }) {
  const create = useGuestCreateEntry(kind)
  const options = rows.map((r) => ({ value: r.id, label: r.name }))
  const list = Array.isArray(value) ? value : []
  async function handleCreate(name) {
    try {
      const row = await create.mutateAsync({ name })
      if (row?.id) onChange(multiple ? [...new Set([...list, row.id])] : row.id)
      toast.success(`${noun} «${row?.name ?? name}» ${row?.reused ? 'seleccionada' : 'creada'}`)
    } catch (err) { toast.error(guestErrorMessage(err)) }
  }
  const common = multiple
    ? { label, icon, multiple, value: list, options, error, onChange: (v) => onChange(Array.isArray(v) ? v : []) }
    : { label, icon, value: value ?? '', options, error, onChange: (v) => onChange(v || null) }
  return canCreate
    ? <CreatableComboboxField {...common} onCreate={handleCreate} isCreating={create.isPending} placeholder="Buscar o crear..." searchPlaceholder="Buscar..." />
    : <ComboboxField {...common} placeholder="Buscar..." />
}
