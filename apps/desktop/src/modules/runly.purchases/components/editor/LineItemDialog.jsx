import { Controller, useWatch } from 'react-hook-form'
import { ListPlus } from 'lucide-react'
import {
  Button, CreatableComboboxField, CurrencyField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  NumberField, SegmentedControl, SelectField, TextField,
} from '@runly/ui'
import { ITEM_KIND_OPTIONS, TAX_RATE_OPTIONS, UNIT_OPTIONS } from '../../lib/purchases-constants.js'
import { computeLine } from '../../lib/document-math.js'
import { formatMoney } from '../../lib/format.js'

function DialogTotal({ control, index, currency }) {
  const line = useWatch({ control, name: `lines.${index}` }) ?? {}
  const { subtotal, taxAmount, total } = computeLine(line)
  return (
    // order-last: on phones the footer is a reversed column, so the total reads first.
    <div className="order-last min-w-0 text-sm sm:order-none sm:mr-auto">
      <span className="block text-xs text-[hsl(var(--muted-foreground))]">Importe de la partida</span>
      <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
      {subtotal ? <span className="ml-1.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{formatMoney(subtotal, currency)} + {formatMoney(taxAmount, currency)} imp.</span> : null}
    </div>
  )
}

// One concept line edited with room for every field. The fields are bound to
// the editor's own form (lines.<index>), so validation and the error summary
// keep working; the caller restores the previous values on Cancelar.
// documentary: what and how many only (no price, tax or amount).
export function LineItemDialog({ open, control, index, errors, currency = 'MXN', documentary = false, isNew = false, onCancel, onDone, onDoneAndAdd }) {
  const err = errors?.lines?.[index] ?? {}
  const id = `line-${index}`
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent size="lg" scrollable>
        <DialogHeader className="shrink-0" icon={ListPlus}>
          <DialogTitle>{isNew ? 'Nueva partida' : `Partida ${index + 1}`}</DialogTitle>
          <DialogDescription>
            {documentary ? 'Qué ampara el documento y cuántos. Todo es opcional.' : 'Concepto, cantidad, precio e impuesto. El importe se calcula solo.'}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4"
            onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.defaultPrevented) { e.preventDefault(); onDone() } }}>
            <Controller control={control} name={`lines.${index}.description`} render={({ field: f }) => (
              <TextField id={`${id}-description`} label="Concepto (opcional)" placeholder="Laptop 14 pulgadas, 16 GB" autoFocus
                error={err.description?.message} {...f} value={f.value ?? ''} />
            )} />
            <Controller control={control} name={`lines.${index}.itemKind`} render={({ field: f }) => (
              <div className="space-y-1.5">
                <span className="block text-sm font-medium">Tipo de concepto</span>
                <SegmentedControl ariaLabel="Tipo de concepto" options={ITEM_KIND_OPTIONS} value={f.value} onChange={f.onChange} className="w-full sm:w-64" />
              </div>
            )} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller control={control} name={`lines.${index}.quantity`} render={({ field: f }) => (
                <NumberField id={`${id}-quantity`} label={documentary ? 'Cantidad (opcional)' : 'Cantidad'} min="0" step="any" allowNegative={false} error={err.quantity?.message}
                  value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} onBlur={f.onBlur} />
              )} />
              <Controller control={control} name={`lines.${index}.unit`} render={({ field: f }) => {
                const options = f.value && !UNIT_OPTIONS.some((o) => o.value === f.value) ? [...UNIT_OPTIONS, { value: f.value, label: f.value }] : UNIT_OPTIONS
                return (
                  <CreatableComboboxField id={`${id}-unit`} label="Unidad" options={options} value={f.value ?? ''} onChange={f.onChange}
                    onCreate={(name) => f.onChange(String(name).trim().slice(0, 20))} placeholder="pza" searchPlaceholder="Buscar o crear..." />
                )
              }} />
              {documentary ? null : (
                <>
                  <Controller control={control} name={`lines.${index}.unitAmount`} render={({ field: f }) => (
                    <CurrencyField id={`${id}-price`} label="Precio unitario" value={f.value} onChange={f.onChange} currency={currency} error={err.unitAmount?.message} />
                  )} />
                  <Controller control={control} name={`lines.${index}.taxRate`} render={({ field: f }) => (
                    <SelectField id={`${id}-tax`} label="Impuesto" options={TAX_RATE_OPTIONS} value={f.value} onValueChange={f.onChange} />
                  )} />
                </>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter className="shrink-0 flex-col-reverse gap-2 border-t border-[hsl(var(--border))] pt-4 sm:flex-row sm:items-center">
          {documentary || !open ? null : <DialogTotal control={control} index={index} currency={currency} />}
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          {onDoneAndAdd ? <Button type="button" variant="outline" onClick={onDoneAndAdd}>Guardar y agregar otra</Button> : null}
          <Button type="button" onClick={onDone}>{isNew ? 'Guardar partida' : 'Listo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
