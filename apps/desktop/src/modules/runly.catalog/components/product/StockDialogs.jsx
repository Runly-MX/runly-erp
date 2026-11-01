// apps/desktop/src/modules/runly.catalog/components/product/StockDialogs.jsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, NumberField, SegmentedControl, SelectField, TextField } from '@runly/ui'
import { ArrowDownToLine, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { parseWholeQuantity } from '../../lib/catalogRules.js'
import { useCommerceCommand } from '../../lib/useCommerceCommand.js'
import CommandFailureAlert from '../CommandFailureAlert.jsx'
import FormDialog from '../FormDialog.jsx'

const UNALLOCATED = '__unallocated__'
const REASONS = ['Conteo físico', 'Compra recibida', 'Merma o daño', 'Corrección de captura', 'Otro']

export function invalidateStock(queryClient, productId) {
  for (const key of ['catalog-stock-balances', 'catalog-stock-movements', 'catalog-product', 'catalog-outlet-stock']) {
    queryClient.invalidateQueries({ queryKey: [key, productId] })
  }
  queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
  queryClient.invalidateQueries({ queryKey: ['catalog-outlet-stock'] })
}

// C5 allocation: moves historical «Sin asignar» units to one outlet in a
// single audited transfer. Nothing is allocated automatically; the server
// rejects more than what is unallocated.
export function StockAllocateDialog({ open, onClose, productId, token, itemLabel, variantId, unallocated, outlets, defaultOutletId = '' }) {
  const queryClient = useQueryClient()
  const [outletId, setOutletId] = useState(defaultOutletId)
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('Asignación de existencias sin sucursal')
  const [errors, setErrors] = useState({})
  const command = useCommerceCommand({
    prefix: 'cat-alloc',
    run: (body, options) => runly.catalogCommerce.allocateStock(productId, body, token, options),
    onSuccess: (_, body) => {
      invalidateStock(queryClient, productId)
      toast.success(`${body.quantity} unidad(es) asignada(s) a ${outlets.find((o) => o.id === body.outletId)?.name ?? 'la sucursal'}`)
      onClose()
    },
  })

  function submit() {
    const qty = parseWholeQuantity(quantity)
    const next = {}
    if (!outletId) next.outletId = 'Elige la sucursal que recibe las unidades.'
    if (qty === null) next.quantity = 'Usa un número entero mayor que cero.'
    else if (qty > unallocated) next.quantity = `Sólo hay ${unallocated} unidad(es) sin asignar.`
    if (!reason.trim()) next.reason = 'Escribe el motivo; queda en el historial.'
    setErrors(next)
    if (Object.keys(next).length) return
    command.mutate({ ...(variantId ? { variantId } : {}), outletId, quantity: qty, reason: reason.trim() })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => !v && !command.isPending && onClose()}
      icon={ArrowRightLeft}
      title="Asignar unidades sin sucursal"
      description={`${itemLabel}: ${unallocated} unidad(es) sin asignar. Pasan a la sucursal elegida y se registra quién y cuándo.`}
      size="md"
      onSubmit={submit}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Cancelar</Button>
          <Button type="submit" size="lg" loading={command.isPending}>Asignar</Button>
        </>
      )}
    >
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
      <SelectField label="Sucursal" required options={outlets.map((o) => ({ value: o.id, label: o.name }))} value={outletId} onValueChange={setOutletId} placeholder="Elige una sucursal" error={errors.outletId} />
      <NumberField label="Cantidad" required value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} step={1} error={errors.quantity} hint={`Máximo ${unallocated}.`} />
      <TextField label="Motivo" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} maxLength={500} icon={null} />
    </FormDialog>
  )
}

// C5 manual adjustment on one location. A negative «Sin asignar» balance
// can only be corrected upwards; the server enforces every limit.
export function StockAdjustDialog({ open, onClose, productId, token, itemLabel, variantId, outlets, defaultLocation = '' }) {
  const queryClient = useQueryClient()
  const [location, setLocation] = useState(defaultLocation)
  const [direction, setDirection] = useState('in')
  const [quantity, setQuantity] = useState('')
  const [preset, setPreset] = useState('Conteo físico')
  const [other, setOther] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState({})
  const command = useCommerceCommand({
    prefix: 'cat-adjust',
    run: (body, options) => runly.catalogCommerce.adjustStock(productId, body, token, options),
    onSuccess: (_, body) => {
      invalidateStock(queryClient, productId)
      toast.success(`Ajuste registrado: ${body.quantityDelta > 0 ? '+' : ''}${body.quantityDelta}`)
      onClose()
    },
  })

  function submit() {
    const qty = parseWholeQuantity(quantity)
    const reason = preset === 'Otro' ? other.trim() : preset
    const next = {}
    if (!location) next.location = 'Elige dónde se hace el ajuste.'
    if (qty === null) next.quantity = 'Usa un número entero mayor que cero.'
    if (!reason) next.reason = 'Escribe el motivo; queda en el historial.'
    setErrors(next)
    if (Object.keys(next).length) return
    command.mutate({
      ...(variantId ? { variantId } : {}),
      outletId: location === UNALLOCATED ? null : location,
      quantityDelta: direction === 'in' ? qty : -qty,
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
    })
  }

  const locations = [...outlets.map((o) => ({ value: o.id, label: o.name })), { value: UNALLOCATED, label: 'Sin asignar (existencias históricas)' }]

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => !v && !command.isPending && onClose()}
      icon={ArrowDownToLine}
      title="Ajustar existencias"
      description={`${itemLabel}. El ajuste queda en movimientos con tu nombre, la fecha y el motivo.`}
      size="md"
      onSubmit={submit}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={command.isPending}>Cancelar</Button>
          <Button type="submit" size="lg" loading={command.isPending}>{direction === 'in' ? 'Registrar entrada' : 'Registrar salida'}</Button>
        </>
      )}
    >
      <CommandFailureAlert failure={command.failure} onRetry={command.retry} retrying={command.isPending} />
      <SelectField label="Ubicación" required options={locations} value={location} onValueChange={setLocation} placeholder="Elige una sucursal" error={errors.location} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Movimiento</p>
        <SegmentedControl ariaLabel="Tipo de movimiento" options={[{ value: 'in', label: 'Entrada (+)' }, { value: 'out', label: 'Salida (−)' }]} value={direction} onChange={setDirection} />
      </div>
      <NumberField label="Cantidad" required value={quantity} onChange={(e) => setQuantity(e.target.value)} min={1} step={1} error={errors.quantity} />
      <SelectField label="Motivo" required options={REASONS.map((r) => ({ value: r, label: r }))} value={preset} onValueChange={setPreset} error={preset === 'Otro' ? undefined : errors.reason} />
      {preset === 'Otro' && <TextField label="Describe el motivo" required value={other} onChange={(e) => setOther(e.target.value)} error={errors.reason} maxLength={500} icon={null} />}
      <TextField label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} icon={null} />
    </FormDialog>
  )
}

export { UNALLOCATED }
