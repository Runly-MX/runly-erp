// apps/desktop/src/modules/runly.catalog/screens/CatalogInventoryScreen.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, PageHeader, SearchInput, SelectField, Skeleton, StatusPill } from '@runly/ui'
import { ArrowDownToLine, ArrowRightLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ImageOff, Lock, PackageSearch, Store } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { StockAdjustDialog, StockAllocateDialog } from '../components/product/StockDialogs.jsx'
import { useCatalogAccess, useCatalogCategories, useCatalogOutlets } from '../lib/catalogData.js'
import { classifyCommerceError } from '../lib/commerceCommand.js'
import { STOCK_STATE_META } from '../lib/catalogRules.js'

const PAGE_SIZE = 25
const OUTLET_KEY = 'runly.catalog.stockOutlet'
const ALL = '__all__'

function readStoredOutlet() {
  try { return localStorage.getItem(OUTLET_KEY) ?? '' } catch { return '' }
}

// Commercial stock of one outlet through C1 sellables: units at the outlet,
// historical «Sin asignar» units and why an item cannot be sold there. The
// outlet is always an explicit choice (remembered per browser), never the
// first row. Unrelated to runly.inventory assets.
export default function CatalogInventoryScreen() {
  const { token, canAdjustStock } = useCatalogAccess()
  const navigate = useNavigate()
  const { outlets, isPending: outletsPending, forbidden } = useCatalogOutlets(token)
  const categories = useCatalogCategories(token)
  const [outletId, setOutletId] = useState(readStoredOutlet)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [categoryId, setCategoryId] = useState(ALL)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(() => new Set())
  const [dialog, setDialog] = useState(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t) }, [search])
  const validOutlet = outlets.some((o) => o.id === outletId) ? outletId : ''
  const outlet = outlets.find((o) => o.id === validOutlet)

  function chooseOutlet(id) {
    setOutletId(id); setPage(1); setExpanded(new Set())
    try { localStorage.setItem(OUTLET_KEY, id) } catch { /* private mode */ }
  }

  const query = useQuery({
    queryKey: ['catalog-outlet-stock', validOutlet, token, debounced, categoryId, page],
    queryFn: () => runly.commerce.sellables({ outletId: validOutlet, search: debounced || undefined, categoryId: categoryId === ALL ? undefined : categoryId, page, pageSize: PAGE_SIZE }, token),
    enabled: Boolean(token && validOutlet),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })
  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1

  const outletPicker = outlets.length > 0 && (
    <SelectField
      label="Sucursal"
      options={outlets.map((o) => ({ value: o.id, label: o.name }))}
      value={validOutlet}
      onValueChange={chooseOutlet}
      placeholder="Elige una sucursal"
      className="w-full sm:w-64"
    />
  )

  let body
  if (outletsPending) body = <Skeleton className="h-40 rounded-xl" />
  else if (forbidden) body = <EmptyState icon={Lock} title="Necesitas acceso al punto de venta" description="Las existencias por sucursal se leen con los permisos de POS. Pide a un administrador acceso de lectura a Caja o Terminal. Cada producto muestra sus existencias en su ficha." />
  else if (outlets.length === 0) body = <EmptyState icon={Store} title="No hay sucursales activas" description="Crea una sucursal en la configuración del punto de venta para registrar existencias por ubicación." />
  else if (!validOutlet) body = <EmptyState icon={Store} title="Elige una sucursal" description="Verás las unidades de esa sucursal, las que siguen sin asignar y qué no se puede vender ahí." />
  else if (query.isPending) body = <div className="space-y-2" aria-label="Cargando existencias">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
  else if (query.isError) {
    const info = classifyCommerceError(query.error)
    body = <ErrorState title={info.kind === 'config' ? 'Falta configurar el punto de venta' : 'No se pudieron leer las existencias'} description={info.message} onRetry={query.refetch} />
  } else if (rows.length === 0) {
    body = <EmptyState icon={PackageSearch} title="Sin resultados" description={debounced ? `Nada coincide con «${debounced}».` : 'No hay productos activos en esta categoría.'} />
  } else {
    body = (
      <ul className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label={`Existencias en ${outlet?.name}`}>
        {rows.map((item) => (
          <SellableRow
            key={item.id}
            item={item}
            token={token}
            outletId={validOutlet}
            expanded={expanded.has(item.productId)}
            onToggle={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(item.productId)) n.delete(item.productId); else n.add(item.productId); return n })}
            onOpen={() => navigate(`/app/m/runly.catalog/${item.productId}`)}
            onAction={canAdjustStock ? (kind, target) => setDialog({ kind, item: target }) : null}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="min-h-dvh space-y-5 p-4 md:p-6">
      <PageHeader eyebrow="Catálogo" title="Existencias por sucursal" description="Cuántas unidades tiene cada sucursal para vender, y cuáles siguen sin asignar." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {outletPicker}
        {validOutlet && (
          <>
            <SearchInput value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar por nombre, SKU o código" aria-label="Buscar producto por nombre, SKU o código" className="sm:max-w-sm" />
            <SelectField aria-label="Categoría" className="w-full sm:w-56" value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1) }}
              options={[{ value: ALL, label: 'Todas las categorías' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          </>
        )}
      </div>

      <div aria-busy={query.isFetching}>{body}</div>

      {validOutlet && pagination && pagination.total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-[hsl(var(--muted-foreground))]" aria-label="Paginación de existencias">
          <span aria-live="polite">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} de {pagination.total} productos</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setPage(page - 1)} disabled={page <= 1 || query.isFetching} aria-label="Página anterior" className="max-sm:h-11"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior</Button>
              <span className="tabular-nums">Página {page} de {totalPages}</span>
              <Button variant="outline" onClick={() => setPage(page + 1)} disabled={!pagination.hasMore || query.isFetching} aria-label="Página siguiente" className="max-sm:h-11">Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
          )}
        </nav>
      )}

      {dialog?.kind === 'allocate' && (
        <StockAllocateDialog open onClose={() => setDialog(null)} productId={dialog.item.productId} token={token} itemLabel={dialog.item.label}
          variantId={dialog.item.variantId} unallocated={dialog.item.unallocatedStock} outlets={outlets} defaultOutletId={validOutlet} />
      )}
      {dialog?.kind === 'adjust' && (
        <StockAdjustDialog open onClose={() => setDialog(null)} productId={dialog.item.productId} token={token} itemLabel={dialog.item.label}
          variantId={dialog.item.variantId} outlets={outlets} defaultLocation={validOutlet} />
      )}
    </div>
  )
}

