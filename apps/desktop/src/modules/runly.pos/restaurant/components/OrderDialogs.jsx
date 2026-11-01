import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, TextareaField } from '@runly/ui'
import { Ban, Loader2, Send } from 'lucide-react'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import { formatQuantity } from '../../retail/lib/retailRules.js'
import { lineModifiersText } from '../lib/restaurantRules.js'

const lockWhile = (busy) => ({ onEscapeKeyDown: (e) => busy && e.preventDefault(), onInteractOutside: (e) => busy && e.preventDefault() })

// Confirm + send to the kitchen. While the command is in flight the dialog
// cannot be dismissed; after a lost response the only action is retrying the
// original attempt (same key), so a send can never be duplicated.
export function DispatchDialog({ lines, nextSequence, expectedVersion, command, onClose }) {
  const processing = command.isPending
  const lost = command.failure?.kind === 'lost'
  return (
    <Dialog open onOpenChange={(v) => !v && !processing && onClose()}>
      <DialogContent size="md" scrollable className="p-0 md:p-0" {...lockWhile(processing)}>
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
          <DialogHeader icon={Send}>
            <DialogTitle>{nextSequence > 1 ? `Enviar extras a cocina (envío ${nextSequence})` : 'Enviar a cocina'}</DialogTitle>
            <DialogDescription>{lines.length === 1 ? 'Se enviará 1 producto.' : `Se enviarán ${lines.length} productos.`} Después de enviarlos ya no se editan; los extras van en un envío nuevo.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={processing} />
          <ul className="space-y-1.5" aria-label="Productos a enviar">
            {lines.map((l) => (
              <li key={l.id} className="rounded-lg bg-[hsl(var(--muted))] px-3 py-2 text-sm">
                <span className="font-bold tabular-nums">{formatQuantity(l.quantity)}×</span> <span className="font-semibold">{l.productName}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</span>
                {lineModifiersText(l) && <span className="text-[hsl(var(--muted-foreground))]"> — {lineModifiersText(l)}</span>}
                {l.note && <span className="block font-medium text-amber-900 dark:text-amber-300">Nota: {l.note}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose} disabled={processing}>{lost ? 'Cerrar (el envío sigue pendiente)' : 'Volver'}</Button>
          <Button type="button" size="lg" className="h-14 min-w-56 text-lg font-bold" disabled={processing}
            onClick={() => (lost ? command.retry() : command.mutate({ expectedVersion, lineIds: lines.map((l) => l.id) }))}>
            {processing ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Enviando</> : lost ? 'Reintentar envío' : 'Enviar a cocina'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// A required reason, used to void a product that is already in the kitchen.
export function VoidDialog({ line, command, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const processing = command.isPending
  return (
    <Dialog open onOpenChange={(v) => !v && !processing && onClose()}>
      <DialogContent size="md" className="p-0 md:p-0" {...lockWhile(processing)}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !processing) onConfirm(reason.trim()) }}>
          <div className="border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={Ban}>
              <DialogTitle>Anular producto</DialogTitle>
              <DialogDescription>{line.productName}. Solo antes del primer pago; queda registrado.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-6 py-5">
            <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={processing} />
            <TextareaField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} disabled={processing || command.failure?.kind === 'lost'} />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose} disabled={processing}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-14 min-w-48 text-base font-bold" disabled={processing || (!reason.trim() && command.failure?.kind !== 'lost')}
              onClick={command.failure?.kind === 'lost' ? (e) => { e.preventDefault(); command.retry() } : undefined}>
              {processing ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Anulando</> : command.failure?.kind === 'lost' ? 'Reintentar' : 'Anular'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
