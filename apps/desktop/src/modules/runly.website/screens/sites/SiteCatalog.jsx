import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ActionMenu,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PageHeader,
  SelectField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@runly/ui'
import { ExternalLink, EyeOff, FilePlus2, Info, Package, ShoppingBag, Store } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { appendProductCard, formatPrice, gridsShowing, scanProductUsage } from '../../lib/catalogLink.js'
import { sitePath } from '../../lib/pageRoute.js'
import { useWebsiteScope } from '../../hooks/useWebsite.js'
import { catalogKeys, useCatalogApi, useCatalogCategories, useCatalogPermissions, useCatalogProducts, usePageDrafts } from '../../hooks/useCatalog.js'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'

const STOCK = { out: ['Agotado', 'destructive'], low: ['Pocas piezas', 'warning'], ok: ['Disponible', 'success'] }
const PAGE_SIZE = 100

function AddToPageDialog({ product, pages, siteId, onClose, onDone }) {
  const { api } = useWebsiteScope()
  const [pageId, setPageId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [needsEditor, setNeedsEditor] = useState(false)

  async function add() {
    setBusy(true); setError(null); setNeedsEditor(false)
    try {
      const latest = (await api.getDraft(siteId, pageId)).data
      const next = appendProductCard(latest.document, product)
      if (!next) { setNeedsEditor(true); return }
      await api.saveDraft(siteId, pageId, { document: next, expectedRevision: latest.revision }, newIdempotencyKey())
      toast.success('Producto añadido al final de la página. Se publica con el sitio.')
      onDone(pageId)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent size="md">
        <DialogHeader icon={FilePlus2}>
          <DialogTitle>Añadir a una página</DialogTitle>
          <DialogDescription>Se agrega una tarjeta de “{product.name}” al final del borrador de la página. Puedes moverla después en el editor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SelectField label="Página" value={pageId} onChange={setPageId} placeholder="Elige una página" options={pages.map((page) => ({ value: page.id, label: `${page.title} · ${page.routePath}` }))} />
          {needsEditor && <Alert variant="warning" role="status"><Info className="h-4 w-4" aria-hidden="true" /><div><AlertTitle>Esta página aún no tiene contenido</AlertTitle><AlertDescription>Ábrela en el editor, guárdala una vez y vuelve a intentarlo.</AlertDescription></div></Alert>}
          {error && <ErrorNotice error={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={add} disabled={busy || !pageId}>{busy ? 'Añadiendo…' : 'Añadir producto'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProductsTable({ mode, siteId, caps, perms, pages, usage, onAdd, onUnpublish, onPublish, filters }) {
  const navigate = useNavigate()
  const query = useCatalogProducts({ ...filters, published: mode === 'published', page: 1, pageSize: PAGE_SIZE })
  const rows = query.data?.data ?? []
  const total = query.data?.pagination?.total ?? rows.length

  const columns = useMemo(() => [
    {
      id: 'product', header: 'Producto',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image_url
            ? <img src={row.original.image_url} alt="" className="h-10 w-10 rounded-md object-cover" loading="lazy" />
            : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--muted))]" aria-hidden="true"><Package className="h-4 w-4" /></span>}
          <div className="min-w-0"><p className="truncate font-medium">{row.original.name}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{row.original.sku || row.original.slug}</p></div>
        </div>
      ),
    },
    { id: 'category', header: 'Categoría', cell: ({ row }) => row.original.category_name ?? '—' },
    { id: 'price', header: 'Precio', cell: ({ row }) => formatPrice(row.original.price, row.original.currency || 'MXN') },
    {
      id: 'stock', header: 'Existencias',
      cell: ({ row }) => {
        const [label, variant] = STOCK[row.original.stock_status] ?? STOCK.ok
        return row.original.track_stock === false ? <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin control</span> : <Badge variant={variant}>{label}</Badge>
      },
    },
    ...(mode === 'published' ? [{
      id: 'usage', header: 'En este sitio',
      cell: ({ row }) => {
        if (usage.isPending) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Revisando…</span>
        const cards = usage.value.cards.get(row.original.id) ?? []
        const grids = gridsShowing(row.original, usage.value.grids)
        if (!cards.length && !grids.length) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin usar</span>
        return <span className="text-xs">{[...cards.map((p) => p.title), ...grids.map((g) => `${g.page.title} (grid)`)].filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
      },
    }] : []),
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => {
        const product = row.original
        return (
          <ActionMenu
            label={`Acciones de ${product.name}`}
            items={[
              mode === 'published'
                ? { label: 'Añadir a una página', icon: FilePlus2, disabled: !caps.pagesUpdate.allowed || !pages.length, onClick: () => onAdd(product) }
                : { label: 'Publicar en la web', icon: Store, disabled: !perms.update.allowed, onClick: () => onPublish(product) },
              ...(mode === 'published' ? [{ label: 'Quitar de la web', icon: EyeOff, variant: 'destructive', disabled: !perms.update.allowed, onClick: () => onUnpublish(product) }] : []),
              { label: 'Editar en Catálogo', icon: ExternalLink, onClick: () => navigate(`/app/m/runly.catalog/${product.id}`) },
            ]}
          />
        )
      },
    },
  ], [mode, caps.pagesUpdate.allowed, perms.update.allowed, pages.length, usage, navigate, onAdd, onUnpublish, onPublish])

  return (
    <div className="space-y-2">
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.isPending}
        isError={query.isError}
        onRetry={() => query.refetch()}
        pageSize={20}
        searchPlaceholder="Buscar producto…"
        emptyIcon={mode === 'published' ? ShoppingBag : Package}
        emptyTitle={mode === 'published' ? 'Todavía no hay productos en la web' : 'No hay productos pendientes de publicar'}
        emptyDescription={mode === 'published' ? 'Publica productos de tu Catálogo desde la pestaña “Disponibles para publicar”.' : 'Todos los productos activos de tu Catálogo ya se muestran en la web.'}
        stateKey={`website-catalog:${siteId}:${mode}`}
      />
      {total > rows.length && <p className="text-xs text-[hsl(var(--muted-foreground))]">Mostrando {rows.length} de {total}. Filtra por categoría para ver el resto.</p>}
    </div>
  )
}

export default function SiteCatalog({ siteId, site, caps, pages }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { companyId } = useWebsiteScope()
  const catalogApi = useCatalogApi()
  const perms = useCatalogPermissions()
  const categories = useCatalogCategories(perms.read.allowed)
  const [categoryId, setCategoryId] = useState('')
  const [tab, setTab] = useState('published')
  const [addTarget, setAddTarget] = useState(null)
  const [unpublishTarget, setUnpublishTarget] = useState(null)

  const pageList = (pages.data ?? []).filter((page) => page.visibility === 'public' || page.visibility === undefined)
  const draftsState = usePageDrafts(siteId, pages.data ?? [], perms.read.allowed && tab === 'published')
  const productsForScan = useCatalogProducts({ published: true, categoryId: categoryId || undefined, page: 1, pageSize: PAGE_SIZE }, perms.read.allowed).data?.data ?? []
  const usage = useMemo(() => ({ isPending: draftsState.isPending, value: scanProductUsage(draftsState.drafts, productsForScan) }), [draftsState.isPending, draftsState.drafts, productsForScan])

  const refreshCatalog = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all(companyId) })
  const toggle = useMutation({
    mutationFn: ({ product, published }) => catalogApi.setPublished(product.id, published),
    onSuccess: (_, { product, published }) => {
      toast.success(published ? `“${product.name}” ya se muestra en la web.` : `“${product.name}” se quitó de la web.`)
      refreshCatalog()
    },
    onError: (error) => toast.error(describeError(error).message),
    onSettled: () => setUnpublishTarget(null),
  })

  const categoryOptions = [{ value: '', label: 'Todas las categorías' }, ...(categories.data ?? []).map((category) => ({ value: category.id, label: category.name }))]
  const unpublishUses = unpublishTarget ? [...(usage.value.cards.get(unpublishTarget.id) ?? []).map((p) => p.title), ...gridsShowing(unpublishTarget, usage.value.grids).map((g) => `${g.page.title} (grid)`)] : []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Catálogo"
        description="Elige qué productos de tu Catálogo se muestran en la web y dónde aparecen en este sitio."
        actions={<Button variant="outline" onClick={() => navigate('/app/m/runly.catalog')}><ExternalLink className="h-4 w-4" /> Abrir Catálogo</Button>}
      />
      <Alert role="note">
        <Info className="h-4 w-4" aria-hidden="true" />
        <div>
          <AlertTitle>El Catálogo es de tu empresa</AlertTitle>
          <AlertDescription>Los productos, precios, imágenes, variantes y categorías se editan en el Catálogo. “Mostrar en la web” aplica a todos los sitios de la empresa y es independiente de la disponibilidad en punto de venta.</AlertDescription>
        </div>
      </Alert>
      {site.siteType !== 'ecommerce' && (
        <Alert variant="warning" role="status">
          <Info className="h-4 w-4" aria-hidden="true" />
          <div>
            <AlertTitle>Este sitio no es de tipo “Sitio con Catálogo”</AlertTitle>
            <AlertDescription>
              Los bloques de producto solo aparecen en el editor de sitios con Catálogo.{' '}
              <button type="button" className="underline" onClick={() => navigate(sitePath(siteId, 'settings'))}>Cambiar el tipo de sitio</button>
            </AlertDescription>
          </div>
        </Alert>
      )}
      {!perms.read.allowed ? (
        <Alert variant="warning" role="status">
          <Info className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>No puedes ver el Catálogo</AlertTitle><AlertDescription>Tu rol no incluye el permiso para consultar productos. Pídelo a un administrador.</AlertDescription></div>
        </Alert>
      ) : (
        <>
          <div className="max-w-xs"><SelectField label="Categoría" value={categoryId} onChange={setCategoryId} options={categoryOptions} /></div>
          {draftsState.isError && <p className="text-xs text-amber-700 dark:text-amber-300" role="status">No se pudo revisar el uso en algunas páginas; la columna “En este sitio” puede estar incompleta.</p>}
          {draftsState.truncated && <p className="text-xs text-[hsl(var(--muted-foreground))]">El uso se revisa en las primeras 50 páginas.</p>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="published">En la web</TabsTrigger>
              <TabsTrigger value="available">Disponibles para publicar</TabsTrigger>
            </TabsList>
            {['published', 'available'].map((mode) => (
              <TabsContent key={mode} value={mode} className="pt-3">
                <ProductsTable
                  mode={mode} siteId={siteId} caps={caps} perms={perms} pages={pageList} usage={usage} filters={{ categoryId: categoryId || undefined }}
                  onAdd={setAddTarget} onUnpublish={setUnpublishTarget}
                  onPublish={(product) => toggle.mutate({ product, published: true })}
                />
              </TabsContent>
            ))}
          </Tabs>
          {!perms.update.allowed && <p className="text-xs text-[hsl(var(--muted-foreground))]">Tu rol no permite publicar ni quitar productos de la web; puedes consultarlos.</p>}
        </>
      )}
      {addTarget && <AddToPageDialog product={addTarget} pages={pageList} siteId={siteId} onClose={() => setAddTarget(null)} onDone={() => { setAddTarget(null); queryClient.invalidateQueries({ queryKey: ['website', companyId, 'site', siteId] }) }} />}
      <ConfirmDialog
        open={Boolean(unpublishTarget)}
        onOpenChange={(open) => { if (!open && !toggle.isPending) setUnpublishTarget(null) }}
        title="Quitar de la web"
        description={`“${unpublishTarget?.name ?? ''}” dejará de mostrarse en los sitios de tu empresa. Sigue en el Catálogo y en punto de venta.${unpublishUses.length ? ` Hoy aparece en: ${unpublishUses.join(', ')}; esas tarjetas dejarán de mostrar el producto.` : ''}`}
        confirmLabel="Quitar de la web"
        loading={toggle.isPending}
        onConfirm={() => toggle.mutate({ product: unpublishTarget, published: false })}
      />
    </div>
  )
}
