import { useEffect, useRef, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { Button, DatePickerField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { SupplierField } from '../../runly.purchases/components/SupplierField.jsx'
import { newOperationKey, useSaveDocument } from '../../runly.purchases/hooks/usePurchases.js'
import { quickCreatePayload } from '../lib/purchase-links.js'

const COPY = {
  order: { kind: 'orders', type: 'order', title: 'Crear orden de compra', docTitle: 'Registrar orden de compra', done: 'Orden de compra creada', description: 'Se crea como borrador en Compras, con su expediente. Completa los conceptos y montos desde Compras.' },
  invoice: { kind: 'invoices', type: 'invoice', title: 'Crear factura', docTitle: 'Registrar factura', done: 'Factura creada', description: 'Se crea como borrador en Compras, con su expediente. Completa los conceptos y montos desde Compras.' },
}
const DOC_ERRORS = { DOCUMENTARY_UNAVAILABLE: 'Control documental no está disponible en esta instancia (falta su migración).', DOCUMENTARY_MODE_REQUIRED: 'Compras ya no está en Control documental. Recarga la página.', IDEMPOTENCY_KEY_REUSED: 'Esta operación ya se usó con otros datos. Cierra y vuelve a intentarlo.' }
const labelOf = (doc) => doc.reference ?? doc.number ?? 'Sin folio'

// Minimal create of a purchase order / invoice from the inventory item form.
// Deliberately not a <form>: this dialog renders inside the item form's React
// tree and a nested submit would also submit the item. The item keeps its
// captured data: the link is saved with the item.
// documentary (Compras in Control documental): only the reference is
// required; similar references are offered before creating (never merged);
// POST /purchases/{orders|invoices}/references with a key stable per attempt.
export function InventoryPurchaseQuickCreateDialog({ open, onOpenChange, kind, initialNumber, onCreated, documentary = false }) {
  const copy = COPY[kind] ?? COPY.order
  const save = useSaveDocument(copy.kind)
  const { session } = useAuth()
  const [number, setNumber] = useState('')
  const [supplier, setSupplier] = useState({ id: null, record: null })
  const [issueDate, setIssueDate] = useState('')
  const [error, setError] = useState('')
  const [similar, setSimilar] = useState(null)
  const [busy, setBusy] = useState(false)
  const operationKey = useRef(null)

  useEffect(() => {
    if (open) {
      setNumber(initialNumber ?? ''); setSupplier({ id: null, record: null }); setIssueDate(''); setError(''); setSimilar(null)
      operationKey.current = newOperationKey('inventory-reference')
    }
  }, [open, initialNumber])

  async function createReference() {
    const reference = number.trim()
    setBusy(true)
    try {
      const res = await runly.purchases.createReference(copy.kind, {
        reference, ...(supplier.id ? { supplierId: supplier.id } : {}), ...(issueDate ? { issueDate } : {}), idempotencyKey: operationKey.current,
      }, session?.access_token)
      const doc = res?.data ?? res
      toast.success(`${kind === 'order' ? 'Orden' : 'Factura'} ${labelOf(doc)} registrada`)
      onCreated({ ...doc, supplierName: supplier.record?.name ?? null })
    } catch (err) {
      setError(DOC_ERRORS[err?.details?.code] ?? err?.details?.error ?? err?.message ?? 'No se pudo registrar la referencia.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!documentary) {
      const payload = quickCreatePayload({ number, supplierId: supplier.id, issueDate })
      if (!payload) { setError('Escribe el folio.'); return }
      try {
        const doc = await save.mutateAsync({ data: payload })
        toast.success(copy.done)
        onCreated({ ...doc, supplierName: supplier.record?.name ?? null })
      } catch (err) {
        setError(err?.details?.error ?? err?.message ?? 'No se pudo crear el documento.')
      }
      return
    }
    if (!number.trim()) { setError('Escribe el nombre, código o referencia.'); return }
    if (similar) return createReference()
    // Look for similar references first; the user decides (no automatic merge).
    setBusy(true)
    try {
      const found = await runly.purchases.searchDocuments({ type: copy.type, search: number.trim(), pageSize: 5 }, session?.access_token)
      const rows = (found?.data ?? []).filter((row) => row.status !== 'CANCELLED')
      if (rows.length) { setSimilar(rows); return }
    } catch {
      // Searching is a courtesy: if it fails, creating still works.
    } finally {
      setBusy(false)
    }
    return createReference()
  }

  const pending = busy || save.isPending
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader className="shrink-0" icon={FilePlus2}>
          <DialogTitle>{documentary ? copy.docTitle : copy.title}</DialogTitle>
          <DialogDescription>
            {documentary ? 'Se registra como referencia en Compras, sin importes. Sigues en el activo y lo que capturaste se conserva; la relación se guarda junto con él.' : copy.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <TextField
            id="quick-reference"
            label={documentary ? 'Nombre, código o referencia' : 'Folio'}
            required
            value={number}
            onChange={(event) => { setNumber(event.target.value); setError(''); setSimilar(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }}
            error={error}
            placeholder={documentary ? (kind === 'order' ? 'OC-2485' : 'F-008721') : 'Ej. PVR-0001'}
            maxLength={documentary ? 255 : kind === 'order' ? 40 : 100}
          />
          {similar ? (
            <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-3 text-sm">
              <p className="font-medium">Ya existen referencias parecidas</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Usa una si es el mismo documento; si no, crea una nueva. No se fusionan solas.</p>
              <ul className="mt-2 space-y-1.5" aria-label="Referencias parecidas">
                {similar.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0"><span className="font-semibold">{labelOf(row)}</span>{row.supplierName ? <span className="text-[hsl(var(--muted-foreground))]"> · {row.supplierName}</span> : null}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => onCreated(row)}>Usar esta</Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <SupplierField value={supplier.id} onChange={(id, record) => setSupplier({ id, record })} hint="Opcional." />
          <DatePickerField label={documentary ? 'Fecha del documento' : 'Fecha'} value={issueDate} onChange={setIssueDate}
            hint={documentary ? 'Opcional; si no la conoces, queda sin capturar.' : 'Opcional; por defecto hoy.'} />
        </div>
        <DialogFooter className="shrink-0 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? (documentary ? 'Registrando...' : 'Creando...') : similar ? 'Crear de todos modos' : documentary ? 'Registrar y seleccionar' : 'Crear y seleccionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
