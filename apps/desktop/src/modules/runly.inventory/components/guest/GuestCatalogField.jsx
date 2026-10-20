import { ComboboxField, CreatableComboboxField } from '@runly/ui'
import { toast } from 'sonner'
import { useGuestCreateEntry } from '../../hooks/useInventoryGuestCatalog.js'
import { guestErrorMessage } from '../../lib/guest-session.js'

// Location / condition picker. "+ Crear «X»" only when the supplier may create catalog entries in the folder.
export function GuestCatalogField({ kind, noun, label, icon, rows = [], value, onChange, canCreate, error }) {
  const create = useGuestCreateEntry(kind)
  const options = rows.map((r) => ({ value: r.id, label: r.name }))
  async function handleCreate(name) {
    try {
      const row = await create.mutateAsync({ name })
      if (row?.id) onChange(row.id)
      toast.success(`${noun} «${row?.name ?? name}» ${row?.reused ? 'seleccionada' : 'creada'}`)
    } catch (err) { toast.error(guestErrorMessage(err)) }
  }
  const common = { label, icon, value: value ?? '', options, error, onChange: (v) => onChange(v || null) }
  return canCreate
    ? <CreatableComboboxField {...common} onCreate={handleCreate} isCreating={create.isPending} placeholder="Buscar o crear..." searchPlaceholder="Buscar..." />
    : <ComboboxField {...common} placeholder="Buscar..." />
}
