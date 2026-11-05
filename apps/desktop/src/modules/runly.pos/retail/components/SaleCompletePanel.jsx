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
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CircleCheck className="h-11 w-11" aria-hidden="true" />
        </span>
        <p className="text-2xl font-bold text-[hsl(var(--foreground))]">Venta cobrada</p>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Orden #{order.orderNumber}</p>
      </div>
      {change !== null && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Cambio a entregar</p>
          <p className="text-5xl font-extrabold tabular-nums text-emerald-900 dark:text-emerald-100">{money(change)}</p>
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
