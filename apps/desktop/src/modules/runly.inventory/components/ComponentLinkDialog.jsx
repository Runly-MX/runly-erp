import { useEffect, useMemo, useState } from 'react'
import { Button, ComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryItems, useLinkInventoryComponents } from '../hooks/useInventoryItems.js'
import { itemLabel } from '../lib/item-label.js'

// Bulk "Vincular como componentes" for the selected items: pick the main item, or detach them.
export function ComponentLinkDialog({ open, onOpenChange, itemIds = [], onDone }) {
  const link = useLinkInventoryComponents()
  const [target, setTarget] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => { if (open) { setTarget(''); setSearch('') } }, [open])
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const query = useInventoryItems({ search: debounced || undefined, pageSize: 20, adminStatus: 'all' }, { enabled: open })
  const options = useMemo(() => (query.data?.data ?? [])
    .filter((row) => !row.parentItemId && !itemIds.includes(row.id))
    .map((row) => ({ value: row.id, label: itemLabel(row), description: [row.folio, row.serialNumber].filter(Boolean).join(' · ') || undefined })), [query.data?.data, itemIds])

  async function run(parentItemId) {
    try {
      const result = await link.mutateAsync({ itemIds, parentItemId })
      toast.success(parentItemId ? `${result?.data?.linked ?? itemIds.length} activos vinculados` : 'Activos desvinculados')
      onDone?.()
      onOpenChange(false)
    } catch (err) { toast.error(err?.message ?? 'No se pudieron vincular los activos') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={Link2}>
          <DialogTitle>Vincular como componentes</DialogTitle>
          <DialogDescription>{itemIds.length === 1 ? '1 activo seleccionado.' : `${itemIds.length} activos seleccionados.`} Elige el activo principal del que formarán parte, o desvincúlalos.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <ComboboxField label="Activo principal" value={target} options={options} onChange={setTarget} onSearchChange={setSearch} filter={false}
            loading={query.isFetching && !options.length} placeholder="Buscar el activo principal..." searchPlaceholder="Nombre, folio, serie o número de activo" emptyText="Sin resultados" />
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="ghost" disabled={link.isPending} onClick={() => run(null)}>Desvincular</Button>
          <Button type="button" disabled={!target || link.isPending} onClick={() => run(target)}>{link.isPending ? 'Guardando...' : 'Vincular'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
