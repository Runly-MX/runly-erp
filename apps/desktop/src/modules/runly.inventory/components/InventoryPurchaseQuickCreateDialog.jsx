import { useEffect, useState } from 'react'
import { Button, DatePickerField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { toast } from 'sonner'
import { SupplierField } from '../../runly.purchases/components/SupplierField.jsx'
import { useSaveDocument } from '../../runly.purchases/hooks/usePurchases.js'
import { quickCreatePayload } from '../lib/purchase-links.js'

const COPY = {
  order: { kind: 'orders', title: 'Crear orden de compra', done: 'Orden de compra creada', description: 'Se crea como borrador en Compras, con su expediente. Completa los conceptos y montos desde Compras.' },
  invoice: { kind: 'invoices', title: 'Crear factura', done: 'Factura creada', description: 'Se crea como borrador en Compras, con su expediente. Completa los conceptos y montos desde Compras.' },
}

// Minimal create of a purchase order / invoice from the inventory item form.
// Deliberately not a <form>: this dialog renders inside the item form's React
// tree and a nested submit would also submit the item.
export function InventoryPurchaseQuickCreateDialog({ open, onOpenChange, kind, initialNumber, onCreated }) {
  const copy = COPY[kind] ?? COPY.order
  const save = useSaveDocument(copy.kind)
  const [number, setNumber] = useState('')
  const [supplier, setSupplier] = useState({ id: null, record: null })
  const [issueDate, setIssueDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setNumber(initialNumber ?? ''); setSupplier({ id: null, record: null }); setIssueDate(''); setError('') }
  }, [open, initialNumber])

  async function submit() {
    const payload = quickCreatePayload({ number, supplierId: supplier.id, issueDate })
    if (!payload) { setError('Escribe el folio.'); return }
    try {
      const doc = await save.mutateAsync({ data: payload })
      toast.success(copy.done)
      onCreated({ ...doc, supplierName: supplier.record?.name ?? null })
    } catch (err) {
      setError(err?.details?.error ?? err?.message ?? 'No se pudo crear el documento.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <TextField
            label="Folio"
            required
            value={number}
            onChange={(event) => { setNumber(event.target.value); setError('') }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }}
            error={error}
            placeholder="Ej. PVR-0001"
            maxLength={kind === 'order' ? 40 : 100}
          />
          <SupplierField value={supplier.id} onChange={(id, record) => setSupplier({ id, record })} hint="Opcional." />
          <DatePickerField label="Fecha" value={issueDate} onChange={setIssueDate} hint="Opcional; por defecto hoy." />
        </div>
        <DialogFooter className="shrink-0 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={save.isPending} onClick={() => void submit()}>{save.isPending ? 'Creando...' : 'Crear y seleccionar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
