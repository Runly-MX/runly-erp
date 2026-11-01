// apps/desktop/src/modules/runly.catalog/screens/CatalogProductDetailScreen.jsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChipTabs, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Button, ErrorState, NotFoundState, PageHeader, Popover, PopoverContent, PopoverTrigger, Skeleton, cn,
} from '@runly/ui'
import { Boxes, ChevronDown, FileEdit, Globe, Layers, RefreshCw, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { usePersistedTab } from '../../../hooks/usePersistedTab.js'
import { runly } from '../../../lib/runly.js'
import { ChannelPills } from '../components/ProductStatusPills.jsx'
import ProductGeneralTab from '../components/product/ProductGeneralTab.jsx'
import ProductSaleTab from '../components/product/ProductSaleTab.jsx'
import ProductStockTab from '../components/product/ProductStockTab.jsx'
import ProductVariantsTab from '../components/product/ProductVariantsTab.jsx'
import ProductWebTab from '../components/product/ProductWebTab.jsx'
import { useCatalogAccess } from '../lib/catalogData.js'
import { classifyCommerceError } from '../lib/commerceCommand.js'
import { FIELD_LABELS, useProductSave } from '../lib/useProductSave.js'

const TABS = [
  { value: 'general', label: 'General', icon: FileEdit, description: 'Nombre, categoría, imágenes y descripción.' },
  { value: 'sale', label: 'Venta', icon: Tag, description: 'Precio, códigos, impuesto y disponibilidad en punto de venta.' },
  { value: 'variants', label: 'Variantes', icon: Layers, description: 'Opciones como talla o color y cada combinación.' },
  { value: 'stock', label: 'Existencias', icon: Boxes, description: 'Unidades por sucursal, asignaciones y movimientos.' },
  { value: 'web', label: 'Web', icon: Globe, description: 'Publicación en el catálogo web y datos para buscadores.' },
]

export default function CatalogProductDetailScreen() {
  const { '*': id } = useParams()
  const access = useCatalogAccess()
  const { token, canUpdate } = access
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = usePersistedTab('runly.catalog.productTab.v2', TABS.map((t) => t.value), 'general')
  const [formEpoch, setFormEpoch] = useState(0)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [confirmSimple, setConfirmSimple] = useState(false)

  const productQuery = useQuery({
    queryKey: ['catalog-product', id, token],
    queryFn: () => runly.catalog.getProduct(id, token),
    enabled: Boolean(token && id),
    staleTime: 30_000,
    retry: (count, error) => error?.status !== 404 && count < 2,
  })
  const saver = useProductSave({ productId: id, token })

  const typeMutation = useMutation({
    mutationFn: (type) => runly.catalog.updateProduct(id, { product_type: type }, token),
    onSuccess: () => {
      toast.success('Tipo de producto actualizado')
      queryClient.invalidateQueries({ queryKey: ['catalog-product', id] })
      queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    },
    onError: (err) => toast.error(classifyCommerceError(err).message),
  })

  if (productQuery.isPending) {
    return (
      <div className="space-y-4 p-4 md:p-6" aria-label="Cargando producto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }
  if (productQuery.error?.status === 404 || (productQuery.isSuccess && !productQuery.data?.data)) {
    return <div className="p-4 md:p-6"><NotFoundState title="Producto no encontrado" description="No existe o fue eliminado." /></div>
  }
  if (productQuery.isError) {
    const info = classifyCommerceError(productQuery.error)
    return <div className="p-4 md:p-6"><ErrorState title="No se pudo abrir el producto" description={info.message} onRetry={productQuery.refetch} /></div>
  }

  const product = productQuery.data.data
  const isVariable = product.product_type === 'VARIABLE'
  const visibleTabs = TABS.filter((t) => t.value !== 'variants' || isVariable)
  const activeTab = visibleTabs.some((t) => t.value === tab) ? tab : 'general'

  function requestType(next) {
    setTypeMenuOpen(false)
    if (next === product.product_type) return
    if (next === 'SIMPLE') setConfirmSimple(true)
    else typeMutation.mutate(next)
  }

  function reloadForms() {
    saver.dismissConflict()
    productQuery.refetch().then(() => setFormEpoch((n) => n + 1))
  }

  const tabProps = { product, token, access, saver, productId: id }

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        onBack={() => navigate('/app/m/runly.catalog')}
        backLabel="Productos"
        eyebrow="Producto"
        title={product.name}
        description={(
          <span className="flex flex-wrap items-center gap-2">
            {canUpdate ? (
              <Popover open={typeMenuOpen} onOpenChange={setTypeMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-[hsl(var(--border))] px-2.5 text-xs font-semibold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    aria-label={`Tipo de producto: ${isVariable ? 'con variantes' : 'simple'}. Cambiar`}
                  >
                    {isVariable ? 'Con variantes' : 'Simple'}
                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-1.5">
                  {[['SIMPLE', 'Simple', 'Un solo artículo con su precio, código y existencias.'], ['VARIABLE', 'Con variantes', 'Varias combinaciones (talla, color...) con su propio código.']].map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => requestType(value)}
                      className={cn('flex min-h-11 w-full flex-col items-start gap-0.5 rounded-lg p-2 text-left', product.product_type === value ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted))]')}
                    >
                      <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{label}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{isVariable ? 'Con variantes' : 'Simple'}</span>
            )}
            <ChannelPills product={product} />
            {product.sku && <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">SKU {product.sku}</span>}
          </span>
        )}
        className="px-4 pb-0 pt-5 md:px-6"
      />

      <div className="px-4 pt-4 md:px-6">
        <ChipTabs
          ariaLabel="Secciones del producto"
          tabs={visibleTabs.map(({ value, label, icon, description }) => ({ value, label, icon, description }))}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      <div className="flex-1 px-4 py-6 md:px-6" key={formEpoch}>
        {activeTab === 'general' && <ProductGeneralTab {...tabProps} />}
        {activeTab === 'sale' && <ProductSaleTab {...tabProps} />}
        {activeTab === 'variants' && isVariable && <ProductVariantsTab {...tabProps} />}
        {activeTab === 'stock' && <ProductStockTab {...tabProps} />}
        {activeTab === 'web' && <ProductWebTab {...tabProps} />}
      </div>

      <Dialog open={Boolean(saver.conflict)} onOpenChange={(v) => !v && saver.dismissConflict()}>
        <DialogContent size="md">
          <DialogHeader icon={RefreshCw} tone="warning">
            <DialogTitle>Alguien cambió este producto</DialogTitle>
            <DialogDescription>
              Mientras editabas, otra persona modificó: {saver.conflict?.fields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.
              Recarga para ver sus cambios, o guarda los tuyos encima.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={saver.overwrite} disabled={saver.saving}>Guardar los míos</Button>
            <Button size="lg" onClick={reloadForms}>Recargar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmSimple}
        onOpenChange={setConfirmSimple}
        icon={Layers}
        tone="warning"
        title="Cambiar a producto simple"
        description="Las variantes no se eliminan, pero dejarán de mostrarse hasta que vuelvas a marcarlo con variantes."
        confirmLabel="Cambiar a simple"
        onConfirm={() => { typeMutation.mutate('SIMPLE'); setConfirmSimple(false) }}
        loading={typeMutation.isPending}
      />
    </div>
  )
}
