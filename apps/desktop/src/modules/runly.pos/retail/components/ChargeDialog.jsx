// apps/desktop/src/modules/runly.pos/retail/components/ChargeDialog.jsx
import { useState } from 'react'
import { Button, CurrencyField, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, TextField, cn } from '@runly/ui'
import { Banknote, CreditCard, Landmark, Loader2 } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import { usePosCommand } from '../hooks/usePosCommand.js'
import { changePreview, formatMoney, tenderSuggestions, toMoneyString } from '../lib/retailRules.js'

const KIND_ICON = { CASH: Banknote, CARD: CreditCard, TRANSFER: Landmark }

// C3 payment. "Importe a aplicar" (amount) and "Efectivo recibido"
// (tenderedAmount) are separate controls; change shown while typing is a
// preview and the confirmed figure is payment.changeAmount. While
// processing the dialog cannot be dismissed; a lost response retries with
// the same key and the server replays the confirmed payment.
// Restaurant splits pass allocations (+ the amount they add up to): the amount
// is then locked and the server attributes the payment to those lines.
export default function ChargeDialog({ order, sessionId, token, methods, onPaid, onPartial, onClose, onConflict, allocations, fixedAmount, title }) {
  const usable = methods.filter((m) => ['CASH', 'CARD', 'TRANSFER'].includes(m.kind))
  const [methodId, setMethodId] = useState(() => (usable.find((m) => m.kind === 'CASH') ?? usable[0])?.id ?? null)
  const [amount, setAmount] = useState(Number(fixedAmount ?? order.remainingAmount))
  const [tendered, setTendered] = useState(Number(fixedAmount ?? order.remainingAmount))
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState({})
  const method = usable.find((m) => m.id === methodId)
  const cash = method?.kind === 'CASH'
  const currency = order.currency
  const money = (v) => formatMoney(v, currency)

  const command = usePosCommand({
    prefix: 'pos-pay', scope:order.id, sessionId, terminalId:order.terminalId,
    run: (body, options) => runly.commerce.addPayment(order.id, body, token, options),
    onSuccess: (res) => {
      const result = res.data
      if (result.order.status === 'PAID') onPaid(result)
      else {
        onPartial(result.order)
        setAmount(Number(result.order.remainingAmount))
        setTendered(Number(result.order.remainingAmount))
        setReference('')
      }
    },
    onError: (info) => { if (info.kind === 'conflict') onConflict?.() },
  })
  const processing = command.isPending

  function submit() {
    const applied = toMoneyString(amount)
    const next = {}
    if (!method) next.method = 'Elige cómo paga el cliente.'
    if (!applied || Number(applied) <= 0) next.amount = 'El importe a aplicar debe ser mayor que cero.'
    else if (Number(applied) > Number(order.remainingAmount)) next.amount = `No puede ser mayor que lo pendiente (${money(order.remainingAmount)}).`
    if (cash && Number(tendered) < Number(applied)) next.tendered = 'El efectivo recibido no alcanza para el importe a aplicar.'
    if (method?.requiresReference && !reference.trim()) next.reference = 'Este método requiere la referencia de la operación.'
    setErrors(next)
    if (Object.keys(next).length) return
    command.mutate({
      expectedVersion: order.version,
      paymentMethodId: method.id,
      sessionId,
      amount: applied,
      ...(allocations?.length ? { allocations } : {}),
      ...(cash ? { tenderedAmount: toMoneyString(tendered) } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    })
  }

  const preview = cash ? changePreview(amount, tendered) : null
  const partialPayments = (order.payments ?? []).filter((p) => p.status === 'CAPTURED')

  return (
    <Dialog open onOpenChange={(v) => !v && !processing && onClose()}>
      <DialogContent size="lg" scrollable className="p-0 md:p-0" onEscapeKeyDown={(e) => processing && e.preventDefault()} onInteractOutside={(e) => processing && e.preventDefault()}>
        <form onSubmit={(e) => { e.preventDefault(); if (!processing) submit() }} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={Banknote}>
              <DialogTitle>{title ?? `Cobrar venta${order.orderNumber ? ` #${order.orderNumber}` : ''}`}</DialogTitle>
              <DialogDescription>Por cobrar <strong className="text-[hsl(var(--foreground))]">{money(order.remainingAmount)} {currency}</strong></DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={processing} />
            {partialPayments.length > 0 && (
              <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                <p className="font-semibold text-[hsl(var(--foreground))]">Pagos ya aplicados</p>
                <ul className="mt-1 space-y-0.5 text-[hsl(var(--muted-foreground))]">
                  {partialPayments.map((p) => <li key={p.id} className="flex justify-between"><span>{methods.find((m) => m.id === p.paymentMethodId)?.name ?? 'Pago'}</span><span className="tabular-nums">{money(p.amount)}</span></li>)}
                </ul>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]" id="pay-method">Método</p>
              {usable.length === 0 ? (
                <p className="text-sm font-medium text-red-800 dark:text-red-300">No hay métodos de pago configurados. Pide a un administrador que los agregue.</p>
              ) : (
                <div role="radiogroup" aria-labelledby="pay-method" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {usable.map((m) => {
                    const Icon = KIND_ICON[m.kind] ?? Banknote
                    const active = m.id === methodId
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={processing}
                        onClick={() => { setMethodId(m.id); setErrors({}) }}
                        className={cn('flex h-14 items-center justify-center gap-2 rounded-xl border px-3 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                          active ? 'border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]')}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />{m.name}
                      </button>
                    )
                  })}
                </div>
              )}
              {errors.method && <p role="alert" className="text-sm font-semibold text-red-800 dark:text-red-300">{errors.method}</p>}
            </div>

            <CurrencyField label="Importe a aplicar" value={amount} onChange={setAmount} currency={currency} min={0} error={errors.amount} disabled={processing || Boolean(fixedAmount)}
              hint={Number(amount) < Number(order.remainingAmount) ? 'Pago parcial: quedará saldo pendiente.' : 'Lo que se abona a la venta.'} className="h-14 text-xl font-bold" />

            {cash ? (
              <div className="space-y-3">
                <CurrencyField label="Efectivo recibido" value={tendered} onChange={setTendered} currency={currency} min={0} error={errors.tendered} disabled={processing} className="h-14 text-xl font-bold" />
                <div className="flex flex-wrap gap-2" aria-label="Importes rápidos">
                  {tenderSuggestions(amount).map((value, i) => (
                    <Button key={value} type="button" variant="outline" size="lg" className="h-12 min-w-24 text-base font-semibold" disabled={processing} onClick={() => setTendered(Number(value))}>
                      {i === 0 ? 'Exacto' : money(value)}
                    </Button>
                  ))}
                </div>
                <div className="flex items-baseline justify-between rounded-xl bg-[hsl(var(--muted))] px-4 py-3">
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Cambio (vista previa)</span>
                  <span className="text-2xl font-extrabold tabular-nums text-[hsl(var(--foreground))]">{preview !== null ? money(preview) : '—'}</span>
                </div>
              </div>
            ) : method ? (
              <div className="space-y-3">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Registra un pago ya realizado en la terminal bancaria o por transferencia. No hay cambio.</p>
                <TextField label={method.requiresReference ? 'Referencia' : 'Referencia (opcional)'} required={method.requiresReference} value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} maxLength={120} disabled={processing} icon={null} />
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose} disabled={processing}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-14 min-w-56 text-lg font-bold" disabled={processing || !method || command.failure?.kind === 'lost'}>
              {processing ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Procesando pago</> : `Confirmar pago ${toMoneyString(amount) ? money(toMoneyString(amount)) : ''}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
