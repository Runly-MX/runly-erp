// apps/desktop/src/modules/runly.pos/retail/components/QuickSaleDialog.jsx
import { useState } from 'react'
import { Button, CurrencyField, TextField } from '@runly/ui'
import { Zap } from 'lucide-react'
import FormDialog from '../../../runly.catalog/components/FormDialog.jsx'
import { toMoneyString } from '../lib/retailRules.js'

// "Venta rápida": charge an amount that is not in the catalog. The amount is
// the final price (tax included); no stock moves.
export default function QuickSaleDialog({ currency, onClose, onAdd }) {
  const [amount, setAmount] = useState(0)
  const [name, setName] = useState('Venta rápida')
  const [error, setError] = useState('')
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      icon={Zap}
      title="Venta rápida"
      description="Cobra un monto que no está en el catálogo. El impuesto va incluido."
      size="md"
      onSubmit={() => {
        const unitPrice = toMoneyString(amount)
        if (!unitPrice || Number(unitPrice) <= 0) { setError('Escribe un monto mayor a cero.'); return }
        onAdd({ name: name.trim() || 'Venta rápida', unitPrice })
      }}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose}>Cancelar</Button>
          <Button type="submit" size="lg">Agregar a la venta</Button>
        </>
      )}
    >
      <CurrencyField label="Monto" value={amount} onChange={(v) => { setAmount(v); setError('') }} currency={currency} min={0} autoFocus error={error} />
      <TextField label="Concepto" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} icon={null} />
    </FormDialog>
  )
}
