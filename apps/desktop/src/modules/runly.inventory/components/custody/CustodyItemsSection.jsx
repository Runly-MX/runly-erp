import { useMemo, useState } from 'react'
import {
  Button, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@runly/ui'
import { Plus } from 'lucide-react'
import { CustodyItemsPicker } from './CustodyItemsPicker.jsx'
import { custodyItemColumns } from './custodyItemColumns.jsx'
import { itemFieldPatch } from '../../lib/custody-api.js'

const itemIdOf = (row) => row.itemId ?? row.item?.id ?? row.id

// Items snapshot. While the record is open, items can be added (picker
// dialog), removed per row and their snapshot fields edited inline;
// `apply` / `applyItem` are the guarded PATCHes.
export function CustodyItemsSection({ custody, editable, apply, applyItem, busy }) {
  const [adding, setAdding] = useState(false)
  const [selection, setSelection] = useState([])
  const currentIds = useMemo(() => custody.items.map(itemIdOf), [custody.items])

  const columns = useMemo(() => custodyItemColumns(editable ? {
    disabled: busy,
    onRemove: (row) => {
      const id = itemIdOf(row)
      apply({ itemIds: currentIds.filter((x) => x !== id) }, 'Artículo quitado del resguardo')
    },
    onEdit: applyItem ? (row, field, text) => {
      const patch = itemFieldPatch(row, field, text)
      if (patch) applyItem(row.id ?? itemIdOf(row), patch, patch[field] === null ? 'Se restauró el dato del artículo' : 'Artículo actualizado')
    } : undefined,
  } : {}), [editable, busy, apply, applyItem, currentIds])

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
        <div>
          <h3 className="text-sm font-semibold">Artículos del resguardo <span className="font-normal text-[hsl(var(--muted-foreground))]">({custody.items.length})</span></h3>
          {editable && applyItem && custody.items.length ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Haz clic en un dato para corregirlo. Los editados a mano llevan un punto y se conservan aunque cambie el artículo.
            </p>
          ) : null}
        </div>
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
