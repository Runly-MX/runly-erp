import { useRef, useState } from 'react'
import { useFieldArray, useWatch } from 'react-hook-form'
import { AlertCircle, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { ITEM_KIND_OPTIONS, TAX_RATE_OPTIONS } from '../../lib/purchases-constants.js'
import { computeLine, emptyLine } from '../../lib/document-math.js'
import { formatMoney } from '../../lib/format.js'
import { LineItemDialog } from './LineItemDialog.jsx'

const quantityText = (line) => {
  const qty = line.quantity === '' || line.quantity == null ? null : Number(line.quantity)
  if (qty == null || !Number.isFinite(qty)) return 'Sin cantidad'
  return `${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 4 }).format(qty)} ${line.unit || 'pza'}`
}

function LineSummary({ line, index, currency, documentary, hasError, disabled, canRemove, onEdit, onDuplicate, onRemove }) {
  const kind = ITEM_KIND_OPTIONS.find((o) => o.value === line.itemKind)?.label
  const { total } = computeLine(line)
  const tax = TAX_RATE_OPTIONS.find((o) => String(o.value) === String(line.taxRate))?.label
  const detail = documentary
    ? [kind, quantityText(line)]
    : [kind, `${quantityText(line)} × ${formatMoney(line.unitAmount || 0, currency)}`, tax]
  return (
    <li aria-label={`Partida ${index + 1}`}
      className={cn('flex items-center gap-3 rounded-xl border bg-[hsl(var(--card))] px-3 py-2.5 transition-colors',
        hasError ? 'border-rose-500/60' : 'border-[hsl(var(--border))] hover:border-(--brand-primary)/40')}>
      <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}</span>
      <button type="button" onClick={onEdit} disabled={disabled}
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50 disabled:cursor-default">
        <span className={cn('block truncate text-sm font-medium', !line.description && 'text-[hsl(var(--muted-foreground))]')}>
          {line.description || 'Sin concepto'}
        </span>
        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{detail.filter(Boolean).join(' · ')}</span>
        {hasError ? <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-300"><AlertCircle className="h-3.5 w-3.5" aria-hidden />Revisa esta partida</span> : null}
      </button>
      {documentary ? null : <span className="hidden shrink-0 text-right text-sm font-semibold tabular-nums sm:block">{formatMoney(total, currency)}</span>}
      {!disabled ? (
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar partida ${index + 1}`} title="Editar" className="h-10 w-10 sm:h-9 sm:w-9" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicar partida ${index + 1}`} title="Duplicar" className="h-10 w-10 sm:h-9 sm:w-9" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar partida ${index + 1}`} title="Quitar" disabled={!canRemove} onClick={onRemove}
            className="h-10 w-10 text-[hsl(var(--muted-foreground))] hover:text-rose-600 sm:h-9 sm:w-9">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  )
}

// Concept lines as compact rows (what, how many, price and amount); each
// line is edited in a dialog with room for every field.
// documentary: Control documental lines (what and how many, optional): no
// price, tax or total, and every line can be removed.
export function LineItemsEditor({ control, getValues, setValue, errors, currency = 'MXN', disabled = false, documentary = false, newLine = emptyLine }) {
  const { fields, append, remove, insert } = useFieldArray({ control, name: 'lines' })
  const lines = useWatch({ control, name: 'lines' }) ?? []
  const lineErrors = errors?.lines
  const rootError = lineErrors?.root?.message ?? lineErrors?.message
  const [editing, setEditing] = useState(null) // { index, isNew }
  const snapshot = useRef(null)

  const open = (index, isNew = false) => {
    snapshot.current = isNew ? null : structuredClone(getValues(`lines.${index}`) ?? {})
    setEditing({ index, isNew })
  }
  const add = () => { const index = fields.length; append(newLine(), { shouldFocus: false }); open(index, true) }
  const cancel = () => {
    if (!editing) return
    if (editing.isNew) remove(editing.index)
    else if (snapshot.current) setValue(`lines.${editing.index}`, snapshot.current, { shouldDirty: true })
    setEditing(null)
  }

  return (
    <div className="space-y-3">
      {fields.length ? (
        <ol className="space-y-2">
          {fields.map((field, index) => (
            <LineSummary key={field.id} line={lines[index] ?? {}} index={index} currency={currency} documentary={documentary}
              hasError={Boolean(lineErrors?.[index])} disabled={disabled} canRemove={documentary || fields.length > 1}
              onEdit={() => open(index)}
              onDuplicate={() => { const { id: _omit, ...copy } = getValues(`lines.${index}`) ?? {}; insert(index + 1, copy, { shouldFocus: false }) }}
              onRemove={() => remove(index)} />
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-[hsl(var(--border))] px-3 py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
          {documentary ? 'Sin partidas. Son opcionales.' : 'Sin partidas.'}
        </p>
      )}
      {rootError ? <p role="alert" className="text-sm text-rose-600">{rootError}</p> : null}
      {!disabled ? (
        <Button type="button" variant="outline" onClick={add}
          className="w-full border-dashed hover:border-(--brand-primary)/50 hover:text-(--brand-primary-computed)">
          <Plus className="h-4 w-4" />Agregar partida
        </Button>
      ) : null}
      <LineItemDialog open={Boolean(editing)} control={control} index={editing?.index ?? 0} errors={errors} currency={currency}
        documentary={documentary} isNew={editing?.isNew} onCancel={cancel} onDone={() => setEditing(null)}
        onDoneAndAdd={editing?.isNew ? () => { setEditing(null); requestAnimationFrame(add) } : null} />
    </div>
  )
}
