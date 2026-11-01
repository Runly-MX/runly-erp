// apps/desktop/src/modules/runly.pos/retail/components/SaleCompletePanel.jsx
import { useEffect, useRef } from 'react'
import { Button } from '@runly/ui'
import { CircleCheck, Receipt } from 'lucide-react'
import { formatMoney } from '../lib/retailRules.js'

// Replaces the cart once the server confirms the order is PAID. Every figure
// comes from the payment response: applied amount, cash received and the
// change to hand back (payment.changeAmount).
export default function SaleCompletePanel({ result, methods, onReceipt, onNext }) {
  const nextRef = useRef(null)
  const { payment, order } = result
  const money = (v) => formatMoney(v, order.currency)
  const method = methods.find((m) => m.id === payment.paymentMethodId)
  const change = payment.changeAmount !== null && payment.changeAmount !== undefined ? payment.changeAmount : null

  useEffect(() => { nextRef.current?.focus() }, [])

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <CircleCheck className="h-10 w-10 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
        <div>
          <p className="text-xl font-bold text-[hsl(var(--foreground))]">Venta cobrada</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Orden #{order.orderNumber}</p>
        </div>
      </div>
      {change !== null && (
        <div className="rounded-2xl bg-[hsl(var(--muted))] p-4">
          <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Cambio a entregar</p>
          <p className="text-5xl font-extrabold tabular-nums text-[hsl(var(--foreground))]">{money(change)}</p>
        </div>
      )}
      <dl className="space-y-1.5 text-base">
        <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Total</dt><dd className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{money(order.totalAmount)} {order.currency}</dd></div>
        <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Método</dt><dd className="font-semibold text-[hsl(var(--foreground))]">{method?.name ?? '—'}</dd></div>
        <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Pago aplicado</dt><dd className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{money(payment.amount)}</dd></div>
        {payment.tenderedAmount !== null && payment.tenderedAmount !== undefined && (
          <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Efectivo recibido</dt><dd className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{money(payment.tenderedAmount)}</dd></div>
        )}
      </dl>
      <span className="flex-1" />
      <div className="space-y-2">
        {result.receiptId && (
          <Button variant="outline" size="lg" className="h-14 w-full text-base" onClick={onReceipt}>
            <Receipt className="h-5 w-5" aria-hidden="true" />Ver o imprimir comprobante
          </Button>
        )}
        <Button ref={nextRef} size="lg" className="h-14 w-full text-lg font-bold" onClick={onNext}>Nueva venta</Button>
      </div>
    </div>
  )
}
