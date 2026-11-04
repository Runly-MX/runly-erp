import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import {
  ActionMenu,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  StatusPill,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useIsMobile,
} from '@runly/ui'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Eye, EyeOff, ExternalLink, FilePlus2, Info, Link2, Package, PackageX, ShoppingBag, Store } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { appendProductCard, formatPrice } from '../../lib/catalogLink.js'
import { sitePath } from '../../lib/pageRoute.js'
import { useWebsiteScope } from '../../hooks/useWebsite.js'
import { catalogKeys, useCatalogApi, useCatalogCategories, useCatalogPermissions } from '../../hooks/useCatalog.js'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { ROW_CARD } from '../../components/SitePanel.jsx'

const STOCK = { out: ['Agotado', 'danger', PackageX], low: ['Pocas piezas', 'warning', AlertTriangle], ok: ['Disponible', 'success', CheckCircle2] }

function StockPill({ product }) {
  if (product.track_stock === false) return <span className="text-xs text-[hsl(var(--muted-foreground))]">Sin control</span>
  const [label, tone, icon] = STOCK[product.stock_status] ?? STOCK.ok
  return <StatusPill tone={tone} size="sm" icon={icon}>{label}</StatusPill>
}

function ProductThumb({ product }) {
  return product.image_url
    ? <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-[hsl(var(--border))] object-cover" loading="lazy" />
    : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400" aria-hidden="true"><Package className="h-5 w-5" /></span>
}
const PAGE_SIZE = 100

async function setInSite(api, siteId, productId, included) {
  const state = (await api.getState(siteId)).data
  return api.setCatalogProduct(siteId, productId, { included, expectedRevision: state.draftRevision }, newIdempotencyKey())
}

function AddToPageDialog({ product, pages, siteId, canInclude, onClose, onDone }) {
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
      // A card for a product the site excludes renders nothing, so placing it implies including it.
      if (canInclude && !product.includedInSite) await setInSite(api, siteId, product.id, true)
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
  if(result.isPending)return <span className="text-xs text-[hsl(var(--muted-foreground))]">Revisando…</span>
  const rows=result.data.pages.flatMap(page=>page.data)
  // One entry per page; flag pages where the product is only in the unpublished draft.
  const pagesById=new Map()
  for(const row of rows)pagesById.set(row.title,pagesById.get(row.title)||!row.source.startsWith('draft'))
  const label=[...pagesById].map(([title,live])=>live?title:`${title} (sin publicar)`).join(', ')
  return <div className="flex flex-wrap items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"><Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />{rows.length?`Aparece en: ${label}`:'Aún no está en ninguna página. Usa “Añadir a una página”.'}{result.hasNextPage&&<Button size="sm" variant="ghost" onClick={()=>result.fetchNextPage()}>Ver más referencias</Button>}</div>
}

// One status that says what is missing, plus the fix inline when it is "include in this site".
function SiteUsage({ product, siteId, showRefs, canInclude, including, onInclude }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {product.publiclyVisible
          ? <StatusPill tone="success" size="sm" icon={Eye}>Visible en este sitio</StatusPill>
          : product.includedInSite
            ? <StatusPill tone="warning" size="sm" icon={CircleDashed}>Se verá al publicar el sitio</StatusPill>
            : <>
                <StatusPill size="sm" icon={EyeOff}>Oculto en este sitio</StatusPill>
                {canInclude && <Button size="sm" variant="outline" disabled={including} onClick={onInclude}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Mostrar en este sitio</Button>}
              </>}
      </div>
      {showRefs && <ProductUsage siteId={siteId} productId={product.id} />}
    </div>
  )
}

