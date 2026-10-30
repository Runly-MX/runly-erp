import { useEffect, useRef } from 'react'
import { Banknote } from 'lucide-react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Button, CurrencyField, DateField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, TextField,
} from '@runly/ui'
import { errorText, newOperationKey, usePaymentMutations } from '../../hooks/usePurchases.js'
import { PAYMENT_METHODS } from '../../lib/purchases-constants.js'
import { formatMoney, toNumber, today } from '../../lib/format.js'

// Records one payment movement of an invoice (POST /purchases/invoices/:id/payments).
// Compras keeps the administrative record only; accounting stays in Finanzas.
// The operation key is fixed per opening of the dialog: retrying after a
// network error or a double click never records the payment twice.
export function PaymentDialog({ invoice, open, onOpenChange }) {
  const { record } = usePaymentMutations(invoice?.id)
  const operationKey = useRef(null)
  const balance = Math.max(0, toNumber(invoice?.total) - toNumber(invoice?.paidAmount))
  const schema = z.object({
    amount: z.number().positive('Captura el monto pagado').max(balance + 0.001, `No puede exceder el saldo de ${formatMoney(balance, invoice?.currency)}`),
    paidAt: z.string().min(1, 'Indica la fecha'),
    method: z.string().min(1, 'Elige la forma de pago'),
    reference: z.string().max(120).optional(),
  })
  const { control, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { amount: balance, paidAt: today(), method: 'TRANSFER', reference: '' } })
  const amount = useWatch({ control, name: 'amount' })
  useEffect(() => {
    if (!open) return
    operationKey.current = newOperationKey('pay')
    reset({ amount: balance, paidAt: today(), method: 'TRANSFER', reference: '' })
  // The balance changes after a conflict refetch; the form keeps what the user typed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset])

  const submit = handleSubmit(async (values) => {
    try {
      const result = await record.mutateAsync({
        amount: Number(values.amount).toFixed(2), paidAt: values.paidAt, method: values.method,
        reference: values.reference?.trim() || undefined, idempotencyKey: operationKey.current, expectedUpdatedAt: invoice.updatedAt,
      })
      toast.success(result?.invoice?.status === 'PAID' ? 'Factura pagada' : 'Pago parcial registrado')
      onOpenChange(false)
    } catch (error) {
      // STALE_DOCUMENT: someone else paid or changed the invoice; the refreshed
      // balance shows up and the user decides. Network errors keep the same key.
      const stale = error?.details?.code === 'STALE_DOCUMENT'
      // No HTTP status: the response was lost (network); the payment may be recorded, retrying is safe.
      const network = !error?.status
      toast.error(stale ? 'La factura cambió mientras registrabas el pago. Revisa el saldo actualizado e inténtalo de nuevo.'
        : network ? 'No se pudo confirmar el pago por un problema de conexión. Puedes reintentar sin riesgo de duplicarlo.'
          : errorText(error, 'No se pudo registrar el pago.'))
      if (stale) operationKey.current = newOperationKey('pay')
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md">
        <DialogHeader className="shrink-0" icon={Banknote}>
          <DialogTitle>Registrar pago de {invoice?.number}</DialogTitle>
          <DialogDescription>Saldo actual {formatMoney(balance, invoice?.currency)}.</DialogDescription>
        </DialogHeader>
        <form id="purchase-payment" onSubmit={submit} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          <Controller control={control} name="amount" render={({ field }) => (
            <CurrencyField label="Monto pagado" required value={field.value} onChange={field.onChange} currency={invoice?.currency} error={errors.amount?.message}
              hint={toNumber(amount) < balance ? `Quedará un saldo de ${formatMoney(balance - toNumber(amount), invoice?.currency)}` : 'Liquida la factura'} />
          )} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller control={control} name="paidAt" render={({ field }) => (
              <DateField label="Fecha de pago" required value={field.value} onChange={(e) => field.onChange(e.target.value)} error={errors.paidAt?.message} />
            )} />
            <Controller control={control} name="method" render={({ field }) => (
              <SelectField label="Forma de pago" options={PAYMENT_METHODS} value={field.value} onValueChange={field.onChange} error={errors.method?.message} />
            )} />
          </div>
          <Controller control={control} name="reference" render={({ field }) => (
            <TextField label="Referencia" placeholder="Folio de transferencia o número de cheque" {...field} value={field.value ?? ''} />
          )} />
        </form>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="purchase-payment" disabled={record.isPending}>{record.isPending ? 'Guardando...' : 'Registrar pago'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
