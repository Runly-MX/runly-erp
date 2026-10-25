import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { Ruler } from 'lucide-react'
import { PageSettingsForm } from './editor/PageSettingsForm.jsx'

export function StudioPageDialog({ open, onClose, page, onApply, creating = false, disabled = false }) {
  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent size="md">
        <DialogHeader icon={Ruler}>
          <DialogTitle>{creating ? 'Tamaño personalizado' : 'Tamaño y fondo'}</DialogTitle>
          <DialogDescription>Medidas en píxeles, de 32 a 4096 por lado.</DialogDescription>
        </DialogHeader>
        <PageSettingsForm page={page} onApply={onApply} creating={creating} disabled={disabled} onDone={onClose} />
      </DialogContent>
    </Dialog>
  )
}
