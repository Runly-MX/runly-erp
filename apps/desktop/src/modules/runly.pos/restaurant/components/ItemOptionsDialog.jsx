import { useMemo, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, NumberStepper, SelectField, TextareaField, cn } from '@runly/ui'
import { Check, SlidersHorizontal } from 'lucide-react'
import { formatMoney } from '../../retail/lib/retailRules.js'

const SHARED = '__shared__'

// Modifiers, quantity, diner and preparation note for one product. Group
// rules (required / min / max) come from the Catalog; the server validates
// them again when the line is added.
export default function ItemOptionsDialog({ item, groups, guests, activeSeatId, currency, onClose, onSubmit }) {
  const [picked, setPicked] = useState(() => new Map())
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [seat, setSeat] = useState(activeSeatId ?? SHARED)

  const selected = useMemo(() => groups.flatMap((g) => (g.options ?? []).filter((o) => picked.get(g.id)?.has(o.id))), [groups, picked])
  const unit = Number(item.price ?? 0) + selected.reduce((s, o) => s + Number(o.priceDelta ?? 0), 0)
  const minOf = (g) => (g.required ? Math.max(1, g.minSelect ?? 1) : (g.minSelect ?? 0))
  const missing = groups.find((g) => (g.options ?? []).length > 0 && (picked.get(g.id)?.size ?? 0) < minOf(g))

  function toggle(group, option) {
    setPicked((prev) => {
      const next = new Map(prev)
      const current = new Set(next.get(group.id) ?? [])
      const max = group.maxSelect ?? 1
      if (current.has(option.id)) { if (max === 1 && group.required) return prev; current.delete(option.id) }
      else if (max === 1) { current.clear(); current.add(option.id) }
      else if (current.size >= max) return prev
      else current.add(option.id)
      next.set(group.id, current)
      return next
    })
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md" scrollable className="p-0 md:p-0">
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(e) => {
          e.preventDefault()
          if (missing) return
          onSubmit({ quantity, note: note.trim() || null, modifiers: selected.map((o) => ({ optionId: o.id })), guestSeatId: seat === SHARED ? null : seat })
        }}>
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 pb-1 pt-5 pr-12">
            <DialogHeader icon={SlidersHorizontal}>
              <DialogTitle>{item.variantLabel ? `${item.name} · ${item.variantLabel}` : item.name}</DialogTitle>
              <DialogDescription>{formatMoney(item.price, currency)} base</DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {groups.map((group) => (
              <fieldset key={group.id} className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-semibold text-[hsl(var(--foreground))]">
                  <span>{group.name}{group.required && <span className="ml-1 text-red-800 dark:text-red-300" aria-label="obligatorio">*</span>}</span>
                  <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">{group.maxSelect > 1 ? `hasta ${group.maxSelect}` : 'elige una'}</span>
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(group.options ?? []).map((option) => {
                    const on = picked.get(group.id)?.has(option.id) ?? false
                    const delta = Number(option.priceDelta ?? 0)
                    return (
                      <button key={option.id} type="button" role={group.maxSelect > 1 ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(group, option)}
                        className={cn('flex min-h-12 items-center justify-between gap-2 rounded-xl border px-4 text-left text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                          on ? 'border-2 border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]')}>
                        <span className="flex items-center gap-2">{on && <Check className="h-4 w-4" aria-hidden="true" />}{option.name}</span>
                        {delta !== 0 && <span className="text-sm tabular-nums text-[hsl(var(--muted-foreground))]">{delta > 0 ? '+' : ''}{formatMoney(delta, currency)}</span>}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            ))}
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Cantidad</p>
              <NumberStepper label="Cantidad" value={quantity} onChange={setQuantity} min={1} max={99} />
            </div>
            {guests.length > 0 && (
              <SelectField label="Para" value={seat} onChange={setSeat} options={[{ value: SHARED, label: 'Compartido' }, ...guests.map((g) => ({ value: g.id, label: g.label }))]} />
            )}
            <TextareaField label="Nota para cocina" placeholder="Ej. sin cebolla, término medio" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
            {missing && <p role="alert" className="text-sm font-semibold text-red-800 dark:text-red-300">Elige una opción en «{missing.name}».</p>}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="lg" className="h-14" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-14 min-w-56 text-lg font-bold" disabled={Boolean(missing)}>Agregar {formatMoney(unit * quantity, currency)}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
