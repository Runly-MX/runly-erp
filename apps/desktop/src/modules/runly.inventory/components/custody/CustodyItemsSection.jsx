import { useMemo, useState } from 'react'
import {
  Button, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@runly/ui'
import { Plus } from 'lucide-react'
import { CustodyItemsPicker } from './CustodyItemsPicker.jsx'
import { custodyItemColumns } from './custodyItemColumns.jsx'

const itemIdOf = (row) => row.itemId ?? row.item?.id ?? row.id

// Items snapshot. While the record is open, items can be added (picker
// dialog) or removed per row; `apply` is the guarded PATCH.
export function CustodyItemsSection({ custody, editable, apply, busy }) {
  const [adding, setAdding] = useState(false)
  const [selection, setSelection] = useState([])
  const currentIds = useMemo(() => custody.items.map(itemIdOf), [custody.items])

  const columns = useMemo(() => custodyItemColumns(editable ? {
    disabled: busy,
    onRemove: (row) => {
      const id = itemIdOf(row)
      apply({ itemIds: currentIds.filter((x) => x !== id) }, 'Artículo quitado del resguardo')
    },
  } : {}), [editable, busy, apply, currentIds])

  function openAdd() {
    setSelection([])
    setAdding(true)
  }

  async function confirmAdd() {
    const ok = await apply({ itemIds: [...currentIds, ...selection.map((row) => row.id)] },
      selection.length === 1 ? 'Artículo agregado' : `${selection.length} artículos agregados`)
    if (ok) setAdding(false)
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Artículos del resguardo <span className="font-normal text-[hsl(var(--muted-foreground))]">({custody.items.length})</span></h3>
        {editable ? (
          <Button type="button" variant="outline" size="sm" onClick={openAdd} disabled={busy}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Agregar artículos
          </Button>
        ) : null}
      </div>
      <DataTable columns={columns} data={custody.items} getRowId={(row) => row.id ?? itemIdOf(row)}
        showToolbar={false} showPagination={custody.items.length > 10} emptyTitle="Sin artículos"
        emptyDescription={editable ? 'Agrega los artículos que se entregan o devuelven.' : undefined} />

      <Dialog open={adding} onOpenChange={(open) => { if (!busy) setAdding(open) }}>
        <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
          <DialogHeader className="mb-0 shrink-0 border-b border-[hsl(var(--border))] px-5 pt-4 pb-3">
            <DialogTitle>Agregar artículos</DialogTitle>
            <DialogDescription>Busca por nombre, etiqueta o serie. Los datos se copian al resguardo al guardar.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <CustodyItemsPicker value={selection} onChange={setSelection} excludeIds={currentIds} disabled={busy} />
          </div>
          <DialogFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={busy}>Cancelar</Button>
            <Button type="button" onClick={confirmAdd} disabled={busy || selection.length === 0}>
              {busy ? 'Guardando...' : 'Agregar al resguardo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
