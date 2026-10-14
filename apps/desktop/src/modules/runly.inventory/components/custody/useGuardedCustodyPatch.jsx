import { useState } from 'react'
import { ConfirmDialog } from '@runly/ui'
import { toast } from 'sonner'
import { useUpdateCustody } from '../../hooks/useInventoryCustody.js'
import { editClearsSignatures } from '../../lib/custody-api.js'

// PATCH helper for the inline custody editor. Edits that clear captured
// signatures (kind, employee, items) ask for confirmation first.
export function useGuardedCustodyPatch(custody) {
  const update = useUpdateCustody()
  const [pending, setPending] = useState(null)

  async function send(patch, message) {
    try {
      await update.mutateAsync({ id: custody.id, ...patch })
      toast.success(message ?? 'Resguardo actualizado')
      return true
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo actualizar el resguardo')
      return false
    }
  }

  // Resolves true when saved, false when failed or declined.
  function apply(patch, message) {
    if (!editClearsSignatures(custody, patch)) return send(patch, message)
    return new Promise((resolve) => setPending({ patch, message, resolve }))
  }

  function close(result) {
    pending?.resolve(result)
    setPending(null)
  }

  const confirm = (
    <ConfirmDialog
      open={Boolean(pending)}
      onOpenChange={(open) => { if (!open) close(false) }}
      title="Se borrarán las firmas"
      description="Cambiar el tipo, el colaborador o los artículos invalida las firmas ya capturadas. Tendrán que firmar de nuevo; el enlace de firma sigue siendo válido."
      confirmLabel="Guardar y borrar firmas"
      cancelLabel="Volver"
      loading={update.isPending}
      onConfirm={async () => close(await send(pending.patch, pending.message))}
    />
  )

  return { apply, busy: update.isPending, confirm }
}
