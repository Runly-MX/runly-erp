import { useEffect, useMemo, useState } from 'react'
import { Button, ComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { FolderTree } from 'lucide-react'
import { toast } from 'sonner'
import { useSaveInventoryArea } from '../../hooks/useInventoryAreas.js'
import { areaPathLabel, buildAreaTree, descendantIds, flattenAreaTree } from '../../lib/area-tree.js'

const ROOT = '__root__'

// Creates, renames or moves an area. `area` = null creates; `parentId` presets the parent.
export function AreaDialog({ open, onOpenChange, area = null, parentId = null, areas = [] }) {
  const save = useSaveInventoryArea()
  const [name, setName] = useState('')
  const [parent, setParent] = useState(ROOT)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setName(area?.name ?? '')
    setParent(area ? (area.parentId ?? ROOT) : (parentId ?? ROOT))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    // An area cannot move under itself or its own descendants.
    const blocked = area ? descendantIds(areas, area.id) : new Set()
    return [
      { value: ROOT, label: 'Sin carpeta superior' },
      ...flattenAreaTree(buildAreaTree(areas))
        .filter((a) => !blocked.has(a.id))
        .map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) })),
    ]
  }, [areas, area])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Indica el nombre del área'); return }
    try {
      await save.mutateAsync({ ...(area ? { id: area.id } : {}), name: trimmed, parentId: parent === ROOT ? null : parent })
      toast.success(area ? 'Área actualizada' : 'Área creada')
      onOpenChange(false)
    } catch (err) { setError(err?.message ?? 'No se pudo guardar el área') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={FolderTree}>
          <DialogTitle>{area ? 'Editar área' : 'Nueva área'}</DialogTitle>
          <DialogDescription>Las áreas funcionan como carpetas: quien es miembro de una carpeta también accede a las que contiene.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <TextField label="Nombre" required value={name} maxLength={150} error={error}
            onChange={(e) => { setName(e.target.value); setError('') }} />
          <ComboboxField label="Carpeta superior" value={parent} options={options} onChange={setParent} />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={save.isPending} onClick={handleSave}>
            {save.isPending ? 'Guardando...' : area ? 'Guardar cambios' : 'Crear área'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
