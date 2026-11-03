import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
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
import { appendProductCard, formatPrice } from '../../lib/catalogLink.js'
import { sitePath } from '../../lib/pageRoute.js'
import { useWebsiteScope } from '../../hooks/useWebsite.js'
import { catalogKeys, useCatalogApi, useCatalogCategories, useCatalogPermissions } from '../../hooks/useCatalog.js'
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

function ProductUsage({siteId,productId}) {
  const {api,companyId}=useWebsiteScope()
  const result=useInfiniteQuery({queryKey:['website',companyId,'site',siteId,'product-usage',productId],queryFn:({pageParam})=>api.catalogUsedBy(siteId,productId,pageParam?{cursor:pageParam}:{}),initialPageParam:null,getNextPageParam:last=>last.meta.nextCursor??undefined})
  if(result.isError)return <ErrorNotice error={result.error}/>
  if(result.isPending)return <span>Revisando…</span>
  const rows=result.data.pages.flatMap(page=>page.data)
  return <div className="text-xs">{rows.length?rows.map(row=>`${row.title} (${row.source}, ${row.kind})`).join(', '):'Sin referencias'}{result.hasNextPage&&<Button size="sm" variant="ghost" onClick={()=>result.fetchNextPage()}>Ver más referencias</Button>}</div>
}

function ProductsTable({ mode, siteId, caps, perms, pages, onAdd, onUnpublish, onPublish, filters }) {
  const navigate = useNavigate()
  const {api,companyId}=useWebsiteScope()
  const [offset,setOffset]=useState(0)
  const query=useQuery({queryKey:['website',companyId,'catalog','selection',siteId,filters,mode,offset],queryFn:()=>api.listCatalogProducts(siteId,{...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),published:String(mode==='published'),limit:PAGE_SIZE,offset}),enabled:perms.read.allowed})
  const selection=useMutation({mutationFn:async product=>{const state=(await api.getState(siteId)).data;return api.setCatalogProduct(siteId,product.id,{included:!product.includedInSite,expectedRevision:state.draftRevision},newIdempotencyKey())},onSuccess:()=>query.refetch(),onError:error=>toast.error(describeError(error).message)})
  const rows = query.data?.data ?? []

  const columns = useMemo(() => [
    {
      id: 'product', header: 'Producto', accessorFn: (product) => `${product.name} ${product.sku ?? ''} ${product.slug ?? ''}`,
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
        return <div><p>{row.original.includedInSite?'Incluido en este sitio':'No incluido en este sitio'}</p><p>{row.original.publiclyVisible?'Visible actualmente':'No visible actualmente'}</p>{caps.pagesRead.allowed&&<ProductUsage siteId={siteId} productId={row.original.id}/>}</div>
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
              {label:product.includedInSite?'Excluir de este sitio':'Incluir en este sitio',disabled:!caps.siteEdit.allowed||selection.isPending,onClick:()=>selection.mutate(product)},
              mode === 'published'
                ? { label: 'Añadir a una página', icon: FilePlus2, disabled: !caps.pagesUpdate.allowed || !pages.length, onClick: () => onAdd(product) }
                : { label: 'Habilitar para web (empresa)', icon: Store, disabled: !perms.update.allowed, onClick: () => onPublish(product) },
              ...(mode === 'published' ? [{ label: 'Deshabilitar para web (empresa)', icon: EyeOff, variant: 'destructive', disabled: !perms.update.allowed, onClick: () => onUnpublish(product) }] : []),
              { label: 'Editar en Catálogo', icon: ExternalLink, onClick: () => navigate(`/app/m/runly.catalog/${product.id}`) },
            ]}
          />
        )
      },
    },
  ], [mode, siteId, caps.pagesRead.allowed, caps.siteEdit.allowed, caps.pagesUpdate.allowed, perms.update.allowed, pages.length, navigate, onAdd, onUnpublish, onPublish,selection])

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
      <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))}>Anteriores</Button><Button variant="outline" disabled={query.data?.meta.nextOffset==null} onClick={()=>setOffset(query.data.meta.nextOffset)}>Siguientes productos</Button></div>
    </div>
  )
}

export default function SiteCatalog({ siteId, site, caps, pages }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { companyId, api } = useWebsiteScope()
  const catalogApi = useCatalogApi()
  const perms = useCatalogPermissions()
  const categories = useCatalogCategories(perms.read.allowed)
  const [categoryId, setCategoryId] = useState('')
  const [tab, setTab] = useState('published')
  const [addTarget, setAddTarget] = useState(null)
  const [unpublishTarget, setUnpublishTarget] = useState(null)

  const pageList = (pages.data ?? []).filter((page) => page.visibility === 'public' || page.visibility === undefined)
  const withdrawalUsage=useQuery({queryKey:['website',companyId,'site',siteId,'withdrawal-usage',unpublishTarget?.id],enabled:Boolean(unpublishTarget&&caps.pagesRead.allowed),queryFn:async()=>{const rows=[];let cursor;do{const response=await api.catalogUsedBy(siteId,unpublishTarget.id,{limit:100,...(cursor&&{cursor})});rows.push(...response.data);cursor=response.meta.nextCursor}while(cursor);return rows}})
  const refreshCatalog = () => {
    queryClient.invalidateQueries({ queryKey: catalogKeys.all(companyId) })
    queryClient.invalidateQueries({ queryKey: ['website', companyId, 'catalog', 'selection'] })
  }
  const toggle = useMutation({
    mutationFn: ({ product, published }) => catalogApi.setPublished(product.id, published),
    onSuccess: (_, { product, published }) => {
      toast.success(published ? 'Producto elegible para web en la empresa. La inclusión por sitio es independiente.' : 'Producto deshabilitado globalmente para web.')
      refreshCatalog()
    },
    onError: (error) => toast.error(describeError(error).message),
    onSettled: () => setUnpublishTarget(null),
  })

  const categoryOptions = [{ value: '', label: 'Todas las categorías' }, ...(categories.data ?? []).map((category) => ({ value: category.id, label: category.name }))]
  const unpublishUses=(withdrawalUsage.data??[]).map(row=>row.title)

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
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="published">En la web</TabsTrigger>
              <TabsTrigger value="available">Disponibles para publicar</TabsTrigger>
            </TabsList>
            {['published', 'available'].map((mode) => (
              <TabsContent key={mode} value={mode} className="pt-3">
                <ProductsTable
                  mode={mode} siteId={siteId} caps={caps} perms={perms} pages={pageList} filters={{ categoryId: categoryId || undefined }}
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
