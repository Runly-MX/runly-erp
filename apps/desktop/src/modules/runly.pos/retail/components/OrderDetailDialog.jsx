// apps/desktop/src/modules/runly.pos/retail/components/OrderDetailDialog.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, ErrorState, Skeleton, StatusPill, TextareaField } from '@runly/ui'
import { Ban, Receipt, ReceiptText, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { usePosCommand } from '../hooks/usePosCommand.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { ORDER_STATUS_META, formatMoney, formatQuantity } from '../lib/retailRules.js'
import ReceiptDialog from './ReceiptDialog.jsx'
import RefundDialog from './RefundDialog.jsx'

function when(value) {
  try { return new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return '' }
}

export default function OrderDetailDialog({ orderId, token, companyId, userProfile, capabilities, methods, outlets = [], onClose, onChanged }) {
  const [sub, setSub] = useState(null)
  const query = useQuery({
    queryKey: ['pos-retail-order-detail', orderId, token],
    queryFn: () => runly.commerce.getOrder(orderId, token),
    enabled: Boolean(token && orderId),
  })
  const order = query.data?.data
  const money = (v) => formatMoney(v, order?.currency)
  const can = (key) => Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes(key))
  const meta = order ? ORDER_STATUS_META[order.status] ?? { label: order.status, tone: 'neutral' } : null
  const netPaid = Number(order?.netPaidAmount ?? 0)
  const restaurant = order?.experience === 'RESTAURANT'
  const canCancel = ['DRAFT', 'OPEN', 'SENT', 'PARTIALLY_SERVED', 'SERVED'].includes(order?.status) && can('pos.orders.cancel')
  const canRefund = capabilities.refund && netPaid > 0 && !['CANCELLED', 'REFUNDED'].includes(order.status) && !order.historicalCurrencyUnknown
  const methodName = (id) => methods.find((m) => m.id === id)?.name ?? 'Pago'
  const changed = () => { query.refetch(); onChanged() }

  return (
    <>
      <Dialog open={!sub} onOpenChange={(v) => !v && onClose()}>
        <DialogContent size="xl" scrollable className="p-0 md:p-0">
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={ReceiptText}>
              <DialogTitle>{order ? (restaurant ? `${order.table?.name ?? 'Cuenta'} · cuenta #${order.orderNumber}` : `Venta #${order.orderNumber}`) : 'Orden'}</DialogTitle>
              <DialogDescription>{order ? [when(order.openedAt), outlets.find((o) => o.id === order.outletId)?.name, restaurant && order.waiterName ? `Mesero: ${order.waiterName}` : null].filter(Boolean).join(' · ') : 'Cargando...'}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {query.isPending ? <Skeleton className="h-64" /> : query.isError ? (
              <ErrorState title="No se pudo abrir la venta" description={classifyPosError(query.error).message} onRetry={query.refetch} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                  {order.refundStatus !== 'NONE' && <StatusPill tone="warning">{order.refundStatus === 'FULL' ? 'Devuelta completa' : 'Devolución parcial'}</StatusPill>}
                  {order.historicalCurrencyUnknown && <StatusPill tone="warning">Moneda histórica desconocida: sólo consulta</StatusPill>}
                </div>
                <section aria-label="Artículos">
                  <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Artículos</h3>
                  <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]">
                    {(order.lines ?? []).filter((l) => !l.voided).map((l) => (
                      <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-semibold text-[hsl(var(--foreground))]">{l.productName}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</span>
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{formatQuantity(l.quantity)} × {money(l.unitPrice)}{Number(l.returnedQuantity) > 0 ? ` · devuelto ${formatQuantity(l.returnedQuantity)}` : ''}</span>
                          {l.note && <span className="block text-xs text-[hsl(var(--muted-foreground))]">Nota: {l.note}</span>}
                        </span>
                        <span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{money(l.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Impuestos</dt><dd className="tabular-nums">{money(order.taxAmount)}</dd></div>
                    <div className="flex justify-between font-bold text-[hsl(var(--foreground))]"><dt>Total</dt><dd className="tabular-nums">{money(order.totalAmount)} {order.currency}</dd></div>
                    <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Cobrado</dt><dd className="tabular-nums">{money(order.paidAmount)}</dd></div>
                    {Number(order.refundedAmount) > 0 && <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Devuelto</dt><dd className="tabular-nums">{money(order.refundedAmount)}</dd></div>}
                  </dl>
                </section>
                {(order.payments ?? []).length > 0 && (
                  <section aria-label="Pagos">
                    <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Pagos</h3>
                    <ul className="space-y-1 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                      {order.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap justify-between gap-2">
                          <span className="text-[hsl(var(--foreground))]">{methodName(p.paymentMethodId)}{p.reference ? ` · ref. ${p.reference}` : ''}</span>
                          <span className="tabular-nums text-[hsl(var(--foreground))]">{money(p.amount)}{p.tenderedAmount ? ` · recibido ${money(p.tenderedAmount)} · cambio ${money(p.changeAmount)}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {(order.receipts ?? []).length > 0 && (
                  <section aria-label="Comprobantes">
                    <h3 className="mb-2 text-sm font-semibold text-[hsl(var(--foreground))]">Comprobantes</h3>
                    <ul className="flex flex-wrap gap-2">
                      {order.receipts.map((r) => (
                        <li key={r.id}>
                          <Button variant="outline" onClick={() => setSub({ kind: 'receipt', id: r.id })}>
                            <Receipt className="h-4 w-4" aria-hidden="true" />{r.kind === 'REFUND' ? 'Devolución' : r.kind === 'REPRINT' ? 'Copia' : 'Venta'} #{r.receiptNumber}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="outline" size="lg" onClick={onClose}>Cerrar</Button>
            {canCancel && <Button variant="outline" size="lg" className="text-red-800 dark:text-red-300" onClick={() => setSub({ kind: 'cancel' })}><Ban className="h-4 w-4" aria-hidden="true" />Cancelar venta</Button>}
            {canRefund && <Button size="lg" onClick={() => setSub({ kind: 'refund' })}><Undo2 className="h-4 w-4" aria-hidden="true" />Devolver</Button>}
          </div>
        </DialogContent>
      </Dialog>

      {sub?.kind === 'receipt' && <ReceiptDialog receiptId={sub.id} token={token} onClose={() => setSub(null)} />}
      {sub?.kind === 'cancel' && order && (
        <CancelDialog order={order} token={token} onClose={() => setSub(null)} onDone={() => { setSub(null); toast.success('Venta cancelada'); changed() }} onRefundInstead={() => setSub({ kind: 'refund' })} />
      )}
      {sub?.kind === 'refund' && order && (
        <RefundDialog order={order} token={token} companyId={companyId} userId={userProfile?.id} methods={methods} onClose={() => { setSub(null); changed() }} onReceipt={(id) => setSub({ kind: 'receipt', id })} />
      )}
    </>
  )
}

function CancelDialog({ order, token, onClose, onDone, onRefundInstead }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const command = usePosCommand({
    prefix: 'pos-cancel', scope:order.id,
    run: (body, options) => runly.commerce.cancel(order.id, body, token, options),
    onSuccess: onDone,
  })
  const refundRequired = command.failure?.code === 'REFUND_REQUIRED'
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && !command.isPending && onClose()}
      icon={Ban}
      tone="destructive"
      title={`Cancelar ${order.experience === 'RESTAURANT' ? 'cuenta' : 'venta'} #${order.orderNumber}`}
      description="La venta queda cancelada y no se puede cobrar. No hay pagos que devolver."
      size="md"
      onSubmit={() => {
        if (!reason.trim()) { setError('Escribe el motivo de la cancelación.'); return }
        setError('')
        command.mutate({ expectedVersion: order.version, reason: reason.trim() })
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Volver</Button>
          {refundRequired
            ? <Button type="button" size="lg" onClick={onRefundInstead}>Devolver lo cobrado</Button>
            : <Button type="submit" variant="destructive" size="lg" loading={command.isPending} disabled={command.failure?.kind === 'lost'}>Cancelar venta</Button>}
        </>
      )}
    >
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
      <TextareaField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={error} rows={3} maxLength={500} />
    </FormDialog>
  )
}
