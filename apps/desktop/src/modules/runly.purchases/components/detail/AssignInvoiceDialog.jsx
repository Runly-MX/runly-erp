import { useEffect, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, cn } from '@runly/ui'
import { toast } from 'sonner'
import { useRelationMutations } from '../../hooks/usePurchases.js'
import { MoneyText } from '../MoneyText.jsx'
import { PurchaseStatusBadge } from '../PurchaseStatusBadge.jsx'
import { formatDate } from '../../lib/format.js'

// After assets are related to an order that has several invoices, asks which
// invoice covers them. The order stays linked either way; an invoice is
// optional because some assets are billed later.
export function AssignInvoiceDialog({ open, onOpenChange, order, invoices = [], itemIds = [] }) {
  const { bulk } = useRelationMutations()
  const [invoiceId, setInvoiceId] = useState(null)
  useEffect(() => { if (open) setInvoiceId(invoices.length === 1 ? invoices[0].id : null) }, [open, invoices])
  const count = itemIds.length

  const submit = () => bulk.mutate({ sourceType: 'purchase_invoice', sourceId: invoiceId, targetType: 'inventory_item', targetIds: itemIds }, {
    onSuccess: () => {
      toast.success(`${count === 1 ? 'Activo asignado' : `${count} activos asignados`} a la factura`)
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" scrollable>
        <DialogHeader className="shrink-0" icon={ReceiptText}>
          <DialogTitle>¿A qué factura pertenecen?</DialogTitle>
          <DialogDescription>
            {count === 1 ? 'El activo ya quedó en' : `Los ${count} activos ya quedaron en`} la orden {order?.number}. Elige la factura que {count === 1 ? 'lo cubre' : 'los cubre'}, o hazlo después.
          </DialogDescription>
        </DialogHeader>
        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-0.5" role="listbox" aria-label="Facturas de la orden">
          {invoices.map((invoice) => {
            const active = invoiceId === invoice.id
            return (
              <li key={invoice.id}>
                <button type="button" role="option" aria-selected={active} onClick={() => setInvoiceId(invoice.id)}
                  className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/40',
                    active ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/10' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold tabular-nums">{invoice.number ?? 'Sin folio'}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{invoice.issueDate ? formatDate(invoice.issueDate) : invoice.sublabel ?? ''}</span>
                  </span>
                  {invoice.total != null ? <MoneyText value={invoice.total} currency={invoice.currency} className="text-sm" /> : null}
                  {invoice.status ? <PurchaseStatusBadge kind="invoices" status={invoice.status} /> : null}
                </button>
              </li>
            )
          })}
        </ul>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Ahora no</Button>
          <Button disabled={!invoiceId || bulk.isPending} onClick={submit}>{bulk.isPending ? 'Guardando...' : 'Asignar factura'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
