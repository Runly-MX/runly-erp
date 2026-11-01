// apps/desktop/src/modules/runly.catalog/components/product/ProductStockTab.jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorState, SectionCard, Skeleton, StatusPill } from '@runly/ui'
import { ArrowDownToLine, ArrowRightLeft, Boxes, PackageOpen, TriangleAlert, Warehouse } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyCommerceError } from '../../lib/commerceCommand.js'
import { variantLabel } from '../../lib/catalogRules.js'
import { StockAdjustDialog, StockAllocateDialog, UNALLOCATED } from './StockDialogs.jsx'
import StockMovementsList from './StockMovementsList.jsx'

const th = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]'

function Quantity({ value }) {
  if (value < 0) return <span className="inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-300"><TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />{value}<span className="sr-only"> (saldo negativo)</span></span>
  if (value === 0) return <span className="font-semibold text-[hsl(var(--muted-foreground))]">0<span className="sr-only"> (agotado)</span></span>
  return <span className="font-semibold text-[hsl(var(--foreground))]">{value}</span>
}

// C5 balances per outlet and «Sin asignar», read from the server as they
// are: the client never sums or fills in a quantity. Variable products show
// one row per variant; the legacy parent stock (if any) is listed apart.
export default function ProductStockTab({ product, token, access, saver, productId }) {
  const isVariable = product.product_type === 'VARIABLE'
  const [dialog, setDialog] = useState(null)
  const [confirmUntrack, setConfirmUntrack] = useState(false)

  const balancesQuery = useQuery({
    queryKey: ['catalog-stock-balances', productId, token],
    queryFn: () => runly.catalogCommerce.stockBalances(productId, {}, token),
    enabled: Boolean(token && product.track_stock),
    staleTime: 10_000,
  })
  // Outlet names come from the catalog availability read, which a catalog
  // user can always make (GET /pos/outlets needs POS permissions).
  const outletsQuery = useQuery({
    queryKey: ['catalog-pos-availability', productId, token],
    queryFn: () => runly.catalogCommerce.availability(productId, {}, token),
    enabled: Boolean(token && product.track_stock),
    staleTime: 15_000,
  })
  const outlets = (outletsQuery.data?.data?.outlets ?? []).map((o) => ({ id: o.outletId, name: o.name }))

  if (!product.track_stock) {
    return (
      <SectionCard title="Existencias" icon={Boxes}>
        <EmptyState
          icon={PackageOpen}
          title="Este producto no controla existencias"
          description="Se puede vender sin contar unidades. Actívalo si quieres saber cuántas hay en cada sucursal y evitar vender de más."
          action={access.canUpdate ? { label: 'Controlar existencias', onClick: () => saver.save({ track_stock: true }, { track_stock: false }, { successMessage: 'Ahora este producto controla existencias' }) } : undefined}
        />
      </SectionCard>
    )
  }

  const balances = balancesQuery.data?.data ?? []
  const items = isVariable
    ? (product.variants ?? []).map((v) => ({ id: v.id, label: variantLabel(v.option_values) || 'Sin opciones' }))
    : [{ id: null, label: product.name }]
  const qty = (variantId, outletId) => balances.find((b) => (b.variantId ?? null) === variantId && (b.outletId ?? null) === outletId)?.quantity ?? 0
  const legacyParent = isVariable ? balances.filter((b) => b.variantId == null && b.quantity !== 0) : []
  const loading = balancesQuery.isPending || outletsQuery.isPending
  const error = balancesQuery.error ?? outletsQuery.error

  return (
    <div className="space-y-5">
      <SectionCard
        title="Existencias por sucursal"
        icon={Warehouse}
        description="Unidades que tiene cada sucursal. «Sin asignar» son las registradas antes de controlar por sucursal: no se venden en POS hasta asignarlas."
        action={access.canUpdate && (
          <Button type="button" variant="ghost" onClick={() => setConfirmUntrack(true)}>Dejar de controlar</Button>
        )}
      >
        {loading ? (
          <div className="space-y-2" aria-label="Cargando existencias"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : error ? (
          <ErrorState title="No se pudieron leer las existencias" description={classifyCommerceError(error).message} onRetry={() => { balancesQuery.refetch(); outletsQuery.refetch() }} />
        ) : items.length === 0 ? (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Crea variantes para registrar sus existencias.</p>
        ) : (
          <>
          <ul className="space-y-3 sm:hidden" aria-label={`Existencias de ${product.name} por sucursal`}>
            {items.map((item) => {
              const unallocated = qty(item.id, null)
              return (
                <li key={item.id ?? 'base'} className="rounded-xl border border-[hsl(var(--border))] p-3">
                  <p className="mb-2 font-semibold text-[hsl(var(--foreground))]">{item.label}</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {outlets.map((o) => (
                      <div key={o.id} className="contents"><dt className="text-[hsl(var(--muted-foreground))]">{o.name}</dt><dd className="text-right tabular-nums"><Quantity value={qty(item.id, o.id)} /></dd></div>
                    ))}
                    <dt className="text-[hsl(var(--muted-foreground))]">Sin asignar</dt>
                    <dd className="text-right tabular-nums">{unallocated !== 0 ? <StatusPill size="sm" tone={unallocated < 0 ? 'danger' : 'warning'} icon={TriangleAlert}>{unallocated}</StatusPill> : <Quantity value={0} />}</dd>
                  </dl>
                  {access.canAdjustStock && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {unallocated > 0 && outlets.length > 0 && (
                        <Button type="button" variant="outline" size="lg" onClick={() => setDialog({ kind: 'allocate', item, unallocated })}><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Asignar</Button>
                      )}
                      <Button type="button" variant="outline" size="lg" className={unallocated > 0 && outlets.length > 0 ? '' : 'col-span-2'} onClick={() => setDialog({ kind: 'adjust', item, location: unallocated < 0 ? UNALLOCATED : '' })}><ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> {unallocated < 0 ? 'Corregir' : 'Ajustar'}</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-[hsl(var(--border))] sm:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Existencias de {product.name} por sucursal</caption>
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
                  <th scope="col" className={`${th} text-left`}>{isVariable ? 'Variante' : 'Artículo'}</th>
                  {outlets.map((o) => <th key={o.id} scope="col" className={`${th} text-right`}>{o.name}</th>)}
                  <th scope="col" className={`${th} text-right`}>Sin asignar</th>
                  <th scope="col" className={th}><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const unallocated = qty(item.id, null)
                  return (
                    <tr key={item.id ?? 'base'} className="border-b border-[hsl(var(--border))] last:border-b-0">
                      <th scope="row" className="px-3 py-3 text-left font-semibold text-[hsl(var(--foreground))]">{item.label}</th>
                      {outlets.map((o) => <td key={o.id} className="px-3 py-3 text-right tabular-nums"><Quantity value={qty(item.id, o.id)} /></td>)}
                      <td className="px-3 py-3 text-right tabular-nums">
                        {unallocated !== 0
                          ? <StatusPill size="sm" tone={unallocated < 0 ? 'danger' : 'warning'} icon={TriangleAlert}>{unallocated}</StatusPill>
                          : <Quantity value={0} />}
                      </td>
                      <td className="px-3 py-2">
                        {access.canAdjustStock && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {unallocated > 0 && outlets.length > 0 && (
                              <Button type="button" variant="outline" onClick={() => setDialog({ kind: 'allocate', item, unallocated })}>
                                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Asignar
                              </Button>
                            )}
                            <Button type="button" variant="outline" onClick={() => setDialog({ kind: 'adjust', item, location: unallocated < 0 ? UNALLOCATED : '' })}>
                              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> {unallocated < 0 ? 'Corregir' : 'Ajustar'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        {outlets.length === 0 && !loading && !error && (
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">No hay sucursales activas: las unidades quedan «Sin asignar» hasta que crees una.</p>
        )}
        {legacyParent.length > 0 && (
          <p className="mt-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Hay unidades registradas en el producto antes de usar variantes ({legacyParent.map((b) => `${b.outletName ?? 'Sin asignar'}: ${b.quantity}`).join(', ')}). Se conservan, pero no se venden ni se suman a ninguna variante.
          </p>
        )}
      </SectionCard>

      <StockMovementsList productId={productId} token={token} isVariable={isVariable} variants={product.variants ?? []} outlets={outlets} />

      {dialog?.kind === 'allocate' && (
        <StockAllocateDialog
          open
          onClose={() => setDialog(null)}
          productId={productId}
          token={token}
          itemLabel={dialog.item.label}
          variantId={dialog.item.id}
          unallocated={dialog.unallocated}
          outlets={outlets}
        />
      )}
      {dialog?.kind === 'adjust' && (
        <StockAdjustDialog
          open
          onClose={() => setDialog(null)}
          productId={productId}
          token={token}
          itemLabel={dialog.item.label}
          variantId={dialog.item.id}
          outlets={outlets}
          defaultLocation={dialog.location}
        />
      )}
      <ConfirmDialog
        open={confirmUntrack}
        onOpenChange={setConfirmUntrack}
        icon={PackageOpen}
        tone="warning"
        title="Dejar de controlar existencias"
        description="Se podrá vender sin contar unidades. Los saldos y movimientos actuales se conservan por si vuelves a activarlo."
        confirmLabel="Dejar de controlar"
        onConfirm={() => { saver.save({ track_stock: false }, { track_stock: true }, { successMessage: 'Este producto ya no controla existencias' }); setConfirmUntrack(false) }}
      />
    </div>
  )
}
