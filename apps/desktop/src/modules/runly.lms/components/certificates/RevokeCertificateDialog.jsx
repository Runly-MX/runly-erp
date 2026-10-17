import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextareaField } from '@runly/ui'
import { Loader2, ShieldOff } from 'lucide-react'

// Revokes an issued certificate. The reason is required and stays on record;
// the public verification page then shows the certificate as revoked.
export function RevokeCertificateDialog({ open, onOpenChange, enrollment, onSubmit, pending }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])

  async function submit(event) {
    event.preventDefault()
    const value = reason.trim()
    if (!value) { setError('Escribe el motivo de la revocación.'); return }
    await onSubmit(value)
  }

  const name = enrollment?.learner?.displayName ?? 'esta persona'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={ShieldOff} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Revocar certificado</DialogTitle>
            <DialogDescription>
              El certificado {enrollment?.certificate?.folio ?? ''} de {name} dejará de ser válido. Su enlace de verificación lo mostrará como revocado.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextareaField
              label="Motivo" required rows={4} maxLength={500} value={reason} error={error || undefined}
              onChange={(event) => { setReason(event.target.value); setError('') }}
              placeholder="Ej. Se emitió con un nombre incorrecto."
            />
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              Revocar certificado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
