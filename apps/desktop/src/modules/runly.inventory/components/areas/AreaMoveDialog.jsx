import { useEffect, useState } from 'react'
import { Button, ComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import { useMoveInventoryItems } from '../../hooks/useInventoryAreas.js'
import { AREA_NONE } from '../../lib/area-tree.js'

// Bulk "Mover a área" for the selected items. `options` come from useAreaChoices().writeOptions.
export function AreaMoveDialog({ open, onOpenChange, itemIds = [], options = [], onDone }) {
  const move = useMoveInventoryItems()
  const [target, setTarget] = useState('')

  useEffect(() => { if (open) setTarget('') }, [open])

  async function handleMove() {
    try {
      const result = await move.mutateAsync({ itemIds, areaId: target === AREA_NONE ? null : target })
      toast.success(`${result?.moved ?? itemIds.length} items movidos`)
      onDone?.()
      onOpenChange(false)
    } catch (err) { toast.error(err?.message ?? 'No se pudieron mover los items') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={FolderInput}>
          <DialogTitle>Mover a área</DialogTitle>
          <DialogDescription>{itemIds.length === 1 ? 'Se moverá 1 item.' : `Se moverán ${itemIds.length} items.`}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <ComboboxField label="Área de destino" required value={target} options={options} onChange={setTarget} placeholder="Elegir área..." />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={!target || move.isPending} onClick={handleMove}>
            {move.isPending ? 'Moviendo...' : 'Mover'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
