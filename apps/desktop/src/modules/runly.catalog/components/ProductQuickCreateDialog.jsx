// apps/desktop/src/modules/runly.catalog/components/ProductQuickCreateDialog.jsx
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button, ComboboxField, CurrencyField, NumberField, SegmentedControl, SelectField, TextField,
} from '@runly/ui'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { classifyCommerceError, createAttemptTracker } from '../lib/commerceCommand.js'
import { CURRENCY_OPTIONS, useCatalogCategories, useCatalogOutlets, usePosDefaults } from '../lib/catalogData.js'
import { parseTaxRate, parseWholeQuantity, slugify } from '../lib/catalogRules.js'
import CommandFailureAlert from './CommandFailureAlert.jsx'
import FormDialog from './FormDialog.jsx'
import ProductImageManager from './ProductImageManager.jsx'
import ToggleRow from './ToggleRow.jsx'

const TYPE_OPTIONS = [
  { value: 'SIMPLE', label: 'Simple' },
  { value: 'VARIABLE', label: 'Con variantes' },
]
const TAX_OPTIONS = [
  { value: 'inherit', label: 'El de POS' },
  { value: 'custom', label: 'Propio' },
]

function initialForm(currency) {
  return {
    name: '', type: 'SIMPLE', price: 0, currency, categoryId: '', coverId: null, imageIds: [],
    pos: true, taxMode: 'inherit', taxRate: '16', taxIncluded: true,
    trackStock: false, initialQty: '', outletId: '',
  }
}

