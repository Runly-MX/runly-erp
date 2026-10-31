import { Controller, useFieldArray, useWatch } from 'react-hook-form'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button, CreatableComboboxField, CurrencyField, NumberField, SegmentedControl, SelectField, TextField, cn } from '@runly/ui'
import { ITEM_KIND_OPTIONS, TAX_RATE_OPTIONS, UNIT_OPTIONS } from '../../lib/purchases-constants.js'
import { computeLine, emptyLine } from '../../lib/document-math.js'
import { MoneyText } from '../MoneyText.jsx'

function LineTotal({ control, index, currency }) {
  const line = useWatch({ control, name: `lines.${index}` }) ?? {}
  const { subtotal, taxAmount, total } = computeLine(line)
  return (
    <div className="flex min-w-[8rem] flex-col items-end justify-end pb-1">
      <MoneyText value={total} currency={currency} className="text-base font-semibold" />
      <span className="text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">{subtotal ? `${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(subtotal)} + ${new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2 }).format(taxAmount)} imp.` : 'Sin importe'}</span>
    </div>
  )
}

// Concept lines as stacked cards: what (description, goods or service) on
// top, how much (quantity, unit, price, tax, total) below.
// documentary: Control documental lines (what and how many, optional): no
// price, tax or total, and every line can be removed.
export function LineItemsEditor({ control, getValues, errors, currency = 'MXN', disabled = false, documentary = false, newLine = emptyLine }) {
  const { fields, append, remove, insert } = useFieldArray({ control, name: 'lines' })
  const lineErrors = errors?.lines
  const rootError = lineErrors?.root?.message ?? lineErrors?.message

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {fields.map((field, index) => {
          const err = lineErrors?.[index] ?? {}
          return (
            <li key={field.id} aria-label={`Partida ${index + 1}`} className="group relative rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-colors focus-within:border-(--brand-primary)/50">
                      <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <span className="hidden h-10 w-7 shrink-0 items-center justify-center text-sm font-semibold tabular-nums text-[hsl(var(--muted-foreground))] md:flex">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <Controller control={control} name={`lines.${index}.description`} render={({ field: f }) => (
                    <TextField id={`${field.id}-description`} label="Concepto (opcional)" placeholder="Laptop 14 pulgadas, 16 GB" disabled={disabled} error={err.description?.message} {...f} value={f.value ?? ''} />
                  )} />
                </div>
                <Controller control={control} name={`lines.${index}.itemKind`} render={({ field: f }) => (
                  <SegmentedControl ariaLabel="Tipo de concepto" options={ITEM_KIND_OPTIONS} value={f.value} onChange={f.onChange} disabled={disabled} className="w-full md:w-52" />
                )} />
              </div>
              <div className={cn('mt-3 grid grid-cols-2 gap-3 md:ml-10', documentary ? 'md:grid-cols-[9rem_10rem_1fr_auto]' : 'md:grid-cols-[7rem_8rem_minmax(9rem,1fr)_10rem_auto]')}>
                <Controller control={control} name={`lines.${index}.quantity`} render={({ field: f }) => (
                  <NumberField id={`${field.id}-quantity`} label={documentary ? 'Cantidad (opcional)' : 'Cantidad'} min="0" step="any" allowNegative={false} disabled={disabled} error={err.quantity?.message}
                    value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} />
                )} />
                <Controller control={control} name={`lines.${index}.unit`} render={({ field: f }) => {
                  const options = f.value && !UNIT_OPTIONS.some((o) => o.value === f.value) ? [...UNIT_OPTIONS, { value: f.value, label: f.value }] : UNIT_OPTIONS
                  return (
                    <CreatableComboboxField id={`${field.id}-unit`} label="Unidad" options={options} value={f.value ?? ''} onChange={f.onChange} disabled={disabled}
                      onCreate={(name) => f.onChange(String(name).trim().slice(0, 20))} placeholder="pza" searchPlaceholder="Buscar o crear..." minWidth={180} />
                  )
                }} />
                {documentary ? null : <Controller control={control} name={`lines.${index}.unitAmount`} render={({ field: f }) => (
                  <CurrencyField id={`${field.id}-price`} label="Precio unitario" value={f.value} onChange={f.onChange} currency={currency} disabled={disabled} error={err.unitAmount?.message} />
                )} />}
                {documentary ? null : <Controller control={control} name={`lines.${index}.taxRate`} render={({ field: f }) => (
                  <SelectField id={`${field.id}-tax`} label="Impuesto" options={TAX_RATE_OPTIONS} value={f.value} onValueChange={f.onChange} disabled={disabled} />
                )} />}
                <div className="col-span-2 flex items-end justify-between gap-2 md:col-span-1">
                  {documentary ? <span /> : <LineTotal control={control} index={index} currency={currency} />}
                  {!disabled ? (
                    <div className="flex gap-1 pb-1">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Duplicar partida ${index + 1}`} title="Duplicar" className="h-10 w-10 md:h-8 md:w-8"
                        onClick={() => { const { id: _omit, ...copy } = getValues(`lines.${index}`) ?? {}; insert(index + 1, copy) }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Quitar partida ${index + 1}`} title="Quitar"
                        disabled={!documentary && fields.length === 1} onClick={() => remove(index)}
                        className="h-10 w-10 text-[hsl(var(--muted-foreground))] hover:text-rose-600 md:h-8 md:w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {rootError ? <p role="alert" className="text-sm text-rose-600">{rootError}</p> : null}
      {!disabled ? (
        <Button type="button" variant="outline" onClick={() => append(newLine())}
          className={cn('w-full border-dashed hover:border-(--brand-primary)/50 hover:text-(--brand-primary-computed)')}>
          <Plus className="h-4 w-4" />Agregar partida
        </Button>
      ) : null}
    </div>
  )
}
