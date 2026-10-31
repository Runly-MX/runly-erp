import { useEffect, useMemo, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, ComboboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { useRelationMutations, useSearchDocuments } from '../../hooks/usePurchases.js'
import { documentLabel } from '../../lib/documentary.js'

// Relates an order and an invoice after both exist (POST /purchases/relations,
// invoice -> order, BILLED_FROM inferred by the API). One order per invoice;
// an order can have several invoices. The API enforces both and answers 409.
export function RelateDocumentDialog({ kind, doc, open, onOpenChange }) {
  const other = kind === 'orders' ? 'invoice' : 'order'
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState('')
  const known = useRef(new Map())
  const { create } = useRelationMutations()
  useEffect(() => { if (open) { setSearch(''); setSelected('') } }, [open])
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t) }, [search])
  const query = useSearchDocuments({ type: other, search: debounced || undefined, pageSize: 20 }, open)
  const rows = useMemo(() => (query.data?.data ?? []).filter((row) => row.status !== 'CANCELLED'), [query.data?.data])
  rows.forEach((row) => known.current.set(row.id, row))
  const options = rows.map((row) => ({ value: row.id, label: documentLabel(row), description: [row.supplierName, row.economicMode === 'DOCUMENTARY' ? 'Referencia' : row.statusLabel].filter(Boolean).join(' · ') || undefined }))

  const save = () => {
    const pick = known.current.get(selected)
    const body = kind === 'orders'
      ? { sourceType: 'purchase_invoice', sourceId: selected, targetType: 'purchase_order', targetId: doc.id }
      : { sourceType: 'purchase_invoice', sourceId: doc.id, targetType: 'purchase_order', targetId: selected }
    create.mutate(body, {
      // The mutation itself reports errors (409 when the invoice already has an order).
      onSuccess: () => { toast.success(`${kind === 'orders' ? 'Factura' : 'Orden'} ${documentLabel(pick)} relacionada`); onOpenChange(false) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="shrink-0" icon={Link2}>
          <DialogTitle>{kind === 'orders' ? 'Relacionar una factura' : 'Relacionar la orden de compra'}</DialogTitle>
          <DialogDescription>
            {kind === 'orders' ? 'Una orden puede tener varias facturas.' : 'Una factura se relaciona con una sola orden.'} No es obligatorio: un documento puede quedarse sin su contraparte.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-4">
          <ComboboxField id="relate-document" label={kind === 'orders' ? 'Factura' : 'Orden de compra'} options={options} value={selected} onChange={(v) => setSelected(v || '')}
            onSearchChange={setSearch} filter={false} loading={query.isFetching && !rows.length} placeholder="Buscar por referencia, folio o proveedor"
            searchPlaceholder="OC-2485, F-008721..." emptyText="Sin resultados" />
        </div>
        <DialogFooter className="shrink-0 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!selected || create.isPending} onClick={save}>{create.isPending ? 'Relacionando...' : 'Relacionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
