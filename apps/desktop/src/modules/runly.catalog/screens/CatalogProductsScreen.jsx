// apps/desktop/src/modules/runly.catalog/screens/CatalogProductsScreen.jsx
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, PageHeader, RunlyTable } from '@runly/ui'
import { Boxes, CircleCheck, Eye, EyeOff, FileClock, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { CatalogStatStrip } from '../components/CatalogStatCard.jsx'
import { productCellRegistry } from '../components/ProductListCells.jsx'
import ProductQuickCreateDialog from '../components/ProductQuickCreateDialog.jsx'
import { useCatalogAccess, useCatalogCategories, useCatalogOutlets } from '../lib/catalogData.js'
import { classifyCommerceError } from '../lib/commerceCommand.js'
import { buildProductsBlueprint } from '../lib/products-list-blueprint.js'

const API_BASE_URL = getApiUrl()

export default function CatalogProductsScreen() {
  const { token, canCreate, canUpdate, canDelete, canAdjustStock } = useCatalogAccess()
  const { activeCompanyId } = useActiveCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useCatalogCategories(token)
  const { outlets } = useCatalogOutlets(token)

  const [refreshSignal, setRefreshSignal] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)

  const blueprint = useMemo(() => buildProductsBlueprint({
    categoryOptions: categories.map((c) => ({ value: c.id, label: c.name })),
    outletOptions: outlets.map((o) => ({ value: o.id, label: o.name })),
  }), [categories, outlets])

  const { data: statsData } = useQuery({
    queryKey: ['catalog-product-stats', token],
    queryFn: () => runly.catalog.getProductStats(token),
    enabled: Boolean(token),
    staleTime: 30_000,
  })
  const stats = statsData?.data

  function refresh() {
    setRefreshSignal((n) => n + 1)
    queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    queryClient.invalidateQueries({ queryKey: ['catalog-product-stats'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => runly.catalog.deleteProduct(id, token),
    onSuccess: () => { setConfirmDelete(null); refresh(); toast.success('Producto eliminado') },
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
      refresh()
    },
    onError: (err) => { toast.error(err.message); refresh() },
  })

  const bulkActions = useMemo(() => [
    canUpdate && { label: 'Publicar en web', icon: Eye, onClick: (rows) => bulkMutation.mutate({ action: 'publish', ids: rows.map((r) => r.id) }) },
    canUpdate && { label: 'Retirar de la web', icon: EyeOff, onClick: (rows) => bulkMutation.mutate({ action: 'unpublish', ids: rows.map((r) => r.id) }) },
    canDelete && { label: 'Eliminar', icon: Trash2, variant: 'destructive', onClick: (rows) => setConfirmBulkDelete(rows.map((r) => r.id)) },
  ].filter(Boolean), [canUpdate, canDelete, bulkMutation])

  const statItems = stats && [
    { key: 'total', label: 'Productos activos', value: stats.total, icon: Boxes, tone: 'brand' },
    { key: 'published', label: 'Publicados en web', value: stats.published, icon: CircleCheck, tone: 'success' },
    { key: 'draft', label: 'Borradores web', value: stats.draft, icon: FileClock, tone: 'amber' },
    (stats.lowStock + stats.outOfStock) > 0 && { key: 'critical', label: 'Existencias bajas o agotadas', value: stats.lowStock + stats.outOfStock, icon: TriangleAlert, tone: 'destructive' },
  ].filter(Boolean)

  const openProduct = (product) => navigate(`/app/m/runly.catalog/${product.id}`)

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

      <RunlyTable
        key={activeCompanyId}
        blueprint={blueprint}
        token={token}
        companyId={activeCompanyId}
        apiBaseUrl={API_BASE_URL}
        componentRegistry={productCellRegistry}
        onView={openProduct}
        onEdit={canUpdate ? openProduct : undefined}
        onDelete={canDelete ? setConfirmDelete : undefined}
        onEmptyCreate={canCreate ? () => setCreateOpen(true) : undefined}
        refreshSignal={refreshSignal}
        bulkActions={bulkActions}
      />

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
        open={Boolean(confirmBulkDelete)}
        onOpenChange={(v) => !v && setConfirmBulkDelete(null)}
        icon={Trash2}
        tone="destructive"
        title="Eliminar productos seleccionados"
        description="Dejarán de aparecer en el catálogo, en POS y en la web. Su historial se conserva."
        detail={`${confirmBulkDelete?.length ?? 0} producto(s)`}
        confirmLabel="Eliminar"
        onConfirm={() => { bulkMutation.mutate({ action: 'delete', ids: confirmBulkDelete }); setConfirmBulkDelete(null) }}
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
