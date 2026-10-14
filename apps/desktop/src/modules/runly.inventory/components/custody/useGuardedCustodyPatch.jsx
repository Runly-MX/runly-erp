import { useState } from 'react'
import { ConfirmDialog } from '@runly/ui'
import { toast } from 'sonner'
import { useUpdateCustody, useUpdateCustodyItem } from '../../hooks/useInventoryCustody.js'
import { editClearsSignatures, itemEditClearsSignatures } from '../../lib/custody-api.js'

// PATCH helpers for the inline custody editor. Edits that clear captured
// signatures (kind, employee, items, an item's data) ask for confirmation first.
export function useGuardedCustodyPatch(custody) {
  const update = useUpdateCustody()
  const updateItem = useUpdateCustodyItem()
  const [pending, setPending] = useState(null)

  async function run(mutation, vars, message) {
    try {
      await mutation.mutateAsync({ id: custody.id, ...vars })
      toast.success(message ?? 'Resguardo actualizado')
      return true
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo actualizar el resguardo')
      return false
    }
  }

  // Resolves true when saved, false when failed or declined.
  function guard(clears, send) {
    if (!clears) return send()
    return new Promise((resolve) => setPending({ send, resolve }))
  }

  const apply = (patch, message) => guard(editClearsSignatures(custody, patch), () => run(update, patch, message))
  const applyItem = (rowId, patch, message) =>
    guard(itemEditClearsSignatures(custody), () => run(updateItem, { rowId, patch }, message ?? 'Artículo actualizado'))

  function close(result) {
    pending?.resolve(result)
    setPending(null)
  }

  const busy = update.isPending || updateItem.isPending
  const confirm = (
    <ConfirmDialog
      open={Boolean(pending)}
      onOpenChange={(open) => { if (!open) close(false) }}
      title="Se borrarán las firmas"
      description="Cambiar el tipo, el colaborador, los artículos o sus datos invalida las firmas ya capturadas. Tendrán que firmar de nuevo; el enlace de firma sigue siendo válido."
      confirmLabel="Guardar y borrar firmas"
      cancelLabel="Volver"
      loading={busy}
      onConfirm={async () => close(await pending.send())}
    />
  )

  return { apply, applyItem, busy, confirm }
}
