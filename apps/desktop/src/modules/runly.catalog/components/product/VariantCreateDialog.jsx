// apps/desktop/src/modules/runly.catalog/components/product/VariantCreateDialog.jsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, CurrencyField, SelectField, TextField } from '@runly/ui'
import { Layers, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { combinationExists, missingCombinations, variantLabel } from '../../lib/catalogRules.js'
import FormDialog from '../FormDialog.jsx'
import ToggleRow from '../ToggleRow.jsx'

// Creates one chosen combination, or every missing one. Before each create
// the combinations are recomputed from a fresh read of the product, so a
// retry after a lost response never adds a duplicate variant.
export default function VariantCreateDialog({ mode, onClose, product, productId, token, missing, onDone }) {
  const queryClient = useQueryClient()
  const options = product.options ?? []
  const [values, setValues] = useState(() => Object.fromEntries(options.map((o) => [o.name, ''])))
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [ownPrice, setOwnPrice] = useState(false)
  const [price, setPrice] = useState(Number(product.price ?? 0))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)

  async function freshVariants() {
    const data = await queryClient.fetchQuery({
      queryKey: ['catalog-product', productId, token],
      queryFn: () => runly.catalog.getProduct(productId, token),
      staleTime: 0,
    })
    return data?.data?.variants ?? []
  }

  async function createOne() {
    if (options.some((o) => !values[o.name])) { setError('Elige un valor para cada opción.'); return }
    if (combinationExists(values, product.variants ?? [], options.map((o) => o.name))) { setError('Esa combinación ya existe.'); return }
    setBusy(true); setError('')
    try {
      if (combinationExists(values, await freshVariants(), options.map((o) => o.name))) { setError('Esa combinación ya existe.'); return }
      await runly.catalog.createVariant(productId, {
        option_values: values, sku: sku.trim() || null, barcode: barcode.trim() || null, price: ownPrice ? Number(price) || 0 : null,
      }, token)
      toast.success(`Variante ${variantLabel(values)} creada`)
      onDone(); onClose()
    } catch (err) {
      setError(classifyCommerceError(err).message)
    } finally {
      setBusy(false)
    }
  }

  async function createMissing() {
    setBusy(true); setError('')
    let created = 0
    try {
      const pending = missingCombinations(options, await freshVariants())
      setProgress({ done: 0, total: pending.length })
      for (const combo of pending) {
        await runly.catalog.createVariant(productId, { option_values: combo, price: null }, token)
        created += 1
        setProgress({ done: created, total: pending.length })
      }
      toast.success(created ? `${created} variante(s) creada(s) con el precio del producto` : 'No faltaba ninguna combinación')
      onDone(); onClose()
    } catch (err) {
      onDone()
      setError(`Se crearon ${created}. Se detuvo por: ${classifyCommerceError(err).message} Al reintentar sólo se crean las que sigan faltando.`)
    } finally {
      setBusy(false)
    }
  }

  const generate = mode === 'generate'
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      icon={generate ? Wand2 : Layers}
      title={generate ? 'Crear combinaciones faltantes' : 'Agregar variante'}
      description={generate ? 'Sólo se crean las combinaciones que todavía no existen. Las variantes actuales no cambian.' : 'Elige la combinación. SKU, código y precio son opcionales.'}
      size="md"
      onSubmit={generate ? createMissing : createOne}
      footer={(
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button type="submit" size="lg" loading={busy} disabled={busy || (generate && missing.length === 0)}>
            {generate ? (error ? 'Reintentar' : `Crear ${missing.length}`) : 'Crear variante'}
          </Button>
        </>
      )}
    >
      {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">{error}</p>}
      {generate ? (
        <div className="space-y-3">
          {progress && <p aria-live="polite" className="text-sm text-[hsl(var(--muted-foreground))]">Creando {progress.done} de {progress.total}...</p>}
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--foreground))]">
            {missing.map((combo) => <li key={variantLabel(combo)}>{variantLabel(combo)}</li>)}
          </ul>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Usarán el precio del producto y empezarán sin existencias. Después puedes ajustar cada una.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <SelectField
                key={option.id}
                label={option.name}
                required
                options={option.values.map((v) => ({ value: v.value, label: v.value }))}
                value={values[option.name]}
                onValueChange={(v) => setValues((prev) => ({ ...prev, [option.name]: v }))}
                placeholder="Elige"
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={100} icon={null} />
            <TextField label="Código de barras" value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={100} inputMode="numeric" icon={null} />
          </div>
          <ToggleRow id="variant-own-price" label="Precio propio" description="Si no, usa el precio del producto y lo sigue cuando cambie." checked={ownPrice} onChange={setOwnPrice} />
          {ownPrice && <CurrencyField label="Precio" value={price} onChange={setPrice} currency={product.currency} min={0} />}
        </div>
      )}
    </FormDialog>
  )
}
