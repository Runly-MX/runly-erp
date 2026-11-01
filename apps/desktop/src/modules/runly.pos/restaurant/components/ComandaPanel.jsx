import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, NumberStepper, StatusPill, TextareaField } from '@runly/ui'
import { Ban, ChefHat, CheckCheck, CircleDot, Flame, MessageSquareText, Receipt, Send, Trash2, Utensils } from 'lucide-react'
import { formatMoney, formatQuantity } from '../../retail/lib/retailRules.js'
import { STAGE_META, clockLabel, dispatchSequenceOf, lineModifiersText, lineStage, splitStages } from '../lib/restaurantRules.js'

const STAGE_ICON = { sent: ChefHat, preparing: Flame, ready: CheckCheck, delivered: Utensils, draft: CircleDot }

function NoteDialog({ line, onClose, onSave }) {
  const [note, setNote] = useState(line.note ?? '')
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md" className="p-0 md:p-0">
        <form noValidate onSubmit={(e) => { e.preventDefault(); onSave(note.trim() || null) }}>
          <div className="border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={MessageSquareText}>
              <DialogTitle>Nota para cocina</DialogTitle>
              <DialogDescription>{line.productName}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 py-5">
            <TextareaField label="Observaciones" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} autoFocus placeholder="Ej. sin cebolla, término medio" />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-14 min-w-40 text-base font-bold">Guardar nota</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LineName({ line }) {
  const mods = lineModifiersText(line)
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-base font-semibold text-[hsl(var(--foreground))]">{line.productName}{line.variantLabel ? ` · ${line.variantLabel}` : ''}</span>
      {mods && <span className="block text-sm text-[hsl(var(--muted-foreground))]">{mods}</span>}
      {line.note && <span className="mt-0.5 flex items-start gap-1 text-sm font-medium text-amber-900 dark:text-amber-300"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{line.note}</span></span>}
    </span>
  )
}

// The account as the waiter sees it: what is still to be sent (editable) and,
// separately, what the kitchen already has, per dispatch. Sent lines are
// never edited in place; the server rejects it and extras are new lines.
export default function ComandaPanel({ order, currency, busy, guestsById, canVoid, onQuantity, onNote, onRemove, onVoid, footer }) {
  const [noteLine, setNoteLine] = useState(null)
  const { draft, sent } = splitStages(order)
  const bySequence = new Map()
  for (const line of sent) {
    const seq = dispatchSequenceOf(order, line) ?? 0
    if (!bySequence.has(seq)) bySequence.set(seq, [])
    bySequence.get(seq).push(line)
  }
  const groups = [...bySequence.entries()].sort((a, b) => a[0] - b[0])
  const money = (v) => formatMoney(v, currency)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {draft.length === 0 && sent.length === 0 && (
          <p className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Aún no hay productos. Toca un producto para agregarlo a la cuenta.</p>
        )}
        {draft.length > 0 && (
          <section aria-label="Productos sin enviar" className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[hsl(var(--foreground))]">
              <CircleDot className="h-4 w-4" aria-hidden="true" />Sin enviar · {draft.length}
            </h2>
            <ul className="space-y-2">
              {draft.map((line) => (
                <li key={line.id} className="rounded-xl border-2 border-dashed border-(--brand-primary) bg-(--brand-soft) p-3">
                  <div className="flex items-start gap-3">
                    <LineName line={line} />
                    <span className="text-base font-bold tabular-nums">{money(line.totalAmount)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <NumberStepper label={`Cantidad de ${line.productName}`} value={Number(line.quantity)} onChange={(q) => onQuantity(line, q)} min={1} max={99} disabled={busy} />
                    <Button type="button" variant="outline" className="h-11 gap-1.5 sm:h-11" onClick={() => setNoteLine(line)} disabled={busy}><MessageSquareText className="h-4 w-4" aria-hidden="true" />{line.note ? 'Editar nota' : 'Nota'}</Button>
                    {guestsById.get(line.guestSeatId) && <StatusPill tone="neutral">{guestsById.get(line.guestSeatId)}</StatusPill>}
                    <span className="flex-1" />
                    <Button type="button" variant="outline" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" aria-label={`Quitar ${line.productName}`} onClick={() => onRemove(line)} disabled={busy}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {groups.map(([seq, lines]) => (
          <section key={seq} aria-label={seq ? `Envío ${seq}` : 'Enviados'} className="space-y-2">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold uppercase tracking-wide text-[hsl(var(--foreground))]">
              <Send className="h-4 w-4" aria-hidden="true" />{seq > 1 ? `Extra · envío ${seq}` : seq === 1 ? 'Envío 1' : 'Enviados'}
              <span className="text-xs font-medium normal-case tracking-normal text-[hsl(var(--muted-foreground))]">{clockLabel(lines[0].dispatchedAt)}</span>
            </h2>
            <ul className="space-y-2">
              {lines.map((line) => {
                const stage = lineStage(line)
                const meta = STAGE_META[stage]
                return (
                  <li key={line.id} className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
                    <span className="mt-0.5 w-9 shrink-0 text-center text-base font-extrabold tabular-nums">{formatQuantity(line.quantity)}×</span>
                    <LineName line={line} />
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill tone={meta.tone} icon={STAGE_ICON[stage]}>{meta.label}</StatusPill>
                      <span className="text-sm font-semibold tabular-nums">{money(line.totalAmount)}</span>
                    </span>
                    {canVoid && stage !== 'delivered' && (
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 sm:h-11 sm:w-11" aria-label={`Anular ${line.productName}`} onClick={() => onVoid(line)}><Ban className="h-4 w-4" aria-hidden="true" /></Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <div className="shrink-0 space-y-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <div className="flex items-baseline justify-between pr-16">
          <span className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]"><Receipt className="h-4 w-4" aria-hidden="true" />Total de la cuenta</span>
          <span className="text-3xl font-extrabold tabular-nums text-[hsl(var(--foreground))]">{money(order.totalAmount)}</span>
        </div>
        {footer}
      </div>
      {noteLine && <NoteDialog line={noteLine} onClose={() => setNoteLine(null)} onSave={(note) => { onNote(noteLine, note); setNoteLine(null) }} />}
    </div>
  )
}
