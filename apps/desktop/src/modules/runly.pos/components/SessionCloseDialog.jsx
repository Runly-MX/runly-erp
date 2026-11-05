import { LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, TextField,
} from '@runly/ui'
import { useClosePosSession, useExpectedCashAmount } from '../hooks/usePosSession'

export default function SessionCloseDialog({ open, onOpenChange, session, onSuccess }) {
  const close = useClosePosSession()
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')

  const { data: liveExpected, isLoading: loadingExpected } = useExpectedCashAmount(
    open ? session?.id : null,
    open,
  )
  const expected = parseFloat(liveExpected ?? session?.expectedCashAmount ?? 0)
  const countedNum = parseFloat(counted) || 0
  const diff = countedNum - expected
  const hasDiff = counted !== ''

  function handleClose() {
    close.mutate(
      { id: session.id, countedCashAmount: countedNum, notes: notes || undefined },
      { onSuccess: (data) => { onSuccess?.(data); onOpenChange(false) } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={LockKeyhole}>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Registra el conteo físico de efectivo para cerrar el turno.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleClose() }} className="flex flex-col gap-4 py-1">
          <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Efectivo esperado</span>
              <span className="font-semibold tabular-nums">
                {loadingExpected ? 'Calculando...' : `$${expected.toFixed(2)}`}
              </span>
            </div>
          </div>

          <TextField
            label="Efectivo contado"
            required
            type="number"
            min="0"
            step="0.01"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="0.00"
            hint="Ingresa el total de efectivo en caja al momento del cierre"
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

          <TextField
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observaciones del cierre (opcional)"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              type="submit"
              disabled={counted === '' || close.isPending}
              variant="destructive"
            >
              {close.isPending ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
