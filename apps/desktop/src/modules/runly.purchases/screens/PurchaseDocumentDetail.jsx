import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AttachmentsPanel, EmptyState, ErrorState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, DetailSkeleton, useIsMobile } from '@runly/ui'
import { FileX } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { RecordTasks } from '../../../components/RecordTasks.jsx'
import { useMiraiRecordContext } from '../../runly.chat/lib/miraiPageContext.js'
import { useCapabilities, useDocument, useFilesCount, usePurchasesCan } from '../hooks/usePurchases.js'
import { usePurchaseRoute } from '../hooks/usePurchaseRoute.js'
import { KINDS, PAYMENT_METHODS, PRIORITY_OPTIONS, ROOT, docPath } from '../lib/purchases-constants.js'
import { getDocumentActions } from '../lib/document-actions.js'
import { nextStep } from '../lib/next-step.js'
import { attachmentsConfig } from '../lib/attachments.js'
import { formatDate, today } from '../lib/format.js'
import { DocumentHero, dateFact } from '../components/detail/DocumentHero.jsx'
import { DocumentActionBar, useActionRunner } from '../components/detail/DocumentActionBar.jsx'
import { NextStepPanel } from '../components/detail/NextStepPanel.jsx'
import { PolicyAlerts } from '../components/detail/PolicyAlerts.jsx'
import { AsideCard, CorrectionRulesCard, HistoryPanel, OrderProgressCard, ReceiptsPanel } from '../components/detail/DetailPanels.jsx'
import { LinesPanel } from '../components/detail/LinesPanel.jsx'
import { InventoryRelationsPanel, isInventoryRelation } from '../components/detail/InventoryRelationsPanel.jsx'
import { RelatedDocumentsPanel, collectRelated } from '../components/detail/RelatedDocumentsPanel.jsx'
import { QuotesCompare } from '../components/detail/QuotesCompare.jsx'
import { ReceiveOrderDialog } from '../components/detail/ReceiveOrderDialog.jsx'
import { PaymentDialog } from '../components/detail/PaymentDialog.jsx'
import { PaymentsPanel } from '../components/detail/PaymentsPanel.jsx'
import { CorrectionDialog } from '../components/detail/CorrectionDialog.jsx'
import { ReceiptReversalDialog, ReceiptReversalsPanel } from '../components/detail/ReceiptReversalDialog.jsx'
import { CreateInventoryFromLineDialog } from '../components/detail/CreateInventoryFromLineDialog.jsx'
import { ReadOnlyNotice } from '../components/ReadOnlyNotice.jsx'
import { Timeline } from '../components/detail/Timeline.jsx'
import { caseTimeline } from '../lib/case-timeline.js'

const DETAIL_KINDS = ['orders', 'invoices', 'requests', 'receipts', 'cases']
const WORKBENCH = new Set(['orders', 'invoices', 'cases'])
const label = (options, value) => options.find((o) => o.value === value)?.label
const shortUuid = (value) => (value && value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value)

function factsFor(kind, d) {
  if (kind === 'requests') return [dateFact('Se necesita', d.neededBy), { label: 'Prioridad', value: label(PRIORITY_OPTIONS, d.priority) }, { label: 'Solicitante', value: d.requesterName ?? d.requester?.name }, dateFact('Creada', d.createdAt)]
  return [dateFact('Recibida', d.receivedAt), { label: 'Orden', value: d.orderNumber ?? d.order?.number }, { label: 'Recibió', value: d.receivedByName }]
}

