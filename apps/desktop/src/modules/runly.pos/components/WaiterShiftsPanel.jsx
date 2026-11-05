import { HandCoins } from 'lucide-react'
import { useState } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, TextField, TextareaField, EmptyState, Badge,
} from '@runly/ui'
import { useOpenWaiterShifts, useCloseWaiterShift } from '../hooks/usePosWaiterShifts'

function shortWaiter(waiterId) {
  if (!waiterId) return 'Mesero'
  return `Mesero ${waiterId.slice(0, 8)}`
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

export default function WaiterShiftsPanel({ open, onOpenChange, outletId, sessionId }) {
  const { data: shifts = [], isLoading } = useOpenWaiterShifts(outletId)
  const closeShift = useCloseWaiterShift()
  const [receiveTarget, setReceiveTarget] = useState(null)
  const [delivered, setDelivered] = useState('')
  const [notes, setNotes] = useState('')

  function handleOpenReceive(shift) {
    setReceiveTarget(shift)
    setDelivered(String(parseFloat(shift.expectedCashAmount ?? 0)))
    setNotes('')
  }

  function handleCloseReceive() {
    setReceiveTarget(null)
    setDelivered('')
    setNotes('')
  }

  function handleConfirmReceive() {
    if (!receiveTarget || !sessionId) return
    closeShift.mutate(
      {
        id: receiveTarget.id,
        data: {
          deliveredAmount: parseFloat(delivered) || 0,
          sessionId,
          ...(notes ? { notes } : {}),
        },
      },
      { onSuccess: handleCloseReceive },
    )
  }

  const expected = parseFloat(receiveTarget?.expectedCashAmount ?? 0)
  const deliveredNum = parseFloat(delivered) || 0
  const diff = deliveredNum - expected
  const hasDiff = delivered !== '' && delivered !== String(expected)

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Cortes de meseros</SheetTitle>
            <SheetDescription>
              Recibe el efectivo entregado por cada mesero con turno abierto.
            </SheetDescription>
          </SheetHeader>

          {!sessionId && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              Abre una caja para recibir cortes.
            </p>
          )}

          <div className="flex-1 overflow-y-auto mt-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando cortes...</p>
            ) : shifts.length === 0 ? (
              <EmptyState title="Sin cortes abiertos" description="No hay turnos de meseros pendientes de recibir." />
            ) : (
              <ul className="divide-y divide-border">
                {shifts.map((shift) => (
                  <li key={shift.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{shortWaiter(shift.waiterId)}</p>
                      <p className="text-xs text-muted-foreground">
                        Esperado: ${parseFloat(shift.expectedCashAmount ?? 0).toFixed(2)} · {formatDateTime(shift.openedAt)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!sessionId}
                      onClick={() => handleOpenReceive(shift)}
                      className="shrink-0"
                    >
                      Recibir corte
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(receiveTarget)} onOpenChange={(v) => !v && handleCloseReceive()}>
        <DialogContent size="md">
          <DialogHeader icon={HandCoins}>
            <DialogTitle>Recibir corte — {shortWaiter(receiveTarget?.waiterId)}</DialogTitle>
            <DialogDescription>
              Registra el efectivo entregado por el mesero para este turno.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleConfirmReceive() }} className="flex flex-col gap-4 py-1">
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Efectivo esperado</span>
                <span className="font-semibold tabular-nums">${expected.toFixed(2)}</span>
              </div>
            </div>

            <TextField
              label="Monto entregado"
              required
              type="number"
              min="0"
              step="0.01"
              value={delivered}
              onChange={(e) => setDelivered(e.target.value)}
              placeholder="0.00"
            />

            {hasDiff && (
              <div className={`flex items-center justify-between rounded-lg px-4 py-2.5 border text-sm font-medium ${
                diff >= 0
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                <span>Diferencia</span>
                <span className="tabular-nums">{diff >= 0 ? '+' : ''}{diff.toFixed(2)}</span>
              </div>
            )}

            <TextareaField
              label="Notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del corte (opcional)"
              rows={2}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleCloseReceive}>Cancelar</Button>
              <Button type="submit" disabled={delivered === '' || !sessionId || closeShift.isPending}>
                {closeShift.isPending ? 'Recibiendo...' : 'Confirmar recepción'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function WaiterShiftsBadgeCount({ outletId }) {
  const { data: shifts = [] } = useOpenWaiterShifts(outletId)
  if (shifts.length === 0) return null
  return <Badge variant="secondary" className="ml-1">{shifts.length}</Badge>
}
