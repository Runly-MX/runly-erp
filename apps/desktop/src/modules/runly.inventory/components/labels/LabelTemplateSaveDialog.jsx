import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SwitchField, TextField,
} from '@runly/ui'
import { LayoutTemplate } from 'lucide-react'

// Name + default flag for "Guardar como plantilla".
export function LabelTemplateSaveDialog({ open, onOpenChange, onSave, saving, initialName = '' }) {
  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setName(initialName); setIsDefault(false); setError('') }
  }, [open, initialName])

  function submit() {
    if (!name.trim()) { setError('Escribe un nombre.'); return }
    onSave({ name: name.trim(), isDefault })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={LayoutTemplate}>
          <DialogTitle>Guardar como plantilla</DialogTitle>
          <DialogDescription>Guarda el tamaño, la distribución, los campos y el QR para reutilizarlos.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <TextField label="Nombre" required value={name} error={error} placeholder="Etiqueta de laptops"
            onChange={(e) => { setName(e.target.value); setError('') }} />
          <SwitchField label="Plantilla predeterminada" description="Se usa al abrir Etiquetas y en la ficha de cada equipo."
            checked={isDefault} onChange={(v) => setIsDefault(Boolean(v))} />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={saving}>{saving ? 'Guardando...' : 'Guardar plantilla'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