// Orders and invoices: who and the dates that matter, in one line under the folio.
function HeaderLine({ kind, doc }) {
  const supplier = doc.supplier ?? (doc.supplierName ? { name: doc.supplierName, id: doc.supplierId } : null)
  const order = kind === 'invoices' ? (doc.orders ?? [])[0] : null
  const parts = kind === 'cases'
    ? [doc.title, doc.createdAt && `abierto ${formatDate(doc.createdAt)}`, doc.closedAt && doc.status === 'CLOSED' && `cerrado ${formatDate(doc.closedAt)}`]
    : kind === 'orders'
    ? [doc.issueDate && `Fecha ${formatDate(doc.issueDate)}`, doc.issuedAt && `emitida ${formatDate(doc.issuedAt)}`, doc.expectedDate && `entrega esperada ${formatDate(doc.expectedDate)}`, doc.paymentTerms, doc.supplierReference && `ref. ${doc.supplierReference}`]
    : [doc.issueDate && `Emitida ${formatDate(doc.issueDate)}`, doc.dueDate ? `vence ${formatDate(doc.dueDate)}` : 'sin vencimiento', label(PAYMENT_METHODS, doc.paymentMethod)]
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {supplier?.name ? (supplier.id
        ? <Link to={`${ROOT}/suppliers/${supplier.id}`} className="font-medium text-[hsl(var(--foreground))] hover:underline">{supplier.name}</Link>
        : <span className="font-medium text-[hsl(var(--foreground))]">{supplier.name}</span>) : <span>Sin proveedor</span>}
      {parts.filter(Boolean).map((p) => <span key={p}>· {p}</span>)}
      {kind === 'invoices' && doc.fiscalUuid ? <span title={doc.fiscalUuid}>· UUID {shortUuid(doc.fiscalUuid)}</span> : null}
      {order ? <span>· de la orden <Link to={`${ROOT}/orders/${order.id}`} className="font-medium text-[hsl(var(--foreground))] hover:underline">{order.label ?? order.number ?? 'Orden'}</Link></span> : null}
    </span>
  )
}