// Essentials first (name, price, category, image, POS, tax). The product row
// is created once; POS, tax and opening stock are separate authorized
// commands, so a failure there never creates a second product.
export default function ProductQuickCreateDialog({ open, onOpenChange, token, canAdjustStock, onCreated }) {
  const queryClient = useQueryClient()
  const defaults = usePosDefaults(token)
  const categories = useCatalogCategories(token)
  const { outlets, forbidden: outletsForbidden } = useCatalogOutlets(token)
  const [form, setForm] = useState(() => initialForm(defaults.currency ?? 'MXN'))
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [saving, setSaving] = useState(false)
  const created = useRef(null)
  const lostCreate = useRef(false)
  const trackers = useRef({ pos: createAttemptTracker('cat-pos'), tax: createAttemptTracker('cat-tax'), stock: createAttemptTracker('cat-open') })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const isVariable = form.type === 'VARIABLE'
  const qty = parseWholeQuantity(form.initialQty)

  function reset() {
    setForm(initialForm(defaults.currency ?? 'MXN'))
    setErrors({}); setFailure(null)
    created.current = null; lostCreate.current = false
    Object.values(trackers.current).forEach((t) => t.reset())
  }

  function close(next) {
    if (saving) return
    onOpenChange(next)
    if (!next) reset()
  }

  function validate() {
    const next = {}
    if (!form.name.trim()) next.name = 'Escribe el nombre del producto.'
    else if (!slugify(form.name)) next.name = 'Usa al menos una letra o número en el nombre.'
    if (!(Number(form.price) >= 0)) next.price = 'El precio no puede ser negativo.'
    if (form.taxMode === 'custom' && parseTaxRate(form.taxRate) === null) next.taxRate = 'Escribe una tasa entre 0 y 100, con hasta cuatro decimales.'
    if (!isVariable && form.trackStock && form.initialQty !== '') {
      if (qty === null) next.initialQty = 'Usa un número entero mayor que cero.'
      else if (!form.outletId) next.outletId = 'Elige la sucursal donde están estas unidades.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function createRow() {
    const base = slugify(form.name)
    const body = {
      name: form.name.trim(), product_type: form.type, price: Number(form.price) || 0, currency: form.currency,
      category_id: form.categoryId || null, cover_asset_id: form.coverId, images: form.imageIds,
      track_stock: !isVariable && form.trackStock,
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
      try {
        return (await runly.catalog.createProduct({ ...body, slug }, token)).data
      } catch (error) {
        if (error?.status === 409 && lostCreate.current && attempt === 0) {
          throw Object.assign(new Error('El producto probablemente ya se creó en el intento anterior. Búscalo en el listado antes de crearlo otra vez.'), { status: 409 })
        }
        if (error?.status !== 409) {
          if (classifyCommerceError(error).kind === 'lost') lostCreate.current = true
          throw error
        }
      }
    }
    throw Object.assign(new Error('Ya existen productos con ese nombre. Cambia el nombre e inténtalo de nuevo.'), { status: 409 })
  }

  async function runStep(name, tracker, call, body) {
    try {
      await call(body, { idempotencyKey: tracker.keyFor(body) })
      tracker.reset()
      return null
    } catch (error) {
      const info = classifyCommerceError(error)
      if (!info.retrySameKey) tracker.reset()
      return { step: name, info }
    }
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true); setFailure(null)
    try {
      if (!created.current) created.current = await createRow()
      const id = created.current.id
      const pending = []
      if (!form.pos) {
        pending.push(await runStep('la disponibilidad en POS', trackers.current.pos,
          (b, o) => runly.catalogCommerce.setAvailability(id, b, token, o), { enabled: false }))
      }
      if (form.taxMode === 'custom') {
        pending.push(await runStep('el impuesto', trackers.current.tax,
          (b, o) => runly.catalogCommerce.setCommercialTax(id, b, token, o), { rate: parseTaxRate(form.taxRate), included: form.taxIncluded }))
      }
      if (!isVariable && form.trackStock && qty) {
        pending.push(await runStep('la existencia inicial', trackers.current.stock,
          (b, o) => runly.catalogCommerce.adjustStock(id, b, token, o), { outletId: form.outletId, quantityDelta: qty, reason: 'Existencia inicial' }))
      }
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
      queryClient.invalidateQueries({ queryKey: ['catalog-product-stats'] })
      const failed = pending.filter(Boolean)
      if (failed.length) {
        const first = failed[0]
        if (first.info.kind === 'lost') {
          setFailure({ ...first.info, message: `El producto se creó, pero no confirmamos ${first.step}. ${first.info.message}` })
          return
        }
        toast.error(`El producto se creó, pero no se guardó ${failed.map((f) => f.step).join(' ni ')}: ${first.info.message}`)
      } else {
        toast.success('Producto creado')
      }
      const row = created.current
      onOpenChange(false); reset()
      onCreated?.(row)
    } catch (error) {
      setFailure(error?.status === 409 ? { kind: 'conflict', message: error.message } : classifyCommerceError(error))
    } finally {
      setSaving(false)
    }
  }

  const categoryOptions = [{ value: '', label: 'Sin categoría' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]
  const outletOptions = outlets.map((o) => ({ value: o.id, label: o.name }))
  const effectiveTax = defaults.taxRate != null
    ? `${Number(defaults.taxRate)} %${defaults.pricesIncludeTax ? ', incluido en el precio' : ', se suma al precio'}`
    : null

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      icon={PackagePlus}
      title="Nuevo producto"
      description="Lo esencial para empezar a vender. Lo demás se completa después en la ficha."
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={() => close(false)} disabled={saving}>Cancelar</Button>
          <Button type="submit" size="lg" loading={saving} disabled={saving}>
            {created.current ? 'Terminar' : 'Crear producto'}
          </Button>
        </>
      )}
    >
      <CommandFailureAlert failure={failure} onRetry={handleSubmit} retrying={saving} />

      <TextField
        label="Nombre"
        required
        autoFocus
        value={form.name}
        onChange={(e) => set({ name: e.target.value })}
        error={errors.name}
        placeholder="Ej. Café americano"
        maxLength={200}
        disabled={Boolean(created.current)}
      />

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]" id="qc-type">Tipo</p>
        <SegmentedControl ariaLabel="Tipo de producto" options={TYPE_OPTIONS} value={form.type} onChange={(v) => set({ type: v })} disabled={Boolean(created.current)} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {isVariable ? 'Tallas, colores u otras opciones. Las variantes se agregan en la ficha.' : 'Un solo artículo, con su precio y su código.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <CurrencyField
          label={isVariable ? 'Precio base' : 'Precio'}
          required
          value={form.price}
          onChange={(v) => set({ price: v })}
          currency={form.currency}
          min={0}
          error={errors.price}
          hint={isVariable ? 'Las variantes pueden usarlo o tener uno propio.' : undefined}
          disabled={Boolean(created.current)}
        />
        <SelectField label="Moneda" options={CURRENCY_OPTIONS} value={form.currency} onValueChange={(v) => set({ currency: v })} disabled={Boolean(created.current)} />
      </div>
      {defaults.currency && form.currency !== defaults.currency && (
        <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
          El punto de venta cobra en {defaults.currency}: un producto en {form.currency} no se podrá vender en POS.
        </p>
      )}

      <ComboboxField
        label="Categoría"
        options={categoryOptions}
        value={form.categoryId}
        onChange={(v) => set({ categoryId: v })}
        placeholder="Sin categoría"
        searchPlaceholder="Buscar categoría..."
        emptyText="Sin resultados"
        disabled={Boolean(created.current)}
      />

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Imagen</p>
        <ProductImageManager
          token={token}
          coverId={form.coverId}
          imageIds={form.imageIds}
          onChange={({ coverId, imageIds }) => set({ coverId, imageIds })}
        />
      </div>

      <ToggleRow
        id="qc-pos"
        label="Disponible en punto de venta"
        description="Se podrá vender en todas las sucursales. Publicarlo en la web es aparte y se decide en la ficha."
        checked={form.pos}
        onChange={(v) => set({ pos: v })}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Impuesto</p>
        <SegmentedControl ariaLabel="Impuesto" options={TAX_OPTIONS} value={form.taxMode} onChange={(v) => set({ taxMode: v })} />
        {form.taxMode === 'inherit' ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {effectiveTax ? `Usará el impuesto configurado en POS: ${effectiveTax}.` : 'Usará el impuesto configurado en el punto de venta.'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <TextField label="Tasa (%)" inputMode="decimal" value={form.taxRate} onChange={(e) => set({ taxRate: e.target.value })} error={errors.taxRate} icon={null} />
            <ToggleRow id="qc-tax-included" label="Incluido en el precio" checked={form.taxIncluded} onChange={(v) => set({ taxIncluded: v })} />
          </div>
        )}
      </div>

      {!isVariable && (
        <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
          <ToggleRow
            id="qc-track"
            label="Controlar existencias"
            description="Actívalo si cuentas unidades. Servicios y platillos preparados normalmente no lo necesitan."
            checked={form.trackStock}
            onChange={(v) => set({ trackStock: v })}
          />
          {form.trackStock && (canAdjustStock && !outletsForbidden && outlets.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Existencia inicial (opcional)" value={form.initialQty} onChange={(e) => set({ initialQty: e.target.value })} min={1} step={1} error={errors.initialQty} />
              <SelectField label="Sucursal" options={outletOptions} value={form.outletId} onValueChange={(v) => set({ outletId: v })} placeholder="Elige una sucursal" error={errors.outletId} />
            </div>
          ) : (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Podrás registrar unidades por sucursal desde la pestaña Existencias de la ficha.
            </p>
          ))}
        </div>
      )}
    </FormDialog>
  )
}
