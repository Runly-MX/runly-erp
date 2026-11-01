// apps/desktop/src/modules/runly.pos/retail/components/SessionDialogs.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CurrencyField, ErrorState, Skeleton, StatusPill, TextField, TextareaField } from '@runly/ui'
import { ArrowDownToLine, ArrowUpFromLine, CircleCheck, LockKeyhole, TriangleAlert } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { usePosCommand } from '../hooks/usePosCommand.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { formatMoney, toMoneyString } from '../lib/retailRules.js'

export function CashMovementDialog({ kind, session, token, currency, onDone, onClose }) {
  const [amount, setAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const command = usePosCommand({
    prefix: 'pos-cash',
    run: (body, options) => runly.commerce.cashMovement(session.id, body, token, options),
    onSuccess: () => onDone(kind),
  })
  const entry = kind === 'IN'
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && !command.isPending && onClose()}
      icon={entry ? ArrowDownToLine : ArrowUpFromLine}
      title={entry ? 'Entrada de efectivo' : 'Salida de efectivo'}
      description={entry ? 'Dinero que entra a la caja sin ser una venta, como cambio adicional.' : 'Dinero que sale de la caja sin ser una devolución, como un retiro o un pago menor.'}
      size="md"
      onSubmit={() => {
        const value = toMoneyString(amount)
        const next = {}
        if (!value || Number(value) <= 0) next.amount = 'El importe debe ser mayor que cero.'
        if (!reason.trim()) next.reason = 'Escribe el motivo; queda en el corte.'
        setErrors(next)
        if (!Object.keys(next).length) command.mutate({ kind, amount: value, reason: reason.trim() })
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Cancelar</Button>
          <Button type="submit" size="lg" loading={command.isPending} disabled={command.failure?.kind === 'lost'}>{entry ? 'Registrar entrada' : 'Registrar salida'}</Button>
        </>
      )}
    >
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
      <CurrencyField label="Importe" required value={amount} onChange={setAmount} currency={currency} min={0} error={errors.amount} className="h-14 text-xl font-bold" />
      <TextField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} maxLength={500} icon={null} />
    </FormDialog>
  )
}

const BREAKDOWN = [
  ['openingCashAmount', 'Fondo inicial'],
  ['cashSales', 'Ventas en efectivo'],
  ['cashIn', 'Entradas'],
  ['cashOut', 'Salidas', -1],
  ['waiterDeliveries', 'Entregas de meseros'],
  ['refundOut', 'Devoluciones en efectivo', -1],
]

