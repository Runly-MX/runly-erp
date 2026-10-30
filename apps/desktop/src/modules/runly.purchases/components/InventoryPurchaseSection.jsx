import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, History, Link2, Plus, Replace, ShoppingCart } from 'lucide-react'
import { Button, EmptyState, ErrorState, Skeleton, cn } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { PURCHASES_BASE_PATH, STAGE_ORDER, formatDay, formatMoney, hasPermission, hasStageDocs } from './InventoryPurchaseMeta.js'
import { InventoryPurchaseDocCard } from './InventoryPurchaseTimeline.jsx'
import { legacyPurchaseData, possibleDuplicates, splitPurchaseDocs } from './inventory-purchase-tiers.js'
import { InventoryPurchaseLinkDialog } from './InventoryPurchaseLinkDialog.jsx'
import { UnlinkRelationDialog } from './detail/UnlinkRelationDialog.jsx'

// Unwraps `{ data }` when the SDK returns the envelope.
function unwrapSummary(response) {
  if (response?.data && (response.data.timeline || response.data.capabilities)) return response.data
  return response ?? null
}

const TYPE_LABEL = { purchase_case: 'Expediente', purchase_request: 'Solicitud', purchase_order: 'Orden de compra', purchase_receipt: 'Recepción', purchase_invoice: 'Factura' }
const CONCEPT_LABEL = { order: 'orden de compra', invoice: 'factura', supplier: 'proveedor', date: 'fecha de compra', price: 'precio de compra' }

// Collapsible tier (2 and 3): closed by default, always reachable.
function Tier({ id, title, count, hint, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl border border-[hsl(var(--border))]" aria-labelledby={`${id}-title`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]">
        <History className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />
        <span id={`${id}-title`} className="flex-1 text-sm font-semibold">{title} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {count}</span></span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="space-y-3 border-t border-[hsl(var(--border))] px-3 py-3">{hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}{children}</div> : null}
    </section>
  )
}

const legacyValue = (row, currency) => (row.kind === 'date' ? formatDay(row.value) : row.kind === 'money' ? formatMoney(row.value, currency) : row.value)

