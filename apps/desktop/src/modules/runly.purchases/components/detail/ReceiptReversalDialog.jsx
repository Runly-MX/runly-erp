import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Ban, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, TextareaField } from '@runly/ui'
import { errorText, newOperationKey, useReverseReceipt } from '../../hooks/usePurchases.js'
import { formatDate, formatQty } from '../../lib/format.js'

// Reverses all or part of a registered receipt. Shows per line what was
// received, already reversed and still reversible; blockers (linked assets,
// closed order or case) disable the confirmation; warnings inform. The
// original receipt is kept; the order's received quantities are recalculated.
export function ReceiptReversalDialog({ receipt, open, onOpenChange }) {
  const reverse = useReverseReceipt(receipt?.id)
  const info = receipt?.reversal
  const [quantities, setQuantities] = useState({})
  const [reason, setReason] = useState('')
  const key = useRef(null)
  useEffect(() => {
    if (!open) return
    key.current = newOperationKey('rrev')
    setReason('')
    setQuantities(Object.fromEntries((info?.lines ?? []).map((l) => [l.receiptLineId, String(l.reversible)])))
  }, [open, info?.lines])

  const blockers = info?.blockers ?? []
  const lines = (info?.lines ?? []).filter((l) => l.reversible > 0)
  const requested = lines.map((l) => ({ receiptLineId: l.receiptLineId, quantity: Number(quantities[l.receiptLineId] || 0) })).filter((l) => l.quantity > 0)
  const invalid = requested.some((r) => r.quantity > (lines.find((l) => l.receiptLineId === r.receiptLineId)?.reversible ?? 0))

  const confirm = async () => {
    try {
      const result = await reverse.mutateAsync({ reason: reason.trim(), lines: requested, idempotencyKey: key.current })
      toast.success(`Recepción reversada. La orden queda ${result?.orderStatus === 'ISSUED' ? 'sin recepciones' : result?.orderStatus === 'RECEIVED' ? 'recibida' : 'con recepción parcial'}.`)
      onOpenChange(false)
    } catch (error) {
      const network = !error?.status
      toast.error(network ? 'No se pudo confirmar el reverso por un problema de conexión. Puedes reintentar sin riesgo de duplicarlo.' : errorText(error, 'No se pudo reversar la recepción.'))
      if (!network) key.current = newOperationKey('rrev')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg">
        <DialogHeader className="shrink-0" icon={Undo2}>
          <DialogTitle>Reversar recepción {receipt?.number}</DialogTitle>
          <DialogDescription>Se registra un reverso; la recepción original se conserva y la orden vuelve a esperar lo reversado.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {blockers.length ? (
            <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm" role="alert">
              {blockers.map((b) => (
                <p key={b.code} className="flex gap-2"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{b.message}{b.items?.length ? ` (${b.items.map((i) => i.label).join(', ')})` : ''}</span></p>
              ))}
            </div>
          ) : null}
          {(info?.warnings ?? []).map((w) => (
            <p key={w.code + w.message} className="flex gap-2 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{w.message}</p>
          ))}
          {!blockers.length ? (
            <>
              <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]" aria-label="Cantidades a reversar">
                {lines.map((l) => (
                  <li key={l.receiptLineId} className="flex flex-wrap items-end gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">{l.description ?? 'Concepto'}</span>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">Recibido {formatQty(l.received)}{l.reversed ? ` · ya reversado ${formatQty(l.reversed)}` : ''} · se puede reversar {formatQty(l.reversible)}</span>
                    </span>
                    <TextField className="w-28" id={`reverse-qty-${l.receiptLineId}`} label="A reversar" inputMode="decimal" value={quantities[l.receiptLineId] ?? ''}
                      onChange={(e) => setQuantities((q) => ({ ...q, [l.receiptLineId]: e.target.value }))} />
                  </li>
                ))}
              </ul>
              {invalid ? <p className="text-sm text-[hsl(var(--destructive))]">Una cantidad excede lo que se puede reversar.</p> : null}
              <TextareaField id="receipt-reversal-reason" label="Motivo" required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por qué se reversa (queda en el historial)." />
            </>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!blockers.length ? (
            <Button variant="destructive" disabled={reverse.isPending || !reason.trim() || !requested.length || invalid} onClick={confirm}>
              {reverse.isPending ? 'Guardando...' : 'Reversar recepción'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// History of the reversals of a receipt.
export function ReceiptReversalsPanel({ receipt }) {
  const reversals = receipt?.reversal?.reversals ?? []
  if (!reversals.length) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Esta recepción no tiene reversos.</p>
  const byLine = new Map((receipt.reversal.lines ?? []).map((l) => [l.receiptLineId, l.description]))
  return (
    <ul className="space-y-3" aria-label="Reversos de la recepción">
      {[...reversals].reverse().map((r) => (
        <li key={r.id} className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3" data-reversal-id={r.id}>
          <p className="text-sm font-semibold">Reverso del {formatDate(r.reversedAt)}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{r.createdByName ? `Por ${r.createdByName}` : ''}</p>
          <p className="mt-1 text-sm">Motivo: {r.reason}</p>
          <ul className="mt-1 text-sm">{r.lines.map((l) => <li key={l.id}>{byLine.get(l.receiptLineId) ?? 'Concepto'}: −{formatQty(l.quantity)}</li>)}</ul>
        </li>
      ))}
    </ul>
  )
}
