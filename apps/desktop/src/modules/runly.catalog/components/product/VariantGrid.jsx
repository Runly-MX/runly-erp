// apps/desktop/src/modules/runly.catalog/components/product/VariantGrid.jsx
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, ConfirmDialog, CurrencyField, Input, SectionCard, StatusPill } from '@runly/ui'
import { CircleSlash, Copy, Layers, Plus, Save, Trash2, Undo2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { formatCurrency } from '../../lib/formatCurrency.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { findIdentifierDuplicates, missingCombinations, variantLabel } from '../../lib/catalogRules.js'
import VariantCreateDialog from './VariantCreateDialog.jsx'

const th = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]'

function rowState(v, edit) {
  return {
    id: v.id,
    label: variantLabel(v.option_values) || 'Sin opciones',
    sku: edit?.sku ?? v.sku ?? '',
    barcode: edit?.barcode ?? v.barcode ?? '',
    inherit: edit?.inherit ?? Boolean(v.price_inherited),
    price: edit?.price ?? Number(v.price ?? 0),
  }
}

// Variant table on the real variant endpoints. Price is either the
// product's (price:null, shown as inherited) or the variant's own. Codes
// duplicated inside the product block the save; codes used by another
// product are only reported, because the server keeps historical duplicates
// and the scanner resolves them by asking.
export default function VariantGrid({ product, productId, token, canUpdate, disabledVariantIds = [], checkCatalogCode }) {
  const queryClient = useQueryClient()
  const variants = useMemo(() => product.variants ?? [], [product.variants])
  const [edits, setEdits] = useState({})
  const [selected, setSelected] = useState(() => new Set())
  const [confirm, setConfirm] = useState(null)
  const [createMode, setCreateMode] = useState(null)
  const [warnings, setWarnings] = useState({})
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-product', productId] })
    queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
  }

  const rows = variants.map((v) => rowState(v, edits[v.id]))
  const duplicates = findIdentifierDuplicates(product, rows)
  const missing = missingCombinations(product.options ?? [], variants)

  const save = useMutation({
    mutationFn: async ({ variant, row }) => {
      // PATCH /variants parses with a partial schema that still applies the
      // create defaults (option_values {} and price 0) to omitted fields, so
      // every write restates the current combination and price policy.
      const data = { option_values: variant.option_values ?? {}, price: row.inherit ? null : Number(row.price) || 0 }
      if ((row.sku.trim() || null) !== (variant.sku ?? null)) data.sku = row.sku.trim() || null
      if ((row.barcode.trim() || null) !== (variant.barcode ?? null)) data.barcode = row.barcode.trim() || null
      return runly.catalog.updateVariant(productId, variant.id, data, token)
    },
    onSuccess: (_, { variant }) => {
      setEdits((prev) => { const next = { ...prev }; delete next[variant.id]; return next })
      setWarnings((prev) => { const next = { ...prev }; delete next[variant.id]; return next })
      refresh(); toast.success('Variante guardada')
    },
    onError: (err) => toast.error(classifyCommerceError(err).message),
  })

  const bulk = useMutation({
    mutationFn: async ({ action, ids }) => {
      const call = action === 'inherit'
        ? (id) => runly.catalog.updateVariant(productId, id, { price: null, option_values: variants.find((v) => v.id === id)?.option_values ?? {} }, token)
        : (id) => runly.catalog.deleteVariant(productId, id, token)
      const results = await Promise.allSettled(ids.map(call))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) throw new Error(`${failed} de ${ids.length} variantes no se pudieron actualizar.`)
      return { action, count: ids.length }
    },
    onSuccess: ({ action, count }) => {
      toast.success(action === 'inherit' ? `${count} variante(s) usan ahora el precio del producto` : `${count} variante(s) eliminada(s)`)
      setSelected(new Set()); setConfirm(null); refresh()
    },
    onError: (err) => { toast.error(err.message); setConfirm(null); refresh() },
  })

  function edit(id, patch) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }))
  }

  // Only a code the user is changing can be blocked; historical duplicates
  // stay visible but never prevent saving another field of the row.
  function blocking(variant, row) {
    const dup = duplicates[row.id] ?? {}
    return Boolean((dup.sku && row.sku !== (variant.sku ?? '')) || (dup.barcode && row.barcode !== (variant.barcode ?? '')))
  }

  async function requestSave(variant, row) {
    if (blocking(variant, row)) return
    const changedCodes = [['sku', row.sku], ['barcode', row.barcode]].filter(([field, value]) => value.trim() && value.trim() !== (variant[field] ?? ''))
    if (checkCatalogCode && changedCodes.length && !warnings[row.id]?.acknowledged) {
      const uses = (await Promise.all(changedCodes.map(([, value]) => checkCatalogCode(value.trim())))).flat()
      if (uses.length) {
        setWarnings((prev) => ({ ...prev, [row.id]: { uses, acknowledged: false } }))
        return
      }
    }
    save.mutate({ variant, row })
  }

  const allSelected = variants.length > 0 && selected.size === variants.length
  const productPrice = formatCurrency(product.price, product.currency)

  return (
    <SectionCard
      title={`Variantes (${variants.length})`}
      icon={Layers}
      description={`Precio del producto: ${productPrice}. Las existencias por sucursal se ven en la pestaña Existencias.`}
      action={canUpdate && (
        <div className="flex flex-wrap gap-2">
          {missing.length > 0 && (
            <Button type="button" variant="outline" onClick={() => setCreateMode('generate')}>
              <Wand2 className="h-4 w-4" aria-hidden="true" /> Crear faltantes ({missing.length})
            </Button>
          )}
          <Button type="button" onClick={() => setCreateMode('single')} disabled={!(product.options ?? []).length}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Agregar variante
          </Button>
        </div>
      )}
    >
      {variants.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {(product.options ?? []).length ? 'Crea las combinaciones con «Crear faltantes» o agrega una variante.' : 'Agrega primero una opción, como Talla o Color.'}
        </p>
      ) : (
        <div className="space-y-3">
          {selected.size > 0 && canUpdate && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-(--brand-soft) px-3 py-2" role="region" aria-label="Acciones de la selección">
              <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{selected.size} seleccionada(s)</span>
              <span className="flex-1" />
              <Button type="button" variant="outline" onClick={() => setConfirm({ action: 'inherit' })}><Undo2 className="h-4 w-4" aria-hidden="true" /> Usar precio del producto</Button>
              <Button type="button" variant="outline" className="text-red-700 dark:text-red-300" onClick={() => setConfirm({ action: 'delete' })}><Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar</Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">Variantes de {product.name}</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  {canUpdate && <th scope="col" className={`${th} w-10`}><Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(variants.map((v) => v.id)))} aria-label="Seleccionar todas las variantes" /></th>}
                  <th scope="col" className={th}>Variante</th>
                  <th scope="col" className={th}>SKU</th>
                  <th scope="col" className={th}>Código de barras</th>
                  <th scope="col" className={th}>Precio</th>
                  <th scope="col" className={`${th} text-right`}>Existencias</th>
                  <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const row = rowState(variant, edits[variant.id])
                  const dup = duplicates[variant.id] ?? {}
                  const dirty = Boolean(edits[variant.id])
                  const warning = warnings[variant.id]
                  const blocked = disabledVariantIds.includes(variant.id)
                  return (
                    <tr key={variant.id} className={`border-b border-[hsl(var(--border))] align-top last:border-b-0 ${selected.has(variant.id) ? 'bg-(--brand-soft)' : ''}`}>
                      {canUpdate && (
                        <td className="px-3 py-3">
                          <Checkbox checked={selected.has(variant.id)} onCheckedChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(variant.id)) n.delete(variant.id); else n.add(variant.id); return n })} aria-label={`Seleccionar ${row.label}`} />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        <p className="font-semibold text-[hsl(var(--foreground))]">{row.label}</p>
                        {blocked && <StatusPill size="sm" tone="neutral" icon={CircleSlash} className="mt-1">Bloqueada en POS</StatusPill>}
                      </td>
                      <td className="px-3 py-2">
                        <CodeInput label={`SKU de ${row.label}`} value={row.sku} onChange={(v) => edit(variant.id, { sku: v })} duplicateOf={dup.sku} disabled={!canUpdate} />
                      </td>
                      <td className="px-3 py-2">
                        <CodeInput label={`Código de barras de ${row.label}`} value={row.barcode} onChange={(v) => edit(variant.id, { barcode: v })} duplicateOf={dup.barcode} disabled={!canUpdate} numeric />
                      </td>
                      <td className="px-3 py-2">
                        <div className="w-44 space-y-1.5">
                          <label className="flex min-h-9 items-center gap-2 text-sm text-[hsl(var(--foreground))]">
                            <Checkbox checked={row.inherit} onCheckedChange={(v) => edit(variant.id, { inherit: Boolean(v), price: row.price })} disabled={!canUpdate} aria-label={`${row.label}: usar el precio del producto`} />
                            Precio del producto
                          </label>
                          {row.inherit ? (
                            <p className="text-sm font-semibold tabular-nums text-[hsl(var(--foreground))]">{productPrice} <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">heredado</span></p>
                          ) : (
                            <CurrencyField aria-label={`Precio propio de ${row.label}`} value={row.price} onChange={(v) => edit(variant.id, { price: v })} currency={product.currency} min={0} disabled={!canUpdate} />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[hsl(var(--foreground))]">
                        {product.track_stock ? Number(variant.stock ?? 0) : <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">Sin control</span>}
                      </td>
                      <td className="px-3 py-2">
                        {canUpdate && (
                          <div className="flex items-center justify-end gap-1">
                            {dirty && (
                              <>
                                <Button type="button" size="icon" onClick={() => requestSave(variant, row)} disabled={save.isPending || blocking(variant, row)} aria-label={`Guardar ${row.label}`} title="Guardar">
                                  <Save className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" onClick={() => { setEdits((p) => { const n = { ...p }; delete n[variant.id]; return n }); setWarnings((p) => { const n = { ...p }; delete n[variant.id]; return n }) }} aria-label={`Descartar cambios de ${row.label}`} title="Descartar">
                                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                            <Button type="button" variant="ghost" size="icon" onClick={() => setConfirm({ action: 'delete', ids: [variant.id], label: row.label })} aria-label={`Eliminar ${row.label}`} title="Eliminar">
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        )}
                        {warning && !warning.acknowledged && (
                          <div role="alert" className="mt-2 w-64 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                            <p className="font-semibold">Código en uso</p>
                            <p>Ya lo usa {warning.uses.join(', ')}. El escáner pedirá elegir entre ellos.</p>
                            <div className="mt-2 flex gap-2">
                              <Button type="button" size="sm" className="h-9" onClick={() => { setWarnings((p) => ({ ...p, [variant.id]: { ...warning, acknowledged: true } })); save.mutate({ variant, row }) }}>Guardar igual</Button>
                              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setWarnings((p) => { const n = { ...p }; delete n[variant.id]; return n })}>Cambiar código</Button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => !v && setConfirm(null)}
        icon={confirm?.action === 'inherit' ? Undo2 : Trash2}
        tone={confirm?.action === 'inherit' ? 'warning' : 'destructive'}
        title={confirm?.action === 'inherit' ? 'Usar el precio del producto' : confirm?.label ? `Eliminar ${confirm.label}` : 'Eliminar variantes'}
        description={confirm?.action === 'inherit'
          ? `Las variantes seleccionadas dejarán su precio propio y cobrarán ${productPrice}. Las ventas anteriores conservan su precio.`
          : 'Dejarán de venderse y de mostrarse. Su historial de ventas y movimientos se conserva.'}
        detail={confirm?.ids ? undefined : `${selected.size} variante(s)`}
        confirmLabel={confirm?.action === 'inherit' ? 'Usar precio del producto' : 'Eliminar'}
        onConfirm={() => bulk.mutate({ action: confirm.action, ids: confirm.ids ?? [...selected] })}
        loading={bulk.isPending}
      />
      {createMode && (
        <VariantCreateDialog
          mode={createMode}
          onClose={() => setCreateMode(null)}
          product={product}
          productId={productId}
          token={token}
          missing={missing}
          onDone={refresh}
        />
      )}
    </SectionCard>
  )
}

function CodeInput({ label, value, onChange, duplicateOf, disabled, numeric }) {
  const errorId = `${label.replace(/\W+/g, '-')}-dup`
  return (
    <div className="w-40 space-y-1">
      <Input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        inputMode={numeric ? 'numeric' : undefined}
        aria-invalid={Boolean(duplicateOf)}
        aria-describedby={duplicateOf ? errorId : undefined}
        className={`h-10 font-mono ${duplicateOf ? 'border-2 border-red-600 dark:border-red-400' : ''}`}
        disabled={disabled}
      />
      {duplicateOf && (
        <p id={errorId} className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300">
          <Copy className="h-3 w-3" aria-hidden="true" /> Igual que {duplicateOf}
        </p>
      )}
    </div>
  )
}
