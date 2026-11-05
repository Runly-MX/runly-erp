import { LockKeyholeOpen } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Button, Label, SelectField, TextField,
} from '@runly/ui'
import { usePosTerminals } from '../hooks/usePosSettings'
import { useOpenPosSession } from '../hooks/usePosSession'

export default function SessionOpenDialog({ open, onOpenChange, onSuccess, defaultTerminalId }) {
  const { data: terminals = [] } = usePosTerminals()
  const openSession = useOpenPosSession()
  const [terminalId, setTerminalId] = useState(defaultTerminalId ?? '')
  const [amount, setAmount] = useState('0')

  const selectedTerminal = terminals.find((t) => t.id === terminalId)

  useEffect(() => {
    if (open) {
      setTerminalId(defaultTerminalId ?? '')
      setAmount('0')
    }
  }, [open, defaultTerminalId])

  function handleOpen() {
    if (!selectedTerminal) return
    openSession.mutate(
      {
        terminalId,
        outletId: selectedTerminal.outletId,
        openingCashAmount: parseFloat(amount) || 0,
      },
      { onSuccess: (data) => { onSuccess?.(data); onOpenChange(false) } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={LockKeyholeOpen}>
          <DialogTitle>Abrir caja</DialogTitle>
          <DialogDescription>
            Ingresa el efectivo inicial antes de comenzar las operaciones del día.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); handleOpen() }}
          className="flex flex-col gap-4 py-2"
        >
          {defaultTerminalId ? (
            <div className="flex flex-col gap-1.5">
              <Label>Terminal</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                {selectedTerminal?.name ?? 'Cargando...'}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Terminal</Label>
              <SelectField
                value={terminalId}
                onChange={setTerminalId}
                options={terminals.map((t) => ({ value: t.id, label: t.name }))}
                placeholder="Selecciona una terminal"
              />
            </div>
          )}
          <TextField
            label="Efectivo inicial en caja"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint="Monto con el que comienza el turno"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!terminalId || openSession.isPending}>
              {openSession.isPending ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