// Detail for orders, invoices, requests, receipts and cases. Orders and
// invoices use the worktable: tabs in the main column and, beside them, the
// next step, policy, progress, related documents and correction rules.
// Tabs for disabled capabilities or missing permissions are not rendered;
// a disabled capability with history keeps its tab, read-only.
export default function PurchaseDocumentDetail() {
  const navigate = useNavigate()
  const { section, id, searchParams } = usePurchaseRoute()
  const kind = DETAIL_KINDS.includes(section) ? section : 'orders'
  const meta = KINDS[kind]
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const caps = useCapabilities()
  const can = usePurchasesCan()
  const query = useDocument(kind, id)
  const queryClient = useQueryClient()
  const filesCount = useFilesCount(meta.entityType, id, ['orders', 'invoices', 'receipts', 'requests'].includes(kind))
  const [dialog, setDialog] = useState(null)
  const [lineForItems, setLineForItems] = useState(null)
  const phone = useIsMobile(640)
  const doc = query.data
  const runner = useActionRunner(kind, doc, setDialog)

  useMiraiRecordContext({ recordType: 'document', recordId: doc?.id, label: doc?.number ?? doc?.title })

  const actions = useMemo(() => getDocumentActions(kind, doc, { has: caps.has, can }), [kind, doc, caps.has, can])
  const step = useMemo(() => nextStep(kind, doc, actions, { today: today() }), [kind, doc, actions])
  // ?accion=corregir (from the editor of a registered document) opens the
  // audited correction once, only when the user really has that action.
  const askedAction = useRef(false)
  const wantsCorrection = searchParams.get('accion') === 'corregir'
  useEffect(() => {
    if (askedAction.current || !wantsCorrection || !doc) return
    askedAction.current = true
    if (actions.some((a) => a.key === 'correct')) setDialog('correct')
  }, [wantsCorrection, doc, actions])
  const shell = (node) => <div className="min-h-dvh p-4 md:p-6">{node}</div>
  if (query.isLoading || caps.isLoading) return shell(<DetailSkeleton kpis={4} mainCards={2} asideCards={1} />)
  if (query.isError) {
    return shell(query.error?.status === 404
      ? <EmptyState icon={FileX} title={`${meta.short} no encontrada`} description="Puede que se haya eliminado o pertenezca a otra empresa." />
      : <ErrorState title="No se pudo cargar el documento" onRetry={() => query.refetch()} />)
  }
  if (!doc) return shell(<EmptyState icon={FileX} title={`${meta.short} no encontrada`} />)

  const workbench = WORKBENCH.has(kind)
  // Capability off: the document is history, shown read-only (the API refuses writes).
  const readOnly = doc.capabilityEnabled === false
  const inventoryCount = (doc.relations ?? []).filter(isInventoryRelation).length
  const inventoryOn = (caps.has('inventoryRelations') || inventoryCount > 0) && ['orders', 'invoices', 'receipts'].includes(kind)
  const canManageRelations = can('purchases.relation.manage') && doc.status !== 'CANCELLED' && !readOnly
  const canManageItems = canManageRelations && caps.has('inventoryRelations')
  const quotesOn = (caps.has('quotes') || (doc.quotes?.length ?? 0) > 0) && ['requests', 'cases'].includes(kind) && can('purchases.quote.read')
  const filesOn = ['orders', 'invoices', 'receipts', 'requests'].includes(kind)
  // Payments history stays visible (read-only) when the capability is off but money was paid.
  const paymentsOn = kind === 'invoices' && can('purchases.invoice.read') && (caps.has('payments') || Number(doc.paidAmount) > 0)
  const receiptsOn = kind === 'orders' && can('purchases.receipt.read') && (caps.has('receipts') || (doc.receipts?.length ?? 0) > 0)
  const related = collectRelated(doc)
  const relatedCount = related.reduce((n, g) => n + g.rows.length, 0)
  const policyMin = (doc.policyCheck?.requirements ?? []).find((r) => r.stage === 'QUOTES')?.min
  const auditProps = { apiBaseUrl: getApiUrl(), token: session?.access_token, companyId: activeCompanyId, entityType: meta.entityType, entityId: doc.id }

  const tabs = [
    paymentsOn && { value: 'payments', label: 'Pagos' },
    kind !== 'cases' && { value: 'lines', label: kind === 'orders' ? 'Partidas' : 'Conceptos', count: doc.lines?.length },
    kind === 'cases' && { value: 'timeline', label: 'Línea de tiempo' },
    kind === 'cases' && { value: 'related', label: 'Documentos', count: relatedCount },
    receiptsOn && { value: 'receipts', label: 'Recepciones', count: doc.receipts?.length },
    quotesOn && { value: 'quotes', label: 'Cotizaciones', count: doc.quotes?.length },
    inventoryOn && { value: 'inventory', label: 'Inventario', count: inventoryCount },
    kind === 'receipts' && doc.reversal?.available && { value: 'reversals', label: 'Reversos', count: doc.reversal.reversals?.length },
    // Orders and invoices show related documents beside the tabs.
    !workbench && kind !== 'cases' && { value: 'related', label: 'Relacionados', count: relatedCount },
    filesOn && { value: 'files', label: 'Archivos', count: filesCount.data },
    { value: 'history', label: 'Historial' },
  ].filter(Boolean)

  const tabsBlock = (
    <Tabs defaultValue={tabs[0].value} className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList aria-label="Secciones del documento">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              {t.label}{t.count ? ' ' : null}{t.count ? <span className="rounded-full border border-current/35 px-1.5 text-[11px] font-semibold tabular-nums">{t.count}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="lines">
        <LinesPanel kind={kind} doc={doc} onCreateItems={setLineForItems}
          canCreateItems={canManageItems && kind !== 'receipts' && can('inventory.item.create') && doc.status !== 'DRAFT' && doc.status !== 'CANCELLED'} />
      </TabsContent>
      {paymentsOn ? <TabsContent value="payments"><PaymentsPanel invoice={doc} showTotals={false} onRecord={readOnly ? null : () => setDialog('pay')} /></TabsContent> : null}
      {receiptsOn ? <TabsContent value="receipts"><ReceiptsPanel order={doc} /></TabsContent> : null}
      {kind === 'receipts' ? <TabsContent value="reversals"><ReceiptReversalsPanel receipt={doc} /></TabsContent> : null}
      {!workbench || kind === 'cases' ? <TabsContent value="related"><RelatedDocumentsPanel doc={doc} canManage={canManageRelations} /></TabsContent> : null}
      {kind === 'cases' ? <TabsContent value="timeline"><Timeline events={caseTimeline(doc)} label="Línea de tiempo del expediente" /></TabsContent> : null}
      {quotesOn ? (
        <TabsContent value="quotes">
          <QuotesCompare quotes={doc.quotes ?? []} caseId={kind === 'cases' ? doc.id : doc.caseId} requestId={kind === 'requests' ? doc.id : null}
            currency={doc.currency} minRequired={policyMin} canManage={caps.has('quotes') && !readOnly && can('purchases.quote.manage') && !['CLOSED', 'CANCELLED'].includes(doc.status)} />
        </TabsContent>
      ) : null}
      {inventoryOn ? <TabsContent value="inventory"><InventoryRelationsPanel entityType={meta.entityType} doc={doc} canManage={canManageItems} /></TabsContent> : null}
      {filesOn ? (
        <TabsContent value="files">
          <AttachmentsPanel apiBaseUrl={getApiUrl()} token={session?.access_token} companyId={activeCompanyId} recordId={doc.id}
            config={attachmentsConfig(meta.entityType)} context="detail" onChange={() => queryClient.invalidateQueries({ queryKey: ['purchases', 'files-count', meta.entityType, doc.id] })} readOnly={readOnly || !can(meta.update)} showHeading={false} showViewToggle />
        </TabsContent>
      ) : null}
      <TabsContent value="history"><HistoryPanel kind={kind} doc={doc} auditProps={auditProps} /></TabsContent>
    </Tabs>
  )

  const notes = doc.notes || doc.justification || doc.description ? (
    <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">{doc.justification ?? doc.description ?? doc.notes}</p>
  ) : null

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader
        compact eyebrow={`Compras · ${meta.plural}`} title={`${meta.short} ${doc.number ?? 'sin folio'}`}
        description={workbench ? <HeaderLine kind={kind} doc={doc} /> : undefined}
        onBack={() => navigate(`${ROOT}/${kind}`)} backLabel={`Volver a ${meta.plural.toLowerCase()}`}
        // Phones keep the full header (title on its own line, actions below):
        // the collapsed single row has no room for folio and actions at 390px.
        collapsed={phone ? false : undefined} sticky={phone ? false : undefined}
        actions={actions.length ? <DocumentActionBar actions={actions} runner={runner} phone={phone} /> : null}
      />

      <DocumentHero kind={kind} doc={doc} facts={workbench ? [] : factsFor(kind, doc).filter((f) => f.value)}
        onOpenRef={(ref) => { const path = docPath(ref.type, ref.id); if (path) navigate(path) }} />

      {readOnly ? <ReadOnlyNotice subject={`La sección ${meta.plural}`} /> : null}

      {workbench ? (
        // Phones and tablets: next step, then tabs, then the rest of the side column.
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr]">
          <div className="space-y-4 xl:col-start-2 xl:row-start-1">
            <NextStepPanel step={step} actions={actions} runner={runner} />
            <PolicyAlerts policyCheck={doc.policyCheck} />
          </div>
          <div className="min-w-0 space-y-5 xl:col-start-1 xl:row-span-2 xl:row-start-1">
            {notes}
            {tabsBlock}
          </div>
          <div className="space-y-4 xl:col-start-2 xl:row-start-2">
            {kind === 'orders' ? <OrderProgressCard order={doc} /> : null}
            {kind !== 'cases' ? (
              <AsideCard title="Documentos relacionados" footer={kind === 'invoices' ? 'Una factura factura una sola orden; una orden puede tener varias facturas.' : null}>
                <RelatedDocumentsPanel doc={doc} canManage={canManageRelations} />
              </AsideCard>
            ) : null}
            {kind !== 'cases' ? <CorrectionRulesCard plan={doc.correction} /> : null}
          </div>
        </div>
      ) : (
        <>
          <PolicyAlerts policyCheck={doc.policyCheck} />
          {notes}
          {tabsBlock}
        </>
      )}

      {kind === 'orders' ? <RecordTasks type="purchase_order" id={doc.id} /> : null}

      {runner.confirmDialog}
      {kind === 'orders' ? <ReceiveOrderDialog order={doc} open={dialog === 'receive'} onOpenChange={(o) => setDialog(o ? 'receive' : null)} /> : null}
      {kind === 'invoices' ? <PaymentDialog invoice={doc} open={dialog === 'pay'} onOpenChange={(o) => setDialog(o ? 'pay' : null)} /> : null}
      {['orders', 'invoices'].includes(kind) ? <CorrectionDialog kind={kind} doc={doc} open={dialog === 'correct'} onOpenChange={(o) => setDialog(o ? 'correct' : null)} /> : null}
      {kind === 'receipts' ? <ReceiptReversalDialog receipt={doc} open={dialog === 'reverseReceipt'} onOpenChange={(o) => setDialog(o ? 'reverseReceipt' : null)} /> : null}
      <CreateInventoryFromLineDialog line={lineForItems} open={Boolean(lineForItems)} onOpenChange={(o) => { if (!o) setLineForItems(null) }} />
    </div>
  )
}