// C8 close in steps: blind count (the expected amount is not shown first),
// then the server breakdown with the difference as a preview, a reason when
// they do not match, and the close. The figures after closing are the
// server's response.
export function SessionCloseDialog({ session, token, currency, onClosed, onClose }) {
  const [step, setStep] = useState('count')
  const [counted, setCounted] = useState(0)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [closed, setClosed] = useState(null)
  const money = (v) => formatMoney(v, currency)
  const expected = useQuery({
    queryKey: ['pos-retail-expected', session.id, token],
    queryFn: () => runly.commerce.expectedCash(session.id, token),
    enabled: step === 'review',
    staleTime: 0,
  })
  const command = usePosCommand({
    prefix: 'pos-close',
    run: (body, options) => runly.commerce.closeSession(session.id, body, token, options),
    onSuccess: (res) => { setClosed(res.data); setStep('done') },
  })
  const breakdown = expected.data?.data
  const previewDiff = breakdown ? (Math.round(Number(counted) * 100) - Math.round(Number(breakdown.expectedCashAmount) * 100)) / 100 : null

  function submit() {
    if (step === 'count') { setStep('review'); return }
    if (step === 'review') {
      if (previewDiff !== 0 && !notes.trim()) { setError('Explica la diferencia antes de cerrar.'); return }
      setError('')
      command.mutate({ countedCashAmount: toMoneyString(counted) ?? '0.00', ...(notes.trim() ? { notes: notes.trim() } : {}) })
      return
    }
    onClosed(closed)
  }

  const diffTone = (value) => (Number(value) === 0 ? 'success' : 'warning')

  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && !command.isPending && (step === 'done' ? onClosed(closed) : onClose())}
      icon={step === 'done' ? CircleCheck : LockKeyhole}
      title={step === 'count' ? 'Cerrar caja · contar efectivo' : step === 'review' ? 'Cerrar caja · revisar' : 'Caja cerrada'}
      description={step === 'count' ? 'Cuenta el efectivo que hay en el cajón. El esperado se muestra después del conteo.' : step === 'review' ? 'Vista previa: la caja aún no está cerrada.' : 'Corte registrado.'}
      size="md"
      onSubmit={submit}
      footer={(
        <>
          {step === 'review' && <Button type="button" variant="outline" size="lg" onClick={() => setStep('count')} disabled={command.isPending}>Volver a contar</Button>}
          {step !== 'done' && <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Cancelar</Button>}
          <Button type="submit" size="lg" loading={command.isPending} disabled={(step === 'review' && (!breakdown || command.failure?.kind === 'lost'))}>
            {step === 'count' ? 'Continuar' : step === 'review' ? 'Confirmar cierre' : 'Terminar'}
          </Button>
        </>
      )}
    >
      {step === 'count' && (
        <CurrencyField label="Efectivo contado" value={counted} onChange={setCounted} currency={currency} min={0} autoFocus className="h-14 text-2xl font-bold" />
      )}
      {step === 'review' && (
        <>
          <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
          {expected.isPending ? <Skeleton className="h-48" /> : expected.isError ? (
            <ErrorState title="No se pudo calcular el esperado" description={classifyPosError(expected.error).message} onRetry={expected.refetch} />
          ) : (
            <>
              <dl className="space-y-1.5 rounded-xl border border-[hsl(var(--border))] p-4 text-sm">
                {BREAKDOWN.map(([key, label, sign]) => {
                  const value = key === 'openingCashAmount' ? session.openingCashAmount : breakdown[key]
                  if (value === undefined || value === null) return null
                  return <div key={key} className="flex justify-between text-[hsl(var(--muted-foreground))]"><dt>{label}</dt><dd className="tabular-nums">{sign === -1 && Number(value) > 0 ? '−' : ''}{money(value)}</dd></div>
                })}
                <div className="flex justify-between border-t border-[hsl(var(--border))] pt-1.5 font-semibold text-[hsl(var(--foreground))]"><dt>Esperado</dt><dd className="tabular-nums">{money(breakdown.expectedCashAmount)}</dd></div>
                <div className="flex justify-between font-semibold text-[hsl(var(--foreground))]"><dt>Contado</dt><dd className="tabular-nums">{money(toMoneyString(counted))}</dd></div>
              </dl>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">Diferencia (vista previa)</span>
                <StatusPill tone={diffTone(previewDiff)} icon={previewDiff === 0 ? CircleCheck : TriangleAlert}>
                  {previewDiff === 0 ? 'Cuadra' : `${previewDiff > 0 ? 'Sobra' : 'Falta'} ${money(Math.abs(previewDiff))}`}
                </StatusPill>
              </div>
              <TextareaField label={previewDiff === 0 ? 'Notas (opcional)' : 'Motivo de la diferencia'} required={previewDiff !== 0} value={notes} onChange={(e) => setNotes(e.target.value)} error={error} rows={3} maxLength={1000} />
            </>
          )}
        </>
      )}
      {step === 'done' && closed && (
        <dl className="space-y-1.5 rounded-xl border border-[hsl(var(--border))] p-4 text-base">
          <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Esperado</dt><dd className="font-semibold tabular-nums">{money(closed.expectedCashAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Contado</dt><dd className="font-semibold tabular-nums">{money(closed.countedCashAmount)}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-[hsl(var(--muted-foreground))]">Diferencia</dt><dd><StatusPill tone={diffTone(closed.differenceAmount)}>{money(closed.differenceAmount)}</StatusPill></dd></div>
        </dl>
      )}
    </FormDialog>
  )
}