function StockCells({ item, onAction, label }) {
  const meta = STOCK_STATE_META[item.stockState] ?? STOCK_STATE_META.UNTRACKED
  const target = { productId: item.productId, variantId: item.variantId, label, unallocatedStock: item.unallocatedStock }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
      {item.trackStock && item.stock != null && (
        <span className="text-sm text-[hsl(var(--muted-foreground))]">Aquí: <strong className={`tabular-nums ${item.stock < 0 ? 'text-red-700 dark:text-red-300' : 'text-[hsl(var(--foreground))]'}`}>{item.stock}</strong></span>
      )}
      {item.trackStock && item.unallocatedStock != null && item.unallocatedStock !== 0 && (
        <span className="text-sm text-[hsl(var(--muted-foreground))]">Sin asignar: <strong className="tabular-nums text-amber-900 dark:text-amber-300">{item.unallocatedStock}</strong></span>
      )}
      <StatusPill size="sm" tone={meta.tone}>{meta.label}</StatusPill>
      {onAction && item.trackStock && !item.requiresVariant && (
        <span className="flex gap-2">
          {item.unallocatedStock > 0 && (
            <Button type="button" variant="outline" onClick={() => onAction('allocate', target)} aria-label={`Asignar unidades de ${label}`}><ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Asignar</Button>
          )}
          <Button type="button" variant="outline" onClick={() => onAction('adjust', target)} aria-label={`Ajustar existencias de ${label}`}><ArrowDownToLine className="h-4 w-4" aria-hidden="true" /> Ajustar</Button>
        </span>
      )}
    </div>
  )
}

function SellableRow({ item, token, outletId, expanded, onToggle, onOpen, onAction }) {
  const variantsQuery = useQuery({
    queryKey: ['catalog-outlet-stock', item.productId, 'variants', outletId, token],
    queryFn: () => runly.commerce.variants(item.productId, { outletId }, token),
    enabled: Boolean(expanded && item.requiresVariant),
    staleTime: 10_000,
  })
  return (
    <li className="px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--muted))]">
            {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]"><ImageOff className="h-4 w-4" aria-hidden="true" /></div>}
          </div>
          <div className="min-w-0">
            <button type="button" onClick={onOpen} className="block max-w-full truncate rounded text-left text-sm font-semibold text-[hsl(var(--foreground))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">{item.name}</button>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {[item.sku && `SKU ${item.sku}`, item.categoryName, item.requiresVariant ? 'Con variantes' : null].filter(Boolean).join(' · ') || 'Sin SKU'}
            </p>
            {!item.available && item.unavailableMessage && (
              <p className="text-xs font-medium text-amber-900 dark:text-amber-300">No se vende aquí: {item.unavailableMessage}</p>
            )}
          </div>
        </div>
        {item.requiresVariant ? (
          <Button type="button" variant="outline" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {expanded ? 'Ocultar variantes' : 'Ver variantes'}
          </Button>
        ) : (
          <StockCells item={item} onAction={onAction} label={item.name} />
        )}
      </div>
      {expanded && item.requiresVariant && (
        <div className="mt-3 rounded-xl border border-[hsl(var(--border))] sm:ml-14">
          {variantsQuery.isPending ? <Skeleton className="h-12" /> : variantsQuery.isError ? (
            <p className="p-3 text-sm text-red-700 dark:text-red-300">{classifyCommerceError(variantsQuery.error).message}</p>
          ) : (variantsQuery.data?.data ?? []).filter((v) => v.unavailableReason !== 'DISABLED').map((v) => (
            <div key={v.id} className="flex flex-col gap-2 border-b border-[hsl(var(--border))] px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{v.variantLabel ?? 'Sin opciones'}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{v.sku ? `SKU ${v.sku}` : 'Sin SKU'}{!v.available && v.unavailableMessage ? ` · No se vende aquí: ${v.unavailableMessage}` : ''}</p>
              </div>
              <StockCells item={v} onAction={onAction} label={`${item.name} (${v.variantLabel ?? 'variante'})`} />
            </div>
          ))}
        </div>
      )}
    </li>
  )
}
