import { useEffect, useRef, useState } from 'react'
import { Banknote, History, RotateCcw, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton, TextareaField } from '@runly/ui'
import { errorText, newOperationKey, useInvoicePayments, usePaymentMutations, usePurchasesCan } from '../../hooks/usePurchases.js'
import { PAYMENT_METHODS } from '../../lib/purchases-constants.js'
import { formatDate, formatMoney } from '../../lib/format.js'
import { MoneyText } from '../MoneyText.jsx'

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]))
const KIND_LABEL = { PAYMENT: 'Pago', OPENING: 'Pagado histórico', REVERSAL: 'Reverso' }

function Fact({ label, children }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
    </div>
  )
}

// Reverses one payment: a reason is required; the original stays in the history.
function ReverseDialog({ invoice, payment, onOpenChange }) {
  const { reverse } = usePaymentMutations(invoice.id)
  const [reason, setReason] = useState('')
  const key = useRef(null)
  const open = Boolean(payment)
  useEffect(() => { if (open) { setReason(''); key.current = newOperationKey('rev') } }, [open, payment?.id])
  const confirm = () => reverse.mutate(
    { paymentId: payment.id, reason: reason.trim(), idempotencyKey: key.current, expectedUpdatedAt: invoice.updatedAt },
    {
      onSuccess: (result) => {
        toast.success('Pago reversado')
        for (const warning of result?.warnings ?? []) toast.warning(warning)
        onOpenChange(false)
      },
      onError: (error) => {
        const code = error?.details?.code
        if (code === 'STALE_DOCUMENT') key.current = newOperationKey('rev')
        toast.error(code === 'STALE_DOCUMENT' ? 'La factura cambió mientras reversabas. Revisa el historial actualizado e inténtalo de nuevo.'
          : !error?.status ? 'No se pudo confirmar el reverso por un problema de conexión. Puedes reintentar sin riesgo de duplicarlo.'
            : errorText(error, 'No se pudo reversar el pago.'))
      },
    },
  )
  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} icon={Undo2} title="Reversar pago"
      description="Se registra un movimiento negativo; el pago original se conserva en el historial. No se hace ninguna devolución bancaria."
      detail={payment ? `${formatMoney(payment.amount, payment.currency)} · ${payment.paidAt ? formatDate(payment.paidAt) : 'sin fecha'}` : null}
      confirmLabel="Reversar pago" loading={reverse.isPending} confirmDisabled={!reason.trim()} onConfirm={confirm}>
      <TextareaField label="Motivo" required rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Por qué se reversa este pago (queda en el historial)." />
    </ConfirmDialog>
  )
}

// Invoice payments: totals, the chronological ledger and the reverse action.
// The ledger is read-only history when the payments capability is off.
// showTotals: false when the page already shows total / paid / balance.
export function PaymentsPanel({ invoice, onRecord, showTotals = true }) {
  const can = usePurchasesCan()
  const query = useInvoicePayments(invoice.id)
  const [toReverse, setToReverse] = useState(null)
  if (query.isLoading) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-20 w-full rounded-xl" /><Skeleton className="h-40 w-full rounded-xl" /></div>
  if (query.isError) return <ErrorState title="No se pudieron cargar los pagos" description={query.error?.message} onRetry={() => query.refetch()} />
  const { summary, payments } = query.data
  const writable = summary.capabilityEnabled && summary.ledgerAvailable
  const canReverse = writable && can('purchases.payment.reverse') && ['PARTIALLY_PAID', 'PAID'].includes(summary.status)
  const canRecord = summary.capabilityEnabled && can('purchases.payment.manage') && ['PENDING', 'PARTIALLY_PAID'].includes(summary.status)
  // The API's evaluation of `pay`: offered, disabled, with the reason.
  const policyBlock = invoice.policyCheck?.action === 'pay' && invoice.policyCheck.blocked ? invoice.policyCheck.reasons ?? [] : null
  const rows = [...payments].reverse()

  return (
    <div className="space-y-4">
      {showTotals ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact label="Total de la factura"><MoneyText value={summary.total} currency={summary.currency} /></Fact>
          <Fact label="Pagado"><MoneyText value={summary.paid} currency={summary.currency} tone="emerald" /></Fact>
          <Fact label="Saldo pendiente"><MoneyText value={summary.balance} currency={summary.currency} /></Fact>
        </div>
      ) : null}
      {summary.unrecordedLegacy > 0 ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
          <History className="mt-0.5 h-4 w-4 shrink-0" />
          {formatMoney(summary.unrecordedLegacy, summary.currency)} se pagaron antes del registro individual de pagos y no tienen desglose. Se registrarán como un solo movimiento histórico la próxima vez que se pague o reverse.
        </p>
      ) : null}
      {!summary.capabilityEnabled ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Solo lectura: los pagos están desactivados en el flujo de compras.</p> : null}
      {canRecord && onRecord ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {policyBlock ? <p className="text-sm text-rose-700 dark:text-rose-300">Pendiente por política: {policyBlock.join('; ')}</p> : null}
          <Button onClick={onRecord} disabled={Boolean(policyBlock)}><Banknote className="h-4 w-4" />Registrar pago</Button>
        </div>
      ) : null}
      {!rows.length ? (
        <EmptyState icon={Banknote} title="Sin pagos registrados" description="Cada abono o pago de esta factura aparece aquí, con quién y cuándo lo registró." />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label="Historial de pagos">
          {rows.map((p) => {
            const reversed = Boolean(p.reversedBy)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-payment-id={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {p.kind === 'REVERSAL' ? <RotateCcw className="h-4 w-4 text-rose-600" /> : null}
                    {KIND_LABEL[p.kind] ?? p.kind}
                    {reversed ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">Reversado</span> : null}
                    {p.legacy ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">Sin desglose</span> : null}
                  </span>
                  <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {[p.paidAt ? formatDate(p.paidAt) : (p.legacy ? 'Fecha no registrada' : null), METHOD[p.method] ?? p.method, p.reference, p.createdByName && (p.legacy ? `Pasado al historial por ${p.createdByName}` : `Registró ${p.createdByName}`), `el ${formatDate(p.recordedAt)}`].filter(Boolean).join(' · ')}
                  </span>
                  {p.reason ? <span className="block text-xs">Motivo: {p.reason}</span> : null}
                  {reversed ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">Reversado el {formatDate(p.reversedBy.recordedAt)}{p.reversedBy.createdByName ? ` por ${p.reversedBy.createdByName}` : ''}: {p.reversedBy.reason}</span> : null}
                </span>
                <MoneyText value={p.amount} currency={p.currency} className={`text-sm ${reversed ? 'line-through opacity-60' : ''}`} />
                {canReverse && p.kind !== 'REVERSAL' && !reversed ? (
                  <Button variant="ghost" size="sm" onClick={() => setToReverse(p)} aria-label={`Reversar pago de ${formatMoney(p.amount, p.currency)}`}>
                    <Undo2 className="h-4 w-4" />Reversar
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <ReverseDialog invoice={{ id: invoice.id, updatedAt: summary.updatedAt }} payment={toReverse} onOpenChange={(o) => { if (!o) setToReverse(null) }} />
    </div>
  )
}
