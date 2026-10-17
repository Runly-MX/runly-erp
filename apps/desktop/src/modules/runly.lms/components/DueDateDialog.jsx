import { useEffect, useState } from 'react'
import { Button, DateField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { CalendarClock, Loader2 } from 'lucide-react'
import { dueDateToIso, isoToDateInput } from '../lib/lmsLabels.js'

// Changes or clears the due date of one enrollment.
export function DueDateDialog({ open, onOpenChange, enrollment, onSubmit, pending }) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue(isoToDateInput(enrollment?.dueAt)) }, [open, enrollment])
  const name = enrollment?.learner?.displayName ?? 'esta persona'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={CalendarClock}>
          <DialogTitle>Fecha límite</DialogTitle>
          <DialogDescription>Hasta cuándo debe terminar {name} el curso. Pasada la fecha se marca como vencido.</DialogDescription>
        </DialogHeader>
        <DateField label="Fecha límite" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Sin fecha límite" />
        <DialogFooter>
          {enrollment?.dueAt ? <Button variant="outline" onClick={() => onSubmit(null)} disabled={pending} className="sm:mr-auto">Quitar fecha</Button> : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSubmit(dueDateToIso(value))} disabled={pending || !value}>
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