function ProductsTable({ mode, siteId, caps, perms, pages, onAdd, onUnpublish, onPublish, filters }) {
  const navigate = useNavigate()
  const {api,companyId}=useWebsiteScope()
  const [offset,setOffset]=useState(0)
  const query=useQuery({queryKey:['website',companyId,'catalog','selection',siteId,filters,mode,offset],queryFn:()=>api.listCatalogProducts(siteId,{...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)),published:String(mode==='published'),limit:PAGE_SIZE,offset}),enabled:perms.read.allowed})
  const selection=useMutation({mutationFn:product=>setInSite(api,siteId,product.id,!product.includedInSite),onSuccess:()=>query.refetch(),onError:error=>toast.error(describeError(error).message)})
  const rows = query.data?.data ?? []
  const isMobile = useIsMobile()
  const actionTrigger = isMobile ? 'h-11 w-11' : undefined

  const columns = useMemo(() => [
    {
      id: 'product', header: 'Producto', accessorFn: (product) => `${product.name} ${product.sku ?? ''} ${product.slug ?? ''}`,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <ProductThumb product={row.original} />
          <div className="min-w-0"><p className="truncate font-medium">{row.original.name}</p><p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{row.original.sku || row.original.slug}</p></div>
        </div>
      ),
    },
    { id: 'category', header: 'Categoría', cell: ({ row }) => row.original.category_name ?? '—' },
    { id: 'price', header: 'Precio', cell: ({ row }) => <span className="font-medium tabular-nums">{formatPrice(row.original.price, row.original.currency || 'MXN')}</span> },
    {
      id: 'stock', header: 'Existencias',
      cell: ({ row }) => <StockPill product={row.original} />,
    },
    ...(mode === 'published' ? [{
      id: 'usage', header: 'En este sitio',
      cell: ({ row }) => {
        return <SiteUsage product={row.original} siteId={siteId} showRefs={caps.pagesRead.allowed} canInclude={caps.siteEdit.allowed} including={selection.isPending} onInclude={() => selection.mutate(row.original)} />
      },
    }] : []),
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => {
        const product = row.original
        return (
          <ActionMenu
            label={`Acciones de ${product.name}`}
            triggerClassName={actionTrigger}
            items={[
              {label:product.includedInSite?'Excluir de este sitio':'Incluir en este sitio',disabled:!caps.siteEdit.allowed||selection.isPending,onClick:()=>selection.mutate(product)},
              mode === 'published'
                ? { label: 'Añadir a una página', icon: FilePlus2, disabled: !caps.pagesUpdate.allowed || !pages.length, onClick: () => onAdd(product) }
                : { label: 'Publicar en este sitio', icon: Store, disabled: !perms.update.allowed, onClick: () => onPublish(product) },
              ...(mode === 'published' ? [{ label: 'Deshabilitar para web (empresa)', icon: EyeOff, variant: 'destructive', disabled: !perms.update.allowed, onClick: () => onUnpublish(product) }] : []),
              { label: 'Editar en Catálogo', icon: ExternalLink, onClick: () => navigate(`/app/m/runly.catalog/${product.id}`) },
            ]}
          />
        )
      },
    },
  ], [mode, siteId, caps.pagesRead.allowed, caps.siteEdit.allowed, caps.pagesUpdate.allowed, perms.update.allowed, pages.length, navigate, onAdd, onUnpublish, onPublish,selection,actionTrigger])

  // Phones get stacked product cards; the same columns render inside each card.
  const renderCard = (product) => {
    const cell = (id) => columns.find((c) => c.id === id)?.cell({ row: { original: product } })
    return (
      <article className={ROW_CARD}>
        <div className="flex items-start gap-2"><div className="min-w-0 flex-1">{cell('product')}</div>{cell('actions')}</div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border))] pt-3 text-sm">
          {cell('price')}<StockPill product={product} />
          {product.category_name && <span className="w-full text-xs text-[hsl(var(--muted-foreground))]">{product.category_name}</span>}
        </div>
        {mode === 'published' && <div className="mt-2">{cell('usage')}</div>}
      </article>
    )
  }

  return (
    <div className="space-y-3">
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
        viewModes={['table', 'cards']}
        defaultViewMode={isMobile ? 'cards' : 'table'}
        viewStorageKey={`website-catalog-view:${isMobile ? 'm' : 'd'}`}
        renderCard={renderCard}
      />
      {(offset > 0 || query.data?.meta.nextOffset != null) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">Productos {offset + 1}–{offset + rows.length}</span>
          <div className="flex gap-2"><Button variant="outline" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-PAGE_SIZE))}><ChevronLeft className="h-4 w-4" aria-hidden />Anteriores</Button><Button variant="outline" disabled={query.data?.meta.nextOffset==null} onClick={()=>setOffset(query.data.meta.nextOffset)}>Siguientes productos<ChevronRight className="h-4 w-4" aria-hidden /></Button></div>
        </div>
      )}
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
    mutationFn: async ({ product, published }) => {
      await catalogApi.setPublished(product.id, published)
      // Publishing from this site's screen means "show it here" too.
      if (published && caps.siteEdit.allowed && !product.includedInSite) await setInSite(api, siteId, product.id, true)
    },
    onSuccess: (_, { published }) => {
      toast.success(published ? 'Producto publicado en este sitio. Añádelo a una página para mostrarlo.' : 'Producto quitado de la web en todos los sitios.')
      refreshCatalog()
    },
    onError: (error) => toast.error(describeError(error).message),
    onSettled: () => setUnpublishTarget(null),
  })

  const categoryOptions = [{ value: '', label: 'Todas las categorías' }, ...(categories.data ?? []).map((category) => ({ value: category.id, label: category.name }))]
  const unpublishUses=(withdrawalUsage.data??[]).map(row=>row.title)

  return (
    <div className="space-y-4 p-4 md:p-6">
      <SiteSectionHeader
        icon={ShoppingBag}
        tone="amber"
        title="Catálogo"
        description="Elige qué productos de tu Catálogo se muestran en la web y dónde aparecen en este sitio."
        actions={<Button variant="outline" onClick={() => navigate('/app/m/runly.catalog')}><ExternalLink className="h-4 w-4" aria-hidden /> Abrir Catálogo</Button>}
      />
      <p role="note" className="flex gap-2 rounded-xl bg-[hsl(var(--muted))]/50 p-3 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span><strong className="font-semibold text-[hsl(var(--foreground))]">El Catálogo es de tu empresa.</strong> Los productos, precios, imágenes, variantes y categorías se editan en el Catálogo. “Mostrar en la web” aplica a todos los sitios de la empresa y es independiente de la disponibilidad en punto de venta.</span>
      </p>
      {site.siteType !== 'ecommerce' && (
        <Alert variant="warning" role="status">
          <Info className="h-4 w-4" aria-hidden="true" />
          <div>
            <AlertTitle>Este sitio no es de tipo “Sitio con Catálogo”</AlertTitle>
            <AlertDescription>
              Los bloques de producto solo aparecen en el editor de sitios con Catálogo.{' '}
              <button type="button" className="font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" onClick={() => navigate(sitePath(siteId, 'settings'))}>Cambiar el tipo de sitio</button>
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
          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="published" className="flex-1 sm:flex-none"><Store className="mr-1.5 h-4 w-4" aria-hidden />En la web</TabsTrigger>
                <TabsTrigger value="available" className="flex-1 sm:flex-none"><Package className="mr-1.5 h-4 w-4" aria-hidden />Disponibles para publicar</TabsTrigger>
              </TabsList>
              <div className="w-full sm:max-w-xs"><SelectField label="Categoría" value={categoryId} onChange={setCategoryId} options={categoryOptions} /></div>
            </div>
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
          {!perms.update.allowed && <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><Info className="h-3.5 w-3.5 shrink-0" aria-hidden />Tu rol no permite publicar ni quitar productos de la web; puedes consultarlos.</p>}
        </>
      )}
      {addTarget && <AddToPageDialog product={addTarget} pages={pageList} siteId={siteId} canInclude={caps.siteEdit.allowed} onClose={() => setAddTarget(null)} onDone={() => { setAddTarget(null); refreshCatalog(); queryClient.invalidateQueries({ queryKey: ['website', companyId, 'site', siteId] }) }} />}
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
