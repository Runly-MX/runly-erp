import { useEffect, useState } from 'react'
import { Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextareaField } from '@runly/ui'
import { KeyRound, Send } from 'lucide-react'
import { toast } from 'sonner'
import { buildProposalBody } from '../../lib/proposal-fields.js'

const NOUN = { serialNumber: 'número de serie', assetTag: 'número de activo' }

// Sends what the user typed to the people who manage the folder where the item already lives, or asks them
// for access. Used by the main item form and the supplier portal; `onSubmit(body)` does the request.
export function ProposalDialog({ open, onOpenChange, kind, matched, fields, onSubmit }) {
  const [selected, setSelected] = useState(new Set())
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const isChange = kind === 'change'

  useEffect(() => {
    if (!open) return
    setSelected(new Set(fields.map((f) => f.key)))
    setMessage('')
  }, [open, fields])

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  async function submit() {
    setBusy(true)
    try {
      await onSubmit(buildProposalBody({ kind, matched, fields, selected, message }))
      toast.success(isChange ? 'Enviamos tus datos a revisión' : 'Enviamos tu solicitud de acceso')
      onOpenChange(false)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo enviar. Intenta de nuevo.')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={isChange ? Send : KeyRound}>
          <DialogTitle>{isChange ? 'Enviar datos a revisión' : 'Solicitar acceso'}</DialogTitle>
          <DialogDescription>
            {isChange
              ? `Ese ${NOUN[matched?.field] ?? 'número'} ya existe en una carpeta a la que no tienes acceso. Quien la administra revisará cada dato y decidirá cuáles aplicar.`
              : `Ese ${NOUN[matched?.field] ?? 'número'} ya existe en una carpeta a la que no tienes acceso. Se avisará a quien la administra para que decida si te da acceso.`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {isChange ? (
            fields.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Llena algún dato del formulario (nombre, modelo, tipo, marca...) para poder enviarlo.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium">Datos que se envían</p>
                {fields.map((f) => (
                  <CheckboxField key={f.key} label={f.label} checked={selected.has(f.key)} onChange={() => toggle(f.key)}>{f.display}</CheckboxField>
                ))}
              </div>
            )
          ) : null}
          <TextareaField label="Mensaje (opcional)" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={isChange ? 'Por ejemplo: este equipo lo recibimos en la sucursal norte.' : 'Explica para qué necesitas ver este item.'} />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={busy || (isChange && selected.size === 0)} onClick={submit}>
            {busy ? 'Enviando...' : isChange ? 'Enviar a revisión' : 'Solicitar acceso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
