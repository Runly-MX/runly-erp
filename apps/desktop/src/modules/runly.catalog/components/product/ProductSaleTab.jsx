// apps/desktop/src/modules/runly.catalog/components/product/ProductSaleTab.jsx
import { useState } from 'react'
import { CurrencyField, SectionCard, SelectField, TextField } from '@runly/ui'
import { Barcode, Tag } from 'lucide-react'
import { CURRENCY_OPTIONS, usePosDefaults } from '../../lib/catalogData.js'
import CommercialTaxPanel from './CommercialTaxPanel.jsx'
import PosAvailabilityPanel from './PosAvailabilityPanel.jsx'
import SaveBar from './SaveBar.jsx'

function snapshot(product) {
  return {
    price: Number(product.price ?? 0),
    compare_price: product.compare_price != null ? Number(product.compare_price) : null,
    currency: product.currency ?? 'MXN',
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
  }
}

export default function ProductSaleTab({ product, token, access, saver, productId }) {
  const isVariable = product.product_type === 'VARIABLE'
  const defaults = usePosDefaults(token)
  const [base, setBase] = useState(() => snapshot(product))
  const [form, setForm] = useState(() => snapshot(product))
  const [errors, setErrors] = useState({})
  const readOnly = !access.canUpdate

  const next = {
    price: Number(form.price) || 0,
    compare_price: form.compare_price ? Number(form.compare_price) : null,
    currency: form.currency,
    sku: form.sku?.trim() || null,
    barcode: form.barcode?.trim() || null,
  }
  const changed = Object.keys(next).filter((k) => (next[k] ?? null) !== (base[k] ?? null))

  function submit(e) {
    e.preventDefault()
    const nextErrors = {}
    if (next.compare_price != null && next.compare_price <= next.price) nextErrors.compare_price = 'El precio anterior debe ser mayor que el precio actual para mostrarse tachado.'
    if ((next.sku ?? '').length > 100) nextErrors.sku = 'Máximo 100 caracteres.'
    if ((next.barcode ?? '').length > 100) nextErrors.barcode = 'Máximo 100 caracteres.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const data = Object.fromEntries(changed.map((k) => [k, next[k]]))
    saver.save(data, base, { onSaved: () => setBase((b) => ({ ...b, ...data })) })
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SectionCard title={isVariable ? 'Precio base' : 'Precio'} icon={Tag} description={isVariable ? 'Las variantes que no tienen precio propio usan este precio.' : 'Lo que paga el cliente. El impuesto se configura abajo.'}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <CurrencyField label="Precio" required value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} currency={form.currency} min={0} disabled={readOnly} />
                <SelectField label="Moneda" options={CURRENCY_OPTIONS} value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))} disabled={readOnly} />
              </div>
              {defaults.currency && form.currency !== defaults.currency && (
                <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                  El punto de venta cobra en {defaults.currency}. Con {form.currency} este producto no se podrá vender en POS.
                </p>
              )}
              <CurrencyField
                label="Precio anterior (opcional)"
                value={form.compare_price ?? 0}
                onChange={(v) => setForm((f) => ({ ...f, compare_price: v > 0 ? v : null }))}
                currency={form.currency}
                min={0}
                error={errors.compare_price}
                hint="Se muestra tachado en la web para indicar una rebaja."
                disabled={readOnly}
              />
            </div>
          </SectionCard>

          {!isVariable ? (
            <SectionCard title="Códigos" icon={Barcode} description="El escáner del punto de venta busca primero el código de barras y después el SKU.">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="SKU" value={form.sku ?? ''} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} error={errors.sku} placeholder="Código interno" maxLength={100} disabled={readOnly} icon={null} />
                <TextField label="Código de barras" value={form.barcode ?? ''} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} error={errors.barcode} placeholder="EAN o UPC" inputMode="numeric" maxLength={100} disabled={readOnly} icon={null} hint="Se guarda tal cual, con ceros iniciales." />
              </div>
            </SectionCard>
          ) : (
            <SectionCard title="Códigos" icon={Barcode}>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Cada variante tiene su SKU y su código de barras en la pestaña Variantes.</p>
            </SectionCard>
          )}
        </div>
        {!readOnly && <SaveBar dirty={changed.length > 0} saving={saver.saving} onDiscard={() => { setForm(base); setErrors({}) }} label="Guardar precio y códigos" />}
      </form>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PosAvailabilityPanel productId={productId} token={token} canUpdate={access.canUpdate} published={product.published} />
        <CommercialTaxPanel productId={productId} token={token} canUpdate={access.canUpdate} />
      </div>
    </div>
  )
}
