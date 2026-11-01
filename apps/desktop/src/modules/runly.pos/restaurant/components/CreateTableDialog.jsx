import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, NumberStepper, TextField } from '@runly/ui'
import { Armchair, Loader2 } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import { usePosCommand } from '../../retail/hooks/usePosCommand.js'

// Tables exist without a floor plan: a name and a capacity are enough.
export default function CreateTableDialog({ outletId, token, suggestedName, onClose, onCreated }) {
  const [name, setName] = useState(suggestedName)
  const [capacity, setCapacity] = useState(4)
  const [error, setError] = useState(null)
  const command = usePosCommand({
    prefix: 'table-create', scope: outletId,
    run: (body, options) => runly.commerce.createTable(body, token, options),
    onSuccess: (res) => onCreated(res.data),
  })
  const processing = command.isPending

  function submit() {
    if (!name.trim()) { setError('Escribe el nombre o número de la mesa.'); return }
    setError(null)
    command.mutate({ outletId, name: name.trim(), capacity })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !processing && onClose()}>
      <DialogContent size="md" scrollable className="p-0 md:p-0" onEscapeKeyDown={(e) => processing && e.preventDefault()} onInteractOutside={(e) => processing && e.preventDefault()}>
        <form onSubmit={(e) => { e.preventDefault(); if (!processing) submit() }} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={Armchair}>
              <DialogTitle>Nueva mesa</DialogTitle>
              <DialogDescription>No necesitas un plano: solo el nombre y para cuántas personas es.</DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={processing} />
            <TextField label="Nombre o número" required value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={100} disabled={processing} autoFocus icon={null} />
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Capacidad</p>
              <NumberStepper label="Capacidad de la mesa" value={capacity} onChange={setCapacity} min={1} max={99} disabled={processing} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose} disabled={processing}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-14 min-w-48 text-base font-bold" disabled={processing || command.failure?.kind === 'lost'}>
              {processing ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Creando</> : 'Crear mesa'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
