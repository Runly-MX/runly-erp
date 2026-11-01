// apps/desktop/src/modules/runly.pos/retail/components/RefundDialog.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CurrencyField, ErrorState, NumberStepper, Skeleton, StatusPill, Switch, TextField, TextareaField } from '@runly/ui'
import { CircleCheck, Info, PackageCheck, PackageX, Undo2 } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { usePosCommand } from '../hooks/usePosCommand.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { formatMoney, formatQuantity, selectionKey, toMoneyString } from '../lib/retailRules.js'

function savedSelection(userId, companyId) {
  try { return JSON.parse(localStorage.getItem(selectionKey(userId, companyId)) ?? 'null') ?? {} } catch { return {} }
}

// C4 refund with the D29 preview: choose lines and quantities, the server
// computes amounts, tax and the split per original payment, then the
// refund is confirmed into the open register of the same outlet. The result
// says whether stock was restored.
export default function RefundDialog({ order, token, companyId, userId, methods, onClose, onReceipt }) {
  const advance = order.status !== 'PAID'
  const lines = (order.lines ?? []).filter((l) => !l.voided && Number(l.quantity) - Number(l.returnedQuantity ?? 0) > 0)
  const [step, setStep] = useState('select')
  const [picks, setPicks] = useState(() => Object.fromEntries(lines.map((l) => [l.id, { quantity: 0, restock: true }])))
  const [amount, setAmount] = useState(Number(order.netPaidAmount))
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [references, setReferences] = useState({})
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(null)
  const money = (v) => formatMoney(v, order.currency)
  const selection = savedSelection(userId, companyId)
  const sameOutlet = selection.outletId === order.outletId && selection.terminalId

  const sessionQuery = useQuery({
    queryKey: ['pos-retail-refund-session', selection.outletId, selection.terminalId, token],
    queryFn: () => runly.commerce.currentSession({ outletId: selection.outletId, terminalId: selection.terminalId }, token),
    enabled: Boolean(token && sameOutlet),
  })
  const session = sessionQuery.data?.data ?? null

  const command = usePosCommand({
    prefix: 'pos-refund',
    run: (body, options) => runly.commerce.refund(order.id, body, token, options),
    onSuccess: (res) => { setDone(res.data); setStep('done') },
  })

  const chosen = lines.filter((l) => picks[l.id]?.quantity > 0).map((l) => ({ orderLineId: l.id, quantity: String(picks[l.id].quantity), restock: picks[l.id].restock }))

  async function calculate() {
    setPreviewError(null)
    if (!advance && !chosen.length) { setErrors({ lines: 'Elige al menos un artículo y su cantidad.' }); return }
    setErrors({})
    try {
      const body = { expectedVersion: order.version, lines: advance ? [] : chosen, ...(advance ? { amount: toMoneyString(amount) } : {}) }
      setPreview((await runly.commerce.refundPreview(order.id, body, token)).data)
      setStep('confirm')
    } catch (error) {
      setPreviewError(classifyPosError(error).message)
    }
  }

  function confirm() {
    const pays = (preview.payments ?? []).filter((p) => Number(p.amount) > 0)
    const next = {}
    if (!reason.trim()) next.reason = 'Escribe el motivo de la devolución.'
    pays.forEach((p) => { if (p.requiresReference && !references[p.paymentId]?.trim()) next[`ref-${p.paymentId}`] = 'Escribe la referencia de la devolución en la terminal o banco.' })
    setErrors(next)
    if (Object.keys(next).length) return
    command.mutate({
      expectedVersion: preview.expectedVersion,
      reason: reason.trim(),
      sessionId: session.id,
      lines: advance ? [] : chosen,
      payments: pays.map((p) => ({ paymentId: p.paymentId, amount: p.amount, ...(references[p.paymentId]?.trim() ? { reference: references[p.paymentId].trim() } : {}) })),
    })
  }

  const blocked = !sameOutlet ? 'Para devolver, abre en Caja la caja de la sucursal donde se hizo la venta.' : sessionQuery.isSuccess && !session ? 'La caja seleccionada está cerrada. Ábrela antes de devolver.' : null

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && !command.isPending && onClose()}
      icon={step === 'done' ? CircleCheck : Undo2}
      title={step === 'done' ? 'Devolución registrada' : `Devolver venta #${order.orderNumber}`}
      description={step === 'select' ? (advance ? 'Devuelve un anticipo de una venta que todavía no se pagó completa.' : 'Elige qué regresa el cliente. El importe lo calcula el servidor.') : step === 'confirm' ? 'Revisa el importe calculado y confirma.' : null}
      size="lg"
      onSubmit={() => (step === 'select' ? calculate() : step === 'confirm' ? confirm() : onClose())}
      footer={(
        <>
          {step === 'confirm' && <Button type="button" variant="outline" size="lg" onClick={() => setStep('select')} disabled={command.isPending}>Cambiar artículos</Button>}
          {step !== 'done' && <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Cancelar</Button>}
          {step === 'done' && done?.receiptId && <Button type="button" variant="outline" size="lg" onClick={() => onReceipt(done.receiptId)}>Ver comprobante</Button>}
          <Button type="submit" size="lg" loading={command.isPending} disabled={Boolean(blocked) && step !== 'done' || (step === 'confirm' && (!session || command.failure?.kind === 'lost'))}>
            {step === 'select' ? 'Calcular devolución' : step === 'confirm' ? `Devolver ${money(preview?.totalAmount)}` : 'Terminar'}
          </Button>
        </>
      )}
    >
      {blocked && step !== 'done' && <p role="status" className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-200"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{blocked}</p>}
      {step === 'select' && (
        advance ? (
          <CurrencyField label="Importe a devolver" value={amount} onChange={setAmount} currency={order.currency} min={0} hint={`Cobrado: ${money(order.netPaidAmount)}`} />
        ) : (
          <>
            {errors.lines && <p role="alert" className="text-sm font-semibold text-red-800 dark:text-red-300">{errors.lines}</p>}
            {previewError && <p role="alert" className="text-sm font-semibold text-red-800 dark:text-red-300">{previewError}</p>}
            <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))]" aria-label="Artículos a devolver">
              {lines.map((l) => {
                const max = Number(l.quantity) - Number(l.returnedQuantity ?? 0)
                const pick = picks[l.id]
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[hsl(var(--foreground))]">{l.productName}{l.variantLabel ? ` · ${l.variantLabel}` : ''}</span>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">Se puede devolver hasta {formatQuantity(max)}</span>
                    </span>
                    <NumberStepper value={pick.quantity} min={0} max={Math.floor(max)} onChange={(q) => setPicks((p) => ({ ...p, [l.id]: { ...p[l.id], quantity: q } }))} label={`Cantidad a devolver de ${l.productName}`} />
                    <label className="flex min-h-11 items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                      <Switch checked={pick.restock} onCheckedChange={(v) => setPicks((p) => ({ ...p, [l.id]: { ...p[l.id], restock: v } }))} aria-label={`Regresar ${l.productName} a existencias`} className="data-[state=checked]:bg-(--brand-primary-text) dark:data-[state=checked]:bg-(--brand-primary-on-dark)" />
                      Regresar a existencias
                    </label>
                  </li>
                )
              })}
            </ul>
          </>
        )
      )}
      {step === 'confirm' && preview && (
        <>
          <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
          {!advance && (
            <ul className="space-y-1 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
              {preview.lines.map((pl) => {
                const line = lines.find((l) => l.id === pl.orderLineId)
                return (
                  <li key={pl.orderLineId} className="space-y-0.5">
                    <div className="flex justify-between gap-2"><span className="text-[hsl(var(--foreground))]">{formatQuantity(pl.quantity)} × {line?.productName}</span><span className="tabular-nums text-[hsl(var(--foreground))]">{money(pl.amount)}</span></div>
                    {pl.restock && !pl.stockRestorable && <p className="text-xs text-amber-900 dark:text-amber-300">{pl.stockMessage ?? 'No se repondrán existencias para este artículo.'}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>Impuestos incluidos</dt><dd className="tabular-nums">{money(preview.taxAmount)}</dd></div>
            <div className="flex justify-between text-lg font-bold text-[hsl(var(--foreground))]"><dt>Total a devolver</dt><dd className="tabular-nums">{money(preview.totalAmount)}</dd></div>
          </dl>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">Se devuelve por</p>
            {preview.payments.filter((p) => Number(p.amount) > 0).map((p) => (
              <div key={p.paymentId} className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                <div className="flex justify-between"><span className="text-[hsl(var(--foreground))]">{methods.find((m) => m.id === p.paymentMethodId)?.name ?? p.kind}</span><span className="font-semibold tabular-nums text-[hsl(var(--foreground))]">{money(p.amount)}</span></div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Máximo devolvible en este pago: {money(p.maxRefundable)}{p.kind === 'CASH' ? '. Sale efectivo de la caja abierta.' : ''}</p>
                {p.requiresReference && <TextField label="Referencia de la devolución" required value={references[p.paymentId] ?? ''} onChange={(e) => setReferences((r) => ({ ...r, [p.paymentId]: e.target.value }))} error={errors[`ref-${p.paymentId}`]} maxLength={120} icon={null} />}
              </div>
            ))}
          </div>
          <TextareaField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} rows={2} maxLength={500} />
        </>
      )}
      {step === 'confirm' && sessionQuery.isPending && sameOutlet && <Skeleton className="h-6" />}
      {step === 'done' && done && (
        <div className="space-y-3">
          <p className="text-lg font-bold text-[hsl(var(--foreground))]">Entrega {money(done.refund.amount)} al cliente</p>
          <ul className="space-y-1 text-sm">
            {(done.refund.lines ?? []).map((l) => {
              const line = lines.find((x) => x.id === l.orderLineId)
              return (
                <li key={l.orderLineId ?? l.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[hsl(var(--foreground))]">{formatQuantity(l.quantity)} × {line?.productName ?? 'Artículo'}</span>
                  {l.stockRestored
                    ? <StatusPill size="sm" tone="success" icon={PackageCheck}>Regresó a existencias</StatusPill>
                    : <StatusPill size="sm" tone="neutral" icon={PackageX}>Sin reponer existencias</StatusPill>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {sessionQuery.isError && <ErrorState title="No se pudo leer la caja" description={classifyPosError(sessionQuery.error).message} onRetry={sessionQuery.refetch} />}
    </FormDialog>
  )
}
