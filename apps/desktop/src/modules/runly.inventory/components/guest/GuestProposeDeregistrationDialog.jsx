import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField } from '@runly/ui'
import { ArchiveX } from 'lucide-react'
import { toast } from 'sonner'
import { useProposeGuestDeregistration } from '../../hooks/useInventoryGuest.js'
import { DEREGISTRATION_REASONS } from '../../lib/admin-status.js'
import { guestErrorMessage } from '../../lib/guest-session.js'

// A supplier can only PROPOSE a baja: the team approves or rejects it and nothing is deleted.
export function GuestProposeDeregistrationDialog({ item, open, onOpenChange }) {
  const propose = useProposeGuestDeregistration()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])

  async function send() {
    if (!reason) { setError('Elige el motivo'); return }
    try {
      await propose.mutateAsync({ itemId: item.id, reason })
      toast.success('Propuesta de baja enviada: el equipo la revisará')
      onOpenChange(false)
    } catch (err) { toast.error(guestErrorMessage(err)) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={ArchiveX}>
          <DialogTitle>Proponer baja</DialogTitle>
          <DialogDescription>{item?.name}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Enviarás una propuesta al equipo de la empresa, que debe aprobarla o rechazarla. El item no se elimina y, mientras la propuesta esté pendiente, queda de solo lectura.
          </p>
          <SelectField label="Motivo" required value={reason} placeholder="Elegir motivo" options={DEREGISTRATION_REASONS}
            onValueChange={(v) => { setReason(v); setError('') }} error={error} />
        </div>
        <DialogFooter className="mt-4 shrink-0 flex-row justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={propose.isPending} onClick={send}>{propose.isPending ? 'Enviando...' : 'Enviar propuesta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
