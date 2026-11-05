import { Banknote } from 'lucide-react'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, TextField, Label, SelectField,
} from '@runly/ui'
import { useAddCashMovement } from '../hooks/usePosSession'

const KIND_OPTIONS = [
  { value: 'IN', label: 'Entrada de efectivo' },
  { value: 'OUT', label: 'Salida de efectivo' },
]

export default function CashMovementDialog({ open, onOpenChange, sessionId }) {
  const addMovement = useAddCashMovement()
  const [kind, setKind] = useState('IN')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  function handleSave() {
    addMovement.mutate(
      { sessionId, kind, amount: parseFloat(amount), reason },
      { onSuccess: () => { onOpenChange(false); setAmount(''); setReason(''); setKind('IN') } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={Banknote}>
          <DialogTitle>Movimiento de efectivo</DialogTitle>
          <DialogDescription>Registra una entrada o salida de efectivo en la caja activa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleSave() }} className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de movimiento</Label>
            <SelectField value={kind} onChange={setKind} options={KIND_OPTIONS} />
          </div>
          <TextField
            label="Monto"
            required
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <TextField
            label="Motivo"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. Cambio para cliente, fondo de inicio..."
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!amount || !reason || addMovement.isPending}>
              {addMovement.isPending ? 'Registrando...' : 'Registrar movimiento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
