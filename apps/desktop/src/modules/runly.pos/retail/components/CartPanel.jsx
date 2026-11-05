// apps/desktop/src/modules/runly.pos/retail/components/CartPanel.jsx
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, CurrencyField, NumberStepper, TextField } from '@runly/ui'
import { BadgePercent, Loader2, ShoppingCart, Trash2, Zap } from 'lucide-react'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { activeLines, formatMoney, formatQuantity, itemCount, grossPrice, productInitials, toMoneyString } from '../lib/retailRules.js'

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
  const images = useSellableImages(lines.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-[hsl(var(--foreground))]">Venta actual</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{itemCount(order) === 1 ? '1 artículo' : `${itemCount(order)} artículos`}</p>
          </div>
          {order?.orderNumber && <span className="rounded-sm border border-[hsl(var(--border))] px-2 py-0.5 text-sm font-semibold text-[hsl(var(--muted-foreground))]">#{order.orderNumber}</span>}
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
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 py-8 text-center text-[hsl(var(--muted-foreground))]">
            <span className="flex h-14 w-14 items-center justify-center rounded-md bg-[hsl(var(--muted))]"><ShoppingCart className="h-6 w-6" aria-hidden="true" /></span>
            <p className="max-w-56 text-sm">Escanea o toca un producto para empezar la venta.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]" aria-label="Artículos de la venta">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-3 py-3">
                <LineThumb line={line} src={images[line.productId]} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[hsl(var(--foreground))]">{line.productName}</p>
                      <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{line.variantLabel ? `${line.variantLabel} · ` : ''}{money(grossPrice(line.unitPrice, line.taxRate, line.taxIncluded))} c/u{Number(line.discountAmount) > 0 ? ` · −${money(line.discountAmount)}` : ''}</p>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-[hsl(var(--foreground))]">{money(line.totalAmount)}</span>
                  </div>
                  <div className="flex items-center gap-1">
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
                      <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-10 sm:w-10" onClick={() => setDiscountFor(line)} disabled={busy} aria-label={`Descuento en ${line.productName}`} title="Descuento">
                        <BadgePercent className="h-5 w-5" aria-hidden="true" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-[hsl(var(--muted-foreground))] hover:text-red-700 sm:h-10 sm:w-10" onClick={() => sale.removeLine(line)} disabled={busy || paid} aria-label={`Quitar ${line.productName}`} title="Quitar">
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-[hsl(var(--border))]">
        {/* Customer display: the figure the cashier reads out, on the POS band. */}
        <div className="bg-(--pos-band) px-4 py-3 text-(--pos-band-foreground)">
          {order && lines.length > 0 && (
            <dl className="space-y-0.5 text-sm text-(--pos-band-muted)">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotalAmount)}</dd></div>
              {Number(order.discountAmount) > 0 && <div className="flex justify-between"><dt>Descuentos</dt><dd>−{money(order.discountAmount)}</dd></div>}
              <div className="flex justify-between"><dt>Impuestos</dt><dd>{money(order.taxAmount)}</dd></div>
              {paid && <div className="flex justify-between"><dt>Ya cobrado</dt><dd>{money(order.paidAmount)}</dd></div>}
            </dl>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-2" aria-live="polite">
            <span className="text-sm font-bold uppercase tracking-wide text-(--pos-band-accent)">{paid ? 'Por cobrar' : 'Total'}</span>
            <span className={busy ? 'text-4xl font-bold opacity-60' : 'text-4xl font-bold'}>{money(paid ? order.remainingAmount : order?.totalAmount ?? 0)}</span>
          </div>
          {busy && <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-(--pos-band-muted)"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />{pending}...</p>}
        </div>
        <div className="flex gap-2 p-3">
          {lines.length > 0 && !paid && (
            <Button variant="outline" size="lg" className="h-14" onClick={() => setConfirmClear(true)} disabled={busy}>Vaciar</Button>
          )}
          <Button size="lg" className="h-14 flex-1 text-lg font-bold disabled:bg-[hsl(var(--muted))] disabled:text-[hsl(var(--muted-foreground))] disabled:opacity-100" onClick={onCharge} disabled={!canCharge}>
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

// Product photos already loaded by the product grid, so the cart needs no
// extra request. Re-read when the number of lines changes.
function useSellableImages(lineCount) {
  const queryClient = useQueryClient()
  return useMemo(() => {
    const map = {}
    for (const [, data] of queryClient.getQueriesData({ queryKey: ['pos-retail-sellables'] })) {
      for (const page of data?.pages ?? []) for (const item of page?.data ?? []) if (item.imageUrl && !map[item.productId]) map[item.productId] = item.imageUrl
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, lineCount])
}

function LineThumb({ line, src }) {
  const box = 'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md'
  if (line.customItem) return <span className={`${box} bg-(--brand-primary)/10 text-(--brand-primary)`}><Zap className="h-6 w-6" aria-hidden="true" /></span>
  if (src) return <img src={src} alt="" className={`${box} object-cover`} loading="lazy" />
  return <span aria-hidden="true" className={`${box} bg-[hsl(var(--muted))] text-sm font-bold text-[hsl(var(--muted-foreground))]`}>{productInitials(line.productName)}</span>
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
