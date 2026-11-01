// apps/desktop/src/modules/runly.catalog/screens/CatalogProductsScreen.jsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActiveFilterChips, Button, ConfirmDialog, EmptyState, ErrorState, FilterMenu, PageHeader, SearchInput,
  SelectField, Skeleton, ViewModeSwitch, getStoredViewMode,
} from '@runly/ui'
import {
  Boxes, ChevronLeft, ChevronRight, CircleCheck, Eye, EyeOff, FileClock, FolderTree, Globe, Layers, Package,
  PackageSearch, Plus, Store, Trash2, TriangleAlert, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { CatalogStatStrip } from '../components/CatalogStatCard.jsx'
import ProductCard from '../components/ProductCard.jsx'
import ProductQuickCreateDialog from '../components/ProductQuickCreateDialog.jsx'
import ProductsTable from '../components/ProductsTable.jsx'
import { useCatalogAccess, useCatalogCategories, useCatalogOutlets } from '../lib/catalogData.js'
import { classifyCommerceError } from '../lib/commerceCommand.js'

const PAGE_SIZE = 24
const EMPTY_FILTERS = { category: '', type: '', published: '', stockStatus: '', pos: '' }

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export default function CatalogProductsScreen() {
  const { token, canCreate, canUpdate, canDelete, canAdjustStock } = useCatalogAccess()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useCatalogCategories(token)
  const { outlets } = useCatalogOutlets(token)

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search.trim())
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [posOutletId, setPosOutletId] = useState('')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState(() => getStoredViewMode('catalog-products', 'table'))
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // The POS filter is outlet-specific in the contract: it only applies once
  // the user picks an outlet, never on an implicit "first" one.
  const filterDefs = useMemo(() => [
    { key: 'category', label: 'Categoría', icon: FolderTree, options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'type', label: 'Tipo', icon: Layers, options: [{ value: 'SIMPLE', label: 'Simple' }, { value: 'VARIABLE', label: 'Con variantes' }] },
    { key: 'published', label: 'Web', icon: Globe, options: [{ value: 'true', label: 'Publicado en web' }, { value: 'false', label: 'Borrador web' }] },
    { key: 'stockStatus', label: 'Existencias', icon: Package, options: [{ value: 'ok', label: 'Disponible o sin control' }, { value: 'low', label: 'Bajas' }, { value: 'out', label: 'Agotadas' }] },
    ...(posOutletId ? [{ key: 'pos', label: 'POS en la sucursal', icon: Store, options: [{ value: 'true', label: 'Habilitado' }, { value: 'false', label: 'No habilitado' }] }] : []),
  ], [categories, posOutletId])

  const listQuery = {
    search: debouncedSearch || undefined,
    category_id: filters.category || undefined,
    type: filters.type || undefined,
    published: filters.published || undefined,
    stockStatus: filters.stockStatus || undefined,
    ...(posOutletId && filters.pos ? { outletId: posOutletId, posAvailable: filters.pos } : {}),
    page,
    pageSize: PAGE_SIZE,
  }

  const { data: statsData } = useQuery({
    queryKey: ['catalog-product-stats', token],
    queryFn: () => runly.catalog.getProductStats(token),
    enabled: Boolean(token),
    staleTime: 30_000,
  })
  const stats = statsData?.data

  const productsQuery = useQuery({
    queryKey: ['catalog-products', token, listQuery],
    queryFn: () => runly.catalog.listProducts(token, listQuery),
    enabled: Boolean(token),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  })
  const products = productsQuery.data?.data ?? []
  const total = productsQuery.data?.pagination?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filtered = Boolean(debouncedSearch) || Object.values(filters).some(Boolean)

  useEffect(() => { if (page > totalPages && !productsQuery.isFetching) setPage(totalPages) }, [page, totalPages, productsQuery.isFetching])

  function invalidateList() {
    setSelectedIds(new Set())
    queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    queryClient.invalidateQueries({ queryKey: ['catalog-product-stats'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => runly.catalog.deleteProduct(id, token),
    onSuccess: () => { setConfirmDelete(null); invalidateList(); toast.success('Producto eliminado') },
    onError: (err) => toast.error(classifyCommerceError(err).message),
  })

  // Publish/unpublish and delete are the only bulk actions with real
  // endpoints; each item reports its own failure count.
  const bulkMutation = useMutation({
    mutationFn: async ({ action, ids }) => {
      const call = { publish: runly.catalog.publishProduct, unpublish: runly.catalog.unpublishProduct, delete: runly.catalog.deleteProduct }[action]
      const results = await Promise.allSettled(ids.map((id) => call(id, token)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) throw new Error(`${failed} de ${ids.length} no se pudieron actualizar. Revisa tu permiso o vuelve a intentarlo.`)
      return { action, count: ids.length }
    },
    onSuccess: ({ action, count }) => {
      toast.success(`${count} producto(s) ${{ publish: 'publicado(s) en web', unpublish: 'retirado(s) de la web', delete: 'eliminado(s)' }[action]}`)
      invalidateList()
    },
    onError: (err) => { toast.error(err.message); invalidateList() },
  })

  function changeFilters(next) {
    setFilters(next); setPage(1); setSelectedIds(new Set())
  }

  function goToPage(next) {
    setPage(next); setSelectedIds(new Set())
    document.getElementById('catalog-products-results')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const statItems = stats && [
    { key: 'total', label: 'Productos activos', value: stats.total, icon: Boxes, tone: 'brand' },
    { key: 'published', label: 'Publicados en web', value: stats.published, icon: CircleCheck, tone: 'success' },
    { key: 'draft', label: 'Borradores web', value: stats.draft, icon: FileClock, tone: 'amber' },
    (stats.lowStock + stats.outOfStock) > 0 && { key: 'critical', label: 'Existencias bajas o agotadas', value: stats.lowStock + stats.outOfStock, icon: TriangleAlert, tone: 'destructive' },
  ].filter(Boolean)

  const selectable = canUpdate || canDelete
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)

  return (
    <div className="min-h-dvh space-y-5 p-4 md:p-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Lo que vendes: precios, códigos, disponibilidad en punto de venta y en la web."
        actions={canCreate && (
          <Button onClick={() => setCreateOpen(true)} className="max-sm:h-11">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo producto
          </Button>
        )}
      />

      {statItems && statItems.length > 0 && <CatalogStatStrip items={statItems} />}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); setSelectedIds(new Set()) }}
          placeholder="Buscar por nombre, SKU o código de barras"
          aria-label="Buscar productos por nombre, SKU o código de barras"
          className="lg:w-[26rem] lg:max-w-md"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterMenu filters={filterDefs} value={filters} onChange={changeFilters} />
          {outlets.length > 0 && (
            <SelectField
              aria-label="Sucursal para el filtro de POS"
              options={[{ value: '__none__', label: 'POS: todas las sucursales' }, ...outlets.map((o) => ({ value: o.id, label: `POS en ${o.name}` }))]}
              value={posOutletId || '__none__'}
              onValueChange={(v) => { setPosOutletId(v === '__none__' ? '' : v); changeFilters({ ...filters, pos: v === '__none__' ? '' : filters.pos }) }}
              className="w-56"
            />
          )}
        </div>
        <div className="hidden flex-1 lg:block" />
        <ViewModeSwitch modes={['table', 'cards']} value={viewMode} onChange={setViewMode} storageKey="catalog-products" />
      </div>
      <ActiveFilterChips filters={filterDefs} value={filters} onChange={changeFilters} />

      {selectedIds.size > 0 && selectable && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-(--brand-soft) px-4 py-2.5" role="region" aria-label="Acciones de la selección">
          <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {canUpdate && (
              <>
                <Button variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate({ action: 'publish', ids: [...selectedIds] })}>
                  <Eye className="h-4 w-4" aria-hidden="true" /> Publicar en web
                </Button>
                <Button variant="outline" disabled={bulkMutation.isPending} onClick={() => bulkMutation.mutate({ action: 'unpublish', ids: [...selectedIds] })}>
                  <EyeOff className="h-4 w-4" aria-hidden="true" /> Retirar de la web
                </Button>
              </>
            )}
            {canDelete && (
              <Button variant="outline" className="text-red-700 dark:text-red-300" disabled={bulkMutation.isPending} onClick={() => setConfirmBulkDelete(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())} aria-label="Quitar selección">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <div id="catalog-products-results" aria-busy={productsQuery.isFetching} className="scroll-mt-4">
        {productsQuery.isPending ? (
          <div className="space-y-2" aria-label="Cargando productos">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : productsQuery.isError ? (
          <ErrorState
            title={classifyCommerceError(productsQuery.error).kind === 'forbidden' ? 'No tienes acceso a los productos' : 'No se pudo cargar el catálogo'}
            description={classifyCommerceError(productsQuery.error).message}
            onRetry={productsQuery.refetch}
          />
        ) : products.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={PackageSearch}
              title="Sin resultados"
              description={debouncedSearch ? `Ningún producto coincide con «${debouncedSearch}» por nombre, SKU o código de barras.` : 'Ningún producto cumple los filtros.'}
              action={{ label: 'Limpiar búsqueda y filtros', onClick: () => { setSearch(''); changeFilters(EMPTY_FILTERS) } }}
            />
          ) : (
            <EmptyState
              icon={Package}
              title="Todavía no hay productos"
              description="Crea tu primer producto: con nombre y precio ya puedes venderlo."
              action={canCreate ? { label: 'Nuevo producto', onClick: () => setCreateOpen(true) } : undefined}
            />
          )
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                selected={selectedIds.has(p.id)}
                onToggleSelect={selectable ? () => toggleSelect(p.id) : undefined}
                onSelect={(prod) => navigate(`/app/m/runly.catalog/${prod.id}`)}
              />
            ))}
          </div>
        ) : (
          <ProductsTable
            products={products}
            selectedIds={selectedIds}
            onToggleSelect={selectable ? toggleSelect : undefined}
            onToggleSelectAll={selectable ? () => setSelectedIds((prev) => (prev.size === products.length ? new Set() : new Set(products.map((p) => p.id)))) : undefined}
            onView={(p) => navigate(`/app/m/runly.catalog/${p.id}`)}
            onEdit={canUpdate ? (p) => navigate(`/app/m/runly.catalog/${p.id}`) : undefined}
            onDelete={canDelete ? (p) => setConfirmDelete(p) : undefined}
          />
        )}
      </div>

      {total > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-[hsl(var(--muted-foreground))]" aria-label="Paginación de productos">
          <span aria-live="polite">
            <strong className="text-[hsl(var(--foreground))]">{first}–{last}</strong> de <strong className="text-[hsl(var(--foreground))]">{total}</strong> productos
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" disabled={page <= 1 || productsQuery.isFetching} onClick={() => goToPage(page - 1)} aria-label="Página anterior" className="max-sm:h-11">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Anterior
              </Button>
              <span className="px-1 tabular-nums">Página {page} de {totalPages}</span>
              <Button variant="outline" disabled={page >= totalPages || productsQuery.isFetching} onClick={() => goToPage(page + 1)} aria-label="Página siguiente" className="max-sm:h-11">
                Siguiente <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </nav>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
        icon={Trash2}
        tone="destructive"
        title="Eliminar producto"
        description="Dejará de aparecer en el catálogo, en POS y en la web. Su historial de ventas y movimientos se conserva."
        detail={confirmDelete?.name}
        confirmLabel="Eliminar"
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        loading={deleteMutation.isPending}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        icon={Trash2}
        tone="destructive"
        title="Eliminar productos seleccionados"
        description="Dejarán de aparecer en el catálogo, en POS y en la web. Su historial se conserva."
        detail={`${selectedIds.size} producto(s)`}
        confirmLabel="Eliminar"
        onConfirm={() => { bulkMutation.mutate({ action: 'delete', ids: [...selectedIds] }); setConfirmBulkDelete(false) }}
        loading={bulkMutation.isPending}
      />
      {canCreate && (
        <ProductQuickCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          token={token}
          canAdjustStock={canAdjustStock}
          onCreated={(row) => navigate(`/app/m/runly.catalog/${row.id}`)}
        />
      )}
    </div>
  )
}
