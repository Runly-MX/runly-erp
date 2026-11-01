// apps/desktop/src/modules/runly.pos/retail/components/SessionOpenPanel.jsx
import { useState } from 'react'
import { Button, CurrencyField, EmptyState, TextareaField } from '@runly/ui'
import { LockKeyhole, Wallet } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import CommandFailureAlert from '../../../runly.catalog/components/CommandFailureAlert.jsx'
import { usePosCommand } from '../hooks/usePosCommand.js'
import { toMoneyString } from '../lib/retailRules.js'

// The closed register is the main state of the screen, not a modal over a
// sale. Opening needs an explicit starting cash amount (zero is valid).
export default function SessionOpenPanel({ token, outletId, terminalId, currency, canOpen, cajaName, onOpened }) {
  const [amount, setAmount] = useState(0)
  const [notes, setNotes] = useState('')
  const command = usePosCommand({
    prefix: 'pos-open',
    run: (body, options) => runly.commerce.openSession(body, token, options),
    onSuccess: (res) => onOpened(res.data),
  })

  if (!canOpen) {
    return <EmptyState icon={LockKeyhole} title="La caja está cerrada" description="Pide a un encargado que la abra para empezar a vender." />
  }

  return (
    <form
      className="mx-auto w-full max-w-md space-y-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6"
      onSubmit={(e) => {
        e.preventDefault()
        command.mutate({ outletId, terminalId, openingCashAmount: toMoneyString(amount) ?? '0.00', ...(notes.trim() ? { notes: notes.trim() } : {}) })
      }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-(--brand-soft) text-(--brand-primary-text) dark:text-(--brand-primary-on-dark)"><Wallet className="h-6 w-6" aria-hidden="true" /></span>
        <div>
          <h1 className="text-xl font-bold text-[hsl(var(--foreground))]">Abrir {cajaName}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Cuenta el efectivo con el que empiezas el turno.</p>
        </div>
      </div>
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
      <CurrencyField label="Fondo inicial" value={amount} onChange={setAmount} currency={currency ?? 'MXN'} min={0} className="h-14 text-xl font-bold" hint="Puede ser cero." />
      <TextareaField label="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
      <Button type="submit" size="lg" className="h-14 w-full text-base font-bold" loading={command.isPending}>Abrir caja</Button>
    </form>
  )
}