// RunlyDetail "component" section of the inventory item detail: the item's
// purchases from runly.purchases (GET /purchases/inventory/:id/summary) in
// three tiers: current documents, historical relations (cancelled
// documents), and inherited data with custom fields that may duplicate
// purchase data. Nothing is dropped: tiers 2 and 3 are collapsed, not hidden.
export default function InventoryPurchaseSection({ data: item }) {
  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const navigate = useNavigate()
  const client = useQueryClient()
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkType, setLinkType] = useState(null)
  const [unlinkDoc, setUnlinkDoc] = useState(null)
  const itemId = item?.id
  const canRead = hasPermission(userProfile, 'purchases.relation.read')
  const canManage = hasPermission(userProfile, 'purchases.relation.manage')
  const summaryKey = ['purchases', 'inventory-summary', itemId]

  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: () => runly.purchases.inventorySummary(itemId, token),
    enabled: Boolean(token && itemId && canRead),
  })
  const refresh = () => {
    client.invalidateQueries({ queryKey: summaryKey })
    client.invalidateQueries({ queryKey: ['inventory'] })
  }

  const model = unwrapSummary(summary.data)
  const capabilities = model?.capabilities ?? {}
  const stages = useMemo(() => {
    const rows = (model?.timeline ?? []).filter((stage) => Array.isArray(stage?.docs) && stage.docs.length > 0)
    const rank = (key) => { const i = STAGE_ORDER.indexOf(key); return i === -1 ? STAGE_ORDER.length : i }
    return rows.map((stage, index) => ({ stage, index })).sort((a, b) => rank(a.stage.stage) - rank(b.stage.stage) || a.index - b.index).map((row) => row.stage)
  }, [model])
  const linkedIds = useMemo(() => new Set(stages.flatMap((stage) => stage.docs.map((doc) => doc.id))), [stages])
  const { current, historical } = useMemo(() => splitPurchaseDocs(model?.timeline ?? []), [model])
  const legacy = useMemo(() => legacyPurchaseData(item ?? {}), [item])
  const duplicates = useMemo(() => possibleDuplicates(item?.customValues ?? [], current, legacy), [item, current, legacy])

  if (!canRead || !itemId) return null
  if (summary.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    )
  }
  if (summary.isError) {
    return <ErrorState title="No se pudieron cargar las compras" description={summary.error?.message} onRetry={() => summary.refetch()} />
  }
  // Links turned off in Compras: existing purchases stay visible as read-only history.
  const linksOff = capabilities.inventoryRelations === false
  if (linksOff && !stages.length && !legacy.length && !duplicates.length) {
    return <EmptyState variant="compact" icon={ShoppingCart} title="La relación con inventario está desactivada en Compras." />
  }

  const canOrder = !linksOff && capabilities.purchaseOrders !== false && hasPermission(userProfile, 'purchases.order.create')
  const canInvoice = !linksOff && capabilities.invoices !== false && hasPermission(userProfile, 'purchases.invoice.create')
  const linkTypes = [capabilities.purchaseOrders !== false && 'order', capabilities.invoices !== false && 'invoice'].filter(Boolean)
  const canLink = !linksOff && canManage && linkTypes.length > 0
  const create = (kind) => navigate(`${PURCHASES_BASE_PATH}/${kind}/new?inventoryId=${encodeURIComponent(itemId)}`)
  // One order and one invoice per item: once linked, offer "Cambiar" instead of adding another.
  const hasOrder = hasStageDocs(stages, 'purchase_order')
  const hasInvoice = hasStageDocs(stages, 'purchase_invoice')
  const replaceTypes = [hasOrder && 'order', hasInvoice && 'invoice'].filter(Boolean)
  const openLink = (type) => { setLinkType(type); setLinkOpen(true) }
  const documentCount = current.length
  const allocated = Number(model?.allocatedAmount ?? 0)

  const actions = (canOrder || canInvoice || canLink) ? (
    <div className="space-y-2">
      {((canOrder && !hasOrder) || (canInvoice && !hasInvoice)) ? (
        <div className={canOrder && !hasOrder && canInvoice && !hasInvoice ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'grid grid-cols-1 gap-2'}>
          {canOrder && !hasOrder ? <Button type="button" size="sm" variant="outline" onClick={() => create('orders')}><Plus className="mr-1.5 h-3.5 w-3.5" />Crear orden</Button> : null}
          {canInvoice && !hasInvoice ? <Button type="button" size="sm" variant="outline" onClick={() => create('invoices')}><Plus className="mr-1.5 h-3.5 w-3.5" />Crear factura</Button> : null}
        </div>
      ) : null}
      {canLink && linkTypes.some((type) => !replaceTypes.includes(type)) ? (
        <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => openLink(null)}>
          <Link2 className="mr-1.5 h-3.5 w-3.5" />Relacionar existente
        </Button>
      ) : null}
      {canLink ? replaceTypes.filter((type) => linkTypes.includes(type)).map((type) => (
        <Button key={type} type="button" size="sm" variant="outline" className="w-full" onClick={() => openLink(type)}>
          <Replace className="mr-1.5 h-3.5 w-3.5" />{type === 'order' ? 'Cambiar orden' : 'Cambiar factura'}
        </Button>
      )) : null}
    </div>
  ) : null

  const unlinkable = canManage && !linksOff
  return (
    <div className="space-y-4" data-purchases-section="">
      {current.length ? (
        <section aria-labelledby="inv-purchases-current" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="inv-purchases-current" className="text-sm font-semibold">Documentos vigentes</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {documentCount} {documentCount === 1 ? 'documento' : 'documentos'}{allocated > 0 ? ` · ${formatMoney(allocated, model?.currency)} asignado` : ''}
            </p>
          </div>
          <ul className="space-y-2" aria-label="Documentos de compra vigentes">
            {current.map((doc) => (
              <li key={`${doc.type}-${doc.id}`}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{TYPE_LABEL[doc.type] ?? 'Documento'}</p>
                <InventoryPurchaseDocCard doc={doc} onOpen={(href) => navigate(href)} onUnlink={unlinkable && doc.relationId ? setUnlinkDoc : null} />
              </li>
            ))}
          </ul>
          {linksOff ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Solo lectura: la relación con inventario está desactivada en Compras.</p> : actions}
        </section>
      ) : (
        <EmptyState
          icon={ShoppingCart}
          className="gap-3 px-4 py-8"
          title="Sin compras vigentes"
          description={(canOrder || canInvoice || canLink)
            ? 'Registra la orden o factura con la que se adquirió este activo, o relaciona un documento que ya exista en Compras.'
            : 'Este activo no tiene órdenes ni facturas vigentes en Compras.'}
        >
          {actions && !linksOff ? <div className="w-full pt-1">{actions}</div> : null}
        </EmptyState>
      )}

      {historical.length ? (
        <Tier id="inv-purchases-history" title="Relaciones históricas" count={historical.length}
          hint="Documentos cancelados: la relación se conserva como historial y el activo quedó libre para otra compra.">
          <ul className="space-y-2" aria-label="Relaciones históricas">
            {historical.map((doc) => (
              <li key={`${doc.type}-${doc.id}`}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{TYPE_LABEL[doc.type] ?? 'Documento'} cancelada</p>
                <InventoryPurchaseDocCard doc={doc} onOpen={(href) => navigate(href)} onUnlink={unlinkable && doc.relationId ? setUnlinkDoc : null} />
              </li>
            ))}
          </ul>
        </Tier>
      ) : null}

      {legacy.length || duplicates.length ? (
        <Tier id="inv-purchases-legacy" title="Datos heredados y posibles duplicados" count={legacy.length + duplicates.length}
          hint="Información anterior a Compras y campos personalizados que parecen repetir datos de compra. No se modifican, ocultan ni migran: unificarlos requiere un censo y aprobación.">
          {legacy.length ? (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold">Datos de compra heredados</h4>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Datos de compra heredados">
                {legacy.map((row) => (
                  <div key={row.key} className="min-w-0">
                    <dt className="text-xs text-[hsl(var(--muted-foreground))]">{row.label}</dt>
                    <dd className="truncate text-sm font-medium">{legacyValue(row, model?.currency)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {duplicates.length ? (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold">Campos personalizados con datos de compra</h4>
              <ul className="space-y-1.5" aria-label="Posibles duplicados">
                {duplicates.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="min-w-0"><span className="text-[hsl(var(--muted-foreground))]">{d.label}:</span> <span className="font-medium">{String(d.value)}</span></span>
                    <span className={cn('text-xs', d.matches ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300')}>
                      {d.matches ? `Coincide con ${CONCEPT_LABEL[d.concept]} de Compras` : `No coincide con ${CONCEPT_LABEL[d.concept]} de Compras`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">Siguen visibles en «Campos personalizados».</p>
            </div>
          ) : null}
        </Tier>
      ) : null}

      {canLink ? (
        <InventoryPurchaseLinkDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          inventoryId={itemId}
          token={token}
          types={linkType ? [linkType] : linkTypes.filter((type) => !replaceTypes.includes(type))}
          replaceTypes={replaceTypes}
          linkedIds={linkedIds}
          onLinked={refresh}
        />
      ) : null}
      {/* Shows the impact first: derived links need a keep/remove choice. */}
      <UnlinkRelationDialog
        relation={unlinkDoc?.relationId ? { id: unlinkDoc.relationId, label: unlinkDoc.number ?? 'Documento' } : null}
        onOpenChange={(open) => { if (!open) setUnlinkDoc(null) }}
        onDone={refresh}
      />
    </div>
  )
}
