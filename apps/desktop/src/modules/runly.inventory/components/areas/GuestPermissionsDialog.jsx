import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField } from '@runly/ui'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useUpdateInventoryAreaGuest } from '../../hooks/useInventoryAreas.js'
import { GUEST_ROLE_OPTIONS, buildGuestPermissionsPatch } from '../../lib/guest-session.js'
import { GuestCapabilityFields } from './GuestCapabilityFields.jsx'

// Edits the role and capabilities of a supplier already invited to a folder.
export function GuestPermissionsDialog({ guest, area, onClose }) {
  const update = useUpdateInventoryAreaGuest(area?.id)
  const [state, setState] = useState({ role: 'viewer', canCreateModels: false, canImport: false })

  useEffect(() => {
    if (guest) setState({ role: guest.role, canCreateModels: Boolean(guest.canCreateModels), canImport: Boolean(guest.canImport) })
  }, [guest])

  async function save() {
    try {
      await update.mutateAsync({ guestId: guest.id, ...buildGuestPermissionsPatch(state) })
      toast.success('Permisos actualizados')
      onClose()
    } catch (err) { toast.error(err?.message ?? 'No se pudieron actualizar los permisos') }
  }

  return (
    <Dialog open={Boolean(guest)} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={ShieldCheck}>
          <DialogTitle>Editar permisos</DialogTitle>
          <DialogDescription>{guest?.name || guest?.email} en {area?.name}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <SelectField label="Permisos" value={state.role} options={GUEST_ROLE_OPTIONS} onValueChange={(role) => setState((s) => ({ ...s, role }))} />
          {state.role === 'editor' ? <GuestCapabilityFields {...state} onChange={(patch) => setState((s) => ({ ...s, ...patch }))} /> : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={update.isPending} onClick={save}>{update.isPending ? 'Guardando...' : 'Guardar cambios'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
