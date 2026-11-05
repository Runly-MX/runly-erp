import { Link2 } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import PosDeviceAccess from './PosDeviceAccess.jsx'

// Registers by link, reachable from the POS bar without leaving the counter
// (the same panel as Administración > Cajas por enlace).
export default function PosDeviceLinksDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" scrollable>
        <DialogHeader icon={Link2}>
          <DialogTitle>Cajas por enlace</DialogTitle>
          <DialogDescription>Abre esta u otra caja en una tableta o computadora aparte, fuera del ERP. Cada cajero entra con su PIN.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">{open && <PosDeviceAccess />}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
