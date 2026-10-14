import { useMemo } from 'react'
import { ComboboxField, TextField } from '@runly/ui'
import { useAuth } from '../../../../auth/AuthProvider'
import { useCustodyDeliverers } from '../../hooks/useInventoryCustody.js'

export const DELIVER_ON_BEHALF = 'inventory.custody.deliver_on_behalf'

function describe(user) {
  return [user.email, user.hasSavedSignature ? (user.allowDelegation ? 'Firma guardada disponible' : 'Firma guardada (solo la persona)') : null]
    .filter(Boolean).join(' · ') || undefined
}

// Who delivers the equipment. Only users with deliver_on_behalf may pick
// someone else; everyone else sees themselves (or the stored deliverer).
export function CustodyDelivererField({ value, onChange, canDelegate, fallbackName, disabled, label = 'Entrega' }) {
  const { userProfile } = useAuth()
  const deliverers = useCustodyDeliverers({ enabled: canDelegate })
  const options = useMemo(() => (deliverers.data ?? []).map((user) => ({
    value: user.id,
    label: user.id === userProfile?.id ? `${user.name} (tú)` : user.name,
    description: describe(user),
  })), [deliverers.data, userProfile?.id])

  if (!canDelegate) {
    const name = fallbackName || userProfile?.displayName || userProfile?.name || userProfile?.email || '—'
    return <TextField label={label} value={name} readOnly disabled hint="Para generar resguardos a nombre de otra persona necesitas el permiso correspondiente." />
  }
  return (
    <ComboboxField
      label={label}
      options={options}
      value={value ?? ''}
      onChange={onChange}
      loading={deliverers.isLoading}
      disabled={disabled}
      placeholder="Seleccionar quién entrega..."
      searchPlaceholder="Buscar usuario..."
      emptyText="Sin usuarios que coincidan"
    />
  )
}
