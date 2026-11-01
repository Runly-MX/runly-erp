// apps/desktop/src/modules/runly.pos/retail/components/CartPanel.jsx
import { useState } from 'react'
import { Button, ConfirmDialog, CurrencyField, NumberStepper, TextField } from '@runly/ui'
import { BadgePercent, Loader2, ShoppingCart, Trash2 } from 'lucide-react'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { activeLines, formatMoney, formatQuantity, itemCount, toMoneyString } from '../lib/retailRules.js'

// Current sale as the server returned it: lines, quantities and totals come
// from the last OrderDTO. While a command runs the totals read "Actualizando"
// and Cobrar waits for the current version.
export default function CartPanel({ sale, currency, canDiscount, onCharge, compact = false }) {
  const { order, pending, failure } = sale
  const lines = activeLines(order)
  const [confirmClear, setConfirmClear] = useState(false)
  const [discountFor, setDiscountFor] = useState(null)
  const busy = Boolean(pending)
  const money = (v) => formatMoney(v, order?.currency ?? currency)
  const paid = Number(order?.paidAmount ?? 0) > 0
  const canCharge = Boolean(order) && lines.length > 0 && !busy && !failure && Number(order.remainingAmount) > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
          <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">Venta actual</h2>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{itemCount(order)} artículo(s){order?.orderNumber ? ` · #${order.orderNumber}` : ''}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {failure && (
          <CommandFailureAlert
            failure={failure}
            onRetry={sale.retry}
            retrying={busy}
            className="my-3"
          />
        )}
        {failure && failure.kind !== 'lost' && (
          <div className="mb-3 flex gap-2"><Button variant="outline" size="lg" onClick={sale.dismissFailure}>Entendido</Button></div>
        )}
        {failure?.kind === 'lost' && (
          <div className="mb-3 flex gap-2"><Button variant="ghost" size="lg" onClick={sale.reload}>Recargar la venta</Button></div>
        )}
        {lines.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 py-8 text-center text-[hsl(var(--muted-foreground))]">
            <ShoppingCart className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm">Escanea o toca un producto para empezar.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Artículos de la venta">
            {lines.map((line) => (
              <li key={line.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[hsl(var(--foreground))]">{line.productName}</p>
                    {line.variantLabel && <p className="text-sm text-[hsl(var(--muted-foreground))]">{line.variantLabel}</p>}
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{money(line.unitPrice)} c/u{Number(line.discountAmount) > 0 ? ` · descuento ${money(line.discountAmount)}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-base font-bold tabular-nums text-[hsl(var(--foreground))]">{money(line.totalAmount)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <NumberStepper
                    value={Number(line.quantity)}
                    onChange={(q) => q !== Number(line.quantity) && sale.setQuantity(line, q)}
                    min={1}
                    max={9999}
                    label={`Cantidad de ${line.productName}`}
                    disabled={busy || paid}
                  />
                  <span className="sr-only">{formatQuantity(line.quantity)} unidades</span>
                  <span className="flex-1" />
                  {canDiscount && !paid && (
                    <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" onClick={() => setDiscountFor(line)} disabled={busy} aria-label={`Descuento en ${line.productName}`} title="Descuento">
                      <BadgePercent className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" onClick={() => sale.removeLine(line)} disabled={busy || paid} aria-label={`Quitar ${line.productName}`} title="Quitar">
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-[hsl(var(--border))] px-4 py-3">
        {order && lines.length > 0 && (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Subtotal</dt><dd className="tabular-nums">{money(order.subtotalAmount)}</dd></div>
            {Number(order.discountAmount) > 0 && <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Descuentos</dt><dd className="tabular-nums">−{money(order.discountAmount)}</dd></div>}
            <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Impuestos</dt><dd className="tabular-nums">{money(order.taxAmount)}</dd></div>
            {paid && <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Ya cobrado</dt><dd className="tabular-nums">{money(order.paidAmount)}</dd></div>}
          </dl>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-bold text-[hsl(var(--foreground))]">{paid ? 'Por cobrar' : 'Total'}</span>
          <span className="text-3xl font-extrabold tabular-nums text-[hsl(var(--foreground))]" aria-live="polite">
            {busy ? <span className="inline-flex items-center gap-2 text-base font-semibold text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Actualizando</span>
              : `${money(paid ? order.remainingAmount : order?.totalAmount ?? 0)}`}
          </span>
        </div>
        {busy && <p className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">{pending}...</p>}
        <div className="flex gap-2">
          {lines.length > 0 && !paid && (
            <Button variant="outline" size="lg" className="h-14" onClick={() => setConfirmClear(true)} disabled={busy}>Vaciar</Button>
          )}
          <Button size="lg" className="h-14 flex-1 text-lg font-bold" onClick={onCharge} disabled={!canCharge}>
            Cobrar {canCharge ? money(order.remainingAmount) : ''}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        icon={Trash2}
        tone="destructive"
        title="Vaciar la venta"
        description="Se quitan todos los artículos. No se cobró nada."
        confirmLabel="Vaciar"
        onConfirm={() => { setConfirmClear(false); sale.clear() }}
      />
      {discountFor && (
        <DiscountDialog
          line={discountFor}
          currency={order?.currency ?? currency}
          onClose={() => setDiscountFor(null)}
          onApply={(amount, reason) => { setDiscountFor(null); sale.discountLine(discountFor, amount, reason) }}
        />
      )}
    </div>
  )
}

function DiscountDialog({ line, currency, onClose, onApply }) {
  const [amount, setAmount] = useState(Number(line.discountAmount ?? 0))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={BadgePercent}
      title={`Descuento en ${line.productName}`}
      description="El servidor recalcula el total y el impuesto de la línea."
      size="md"
      onSubmit={() => {
        if (!reason.trim()) { setError('Escribe el motivo del descuento.'); return }
        onApply(toMoneyString(amount) ?? '0.00', reason.trim())
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg">Aplicar descuento</Button>
        </>
      )}
    >
      <CurrencyField label="Descuento en la línea" value={amount} onChange={setAmount} currency={currency} min={0} hint="Importe total a descontar de esta línea. Cero lo quita." />
      <TextField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={error} maxLength={500} icon={null} />
    </FormDialog>
  )
}
