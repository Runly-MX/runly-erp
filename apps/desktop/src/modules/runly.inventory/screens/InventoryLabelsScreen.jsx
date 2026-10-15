import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, cn } from '@runly/ui'
import { Globe, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import {
  useDeleteLabelTemplate, useItemsByIds, useLabelPreview, useLabelPrinters, useLabelTemplates, useQueueLabelStats, useSaveLabelTemplate,
} from '../hooks/useInventoryLabels.js'
import { useLabelOutput } from '../hooks/useLabelOutput.js'
import { labeledRows, parseLabelsParams, queueReducer, totalLabels } from '../lib/label-queue.js'
import { draftError, draftToLayout, isDraftDirty, templateToDraft } from '../lib/label-layout.js'
import { LabelQueuePanel } from '../components/labels/LabelQueuePanel.jsx'
import { LabelPreviewPanel } from '../components/labels/LabelPreviewPanel.jsx'
import { LabelSettingsPanel } from '../components/labels/LabelSettingsPanel.jsx'
import { LabelOutputActions, LabelStepBar } from '../components/labels/LabelOutputActions.jsx'
import { LabelPrintersDialog } from '../components/labels/LabelPrintersDialog.jsx'
import { PublicPageSettingsDialog } from '../components/labels/PublicPageSettingsDialog.jsx'
import { LabelTemplateSaveDialog } from '../components/labels/LabelTemplateSaveDialog.jsx'

function Panel({ title, children, className }) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4', className)}>
      {title ? <h2 className="mb-3 text-sm font-semibold">{title}</h2> : null}
      {children}
    </section>
  )
}

export default function InventoryLabelsScreen() {
  const can = useInventoryCan()
  const canRead = can('inventory.label.read')
  const canPrint = can('inventory.label.print')
  const canManage = can('inventory.label.manage')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const deepLink = useMemo(() => parseLabelsParams(searchParams), [searchParams])

  // ── Queue (preloaded from the item list selection or ?items=) ───────────
  const [rows, dispatch] = useReducer(queueReducer, [])
  const seeded = useRef(false)
  const stateItems = location.state?.labelItems
  const linkedItems = useItemsByIds(stateItems?.length ? [] : deepLink.itemIds)
  const linkedReady = linkedItems.every((q) => !q.isLoading)
  useEffect(() => {
    if (seeded.current) return
    if (stateItems?.length) {
      seeded.current = true
      dispatch({ type: 'add', items: stateItems, quantity: deepLink.quantity })
    } else if (deepLink.itemIds.length && linkedReady) {
      seeded.current = true
      dispatch({ type: 'add', items: linkedItems.map((q) => q.data?.data ?? q.data).filter((item) => item?.id), quantity: deepLink.quantity })
    }
  }, [stateItems, deepLink, linkedItems, linkedReady])
  const missingStats = useMemo(() => rows.filter((r) => r.labelPrintCount === undefined).map((r) => r.id), [rows])
  const fetchedStats = useQueueLabelStats(missingStats, { enabled: canRead })
  const statsKey = JSON.stringify(fetchedStats)
  useEffect(() => {
    if (Object.keys(fetchedStats).length) dispatch({ type: 'stats', stats: fetchedStats })
  }, [statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template, printer and the editable draft ────────────────────────────
  const templatesQuery = useLabelTemplates({ enabled: canRead })
  const printersQuery = useLabelPrinters({ enabled: canRead })
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])
  const printers = useMemo(() => printersQuery.data ?? [], [printersQuery.data])
  const [templateId, setTemplateId] = useState(null)
  const [printerId, setPrinterId] = useState(undefined)
  const template = templates.find((t) => t.id === templateId) ?? null
  const printer = printers.find((p) => p.id === printerId) ?? null
  const [draft, setDraft] = useState(() => templateToDraft(null))

  useEffect(() => {
    if (printerId === undefined && printersQuery.data) setPrinterId(printers.find((p) => p.isDefault)?.id ?? null)
  }, [printerId, printersQuery.data, printers])
  useEffect(() => {
    if (templateId && templates.some((t) => t.id === templateId)) return
    if (!templates.length) return
    const preferred = templates.find((t) => t.id === printer?.defaultTemplateId) ?? templates.find((t) => t.isDefault) ?? templates[0]
    setTemplateId(preferred.id)
    setDraft(templateToDraft(preferred))
  }, [templates, templateId, printer])

  function selectTemplate(id) {
    const next = templates.find((t) => t.id === id)
    setTemplateId(id)
    setDraft(templateToDraft(next))
  }
  function selectPrinter(id) {
    setPrinterId(id)
    const next = printers.find((p) => p.id === id)
    if (next?.defaultTemplateId && templates.some((t) => t.id === next.defaultTemplateId)) selectTemplate(next.defaultTemplateId)
  }

  const dirty = Boolean(template) && isDraftDirty(draft, template)
  const invalidReason = draftError(draft)
  // Printer dpi wins over the template's when a printer is chosen.
  const layoutOverride = useMemo(() => {
    if (!dirty || invalidReason) return undefined
    const layout = draftToLayout(draft)
    if (printer) delete layout.dpi
    return layout
  }, [dirty, invalidReason, draft, printer])

  const previewBody = rows.length && !invalidReason && template ? {
    items: [{ itemId: rows[0].id, quantity: 1 }],
    templateId: template.id,
    layout: draftToLayout(draft),
    printerId: printer?.id,
    format: 'png',
  } : null
  const preview = useLabelPreview(previewBody, { enabled: canPrint })

  // ── Output ──────────────────────────────────────────────────────────────
  const output = useLabelOutput({ rows, templateId: template?.id, layout: layoutOverride, printer })
  const [confirmReprint, setConfirmReprint] = useState(null)
  const reprinted = labeledRows(rows)
  const outputDisabled = !canPrint || !rows.length || Boolean(invalidReason) || !template
  function guarded(action) {
    if (reprinted.length) setConfirmReprint(() => action)
    else action()
  }

  // ── Template management ─────────────────────────────────────────────────
  const saveTemplate = useSaveLabelTemplate()
  const deleteTemplate = useDeleteLabelTemplate()
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false)
  const [printersOpen, setPrintersOpen] = useState(false)
  const [publicPageOpen, setPublicPageOpen] = useState(false)

  async function persistTemplate(data, success, { keepDraft = false } = {}) {
    try {
      const saved = await saveTemplate.mutateAsync(data)
      toast.success(success)
      if (saved?.id && !keepDraft) { setTemplateId(saved.id); setDraft(templateToDraft(saved)) }
      return true
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la plantilla')
      return false
    }
  }

  const [step, setStep] = useState('queue')
  const busy = Boolean(output.busy) || saveTemplate.isPending

  if (!canRead) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={Lock} title="Sin acceso a etiquetas" description="Pide a un administrador el permiso Ver etiquetas de inventario." />
      </div>
    )
  }

  const loadingConfig = templatesQuery.isLoading || printersQuery.isLoading
  const configError = templatesQuery.error || printersQuery.error
  const total = totalLabels(rows)
  const actions = (stacked) => (
    <LabelOutputActions plan={output.plan} busy={output.busy} disabled={outputDisabled} stacked={stacked}
      onPrint={() => guarded(output.print)} onDownload={(format) => (format === 'png' ? output.download(format) : guarded(() => output.download(format)))} />
  )

  const queuePanel = <LabelQueuePanel rows={rows} dispatch={dispatch} disabled={busy || !canPrint} />
  const previewPanel = (compact) => (
    <LabelPreviewPanel preview={preview} draft={draft} hasItems={rows.length > 0} total={total} compact={compact}
      invalidReason={!canPrint ? 'Necesitas el permiso Imprimir etiquetas de inventario para ver la vista previa.' : invalidReason} />
  )
  const settingsPanel = loadingConfig ? (
    <div className="space-y-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>
  ) : configError ? (
    <ErrorState title="No se pudo cargar la configuración" description={configError.message}
      onRetry={() => { templatesQuery.refetch(); printersQuery.refetch() }} />
  ) : (
    <LabelSettingsPanel
      templates={templates} printers={printers} templateId={templateId} onTemplateChange={selectTemplate}
      printerId={printer?.id ?? null} onPrinterChange={selectPrinter} draft={draft} onDraftChange={setDraft}
      dirty={dirty} canManage={canManage} busy={busy} plan={output.plan}
      onReset={() => setDraft(templateToDraft(template))}
      onSaveChanges={() => persistTemplate({ id: template.id, name: template.name, ...draftToLayout(draft) }, 'Plantilla actualizada')}
      onSaveAs={() => setSaveAsOpen(true)}
      onMakeDefault={() => persistTemplate({ id: template.id, isDefault: true }, 'Plantilla predeterminada actualizada', { keepDraft: true })}
      onDeleteTemplate={() => setConfirmDeleteTemplate(true)}
      onManagePrinters={() => setPrintersOpen(true)}
    />
  )

  return (
    <div className="min-h-dvh space-y-4 p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Etiquetas"
        description="Imprime etiquetas con código QR para tus equipos."
        onBack={() => navigate('/app/m/runly.inventory/inventory')}
        backLabel="Inventario"
        actions={(
          <div className="flex items-center gap-2">
            {canManage ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setPublicPageOpen(true)}>
                <Globe className="mr-1.5 h-4 w-4" />Página pública
              </Button>
            ) : null}
            <div className="hidden lg:block">{actions(false)}</div>
          </div>
        )}
      />

      {/* Desktop: queue | live preview | settings */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <Panel title="Cola de impresión">{queuePanel}</Panel>
        <Panel title="Vista previa" className="lg:sticky lg:top-4">{previewPanel(false)}</Panel>
        <Panel title="Plantilla e impresora">{settingsPanel}</Panel>
      </div>

      {/* Phone / tablet: one step at a time with a fixed bottom bar */}
      <div className="lg:hidden">
        {step === 'queue' ? <Panel title="Cola de impresión">{queuePanel}</Panel> : null}
        {step === 'preview' ? <Panel title="Vista previa">{previewPanel(false)}</Panel> : null}
        {step === 'settings' ? (
          <div className="space-y-3">
            <div className="sticky top-0 z-10 -mx-4 bg-[hsl(var(--background))] px-4 pb-2 pt-1">{previewPanel(true)}</div>
            <Panel title="Plantilla e impresora">{settingsPanel}</Panel>
          </div>
        ) : null}
        {step === 'print' ? (
          <Panel title="Imprimir">
            <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-[hsl(var(--muted-foreground))]">Equipos</dt><dd className="text-right font-medium">{rows.length}</dd>
              <dt className="text-[hsl(var(--muted-foreground))]">Etiquetas</dt><dd className="text-right font-medium">{total}</dd>
              <dt className="text-[hsl(var(--muted-foreground))]">Plantilla</dt><dd className="truncate text-right font-medium">{template?.name ?? '—'}{dirty ? ' (modificada)' : ''}</dd>
              <dt className="text-[hsl(var(--muted-foreground))]">Impresora</dt><dd className="truncate text-right font-medium">{printer?.name ?? 'Navegador (PDF)'}</dd>
            </dl>
            {!rows.length ? <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">Agrega equipos en la Cola para imprimir.</p> : null}
            {actions(true)}
          </Panel>
        ) : null}
      </div>
      <LabelStepBar step={step} onStep={setStep} queueCount={rows.length} />

      <ConfirmDialog
        open={Boolean(confirmReprint)}
        onOpenChange={(v) => { if (!v) setConfirmReprint(null) }}
        title="Reimprimir etiquetas"
        description={`${reprinted.length === 1 ? 'Un equipo ya tiene' : `${reprinted.length} equipos ya tienen`} etiqueta impresa. La reimpresión queda registrada en su historial.`}
        detail={reprinted.slice(0, 5).map((r) => r.folio ?? r.name).filter(Boolean).join(', ') + (reprinted.length > 5 ? '…' : '')}
        confirmLabel="Reimprimir"
        onConfirm={() => { const action = confirmReprint; setConfirmReprint(null); action?.() }}
      />
      <ConfirmDialog
        open={confirmDeleteTemplate}
        onOpenChange={setConfirmDeleteTemplate}
        title="Eliminar plantilla"
        description="Dejará de estar disponible para imprimir. El historial de etiquetas impresas se conserva."
        detail={template?.name ?? ''}
        confirmLabel="Eliminar"
        loading={deleteTemplate.isPending}
        onConfirm={async () => {
          try {
            await deleteTemplate.mutateAsync(template.id)
            toast.success('Plantilla eliminada')
            setTemplateId(null)
          } catch (err) {
            toast.error(err?.message ?? 'No se pudo eliminar la plantilla')
          }
          setConfirmDeleteTemplate(false)
        }}
      />
      <LabelTemplateSaveDialog open={saveAsOpen} onOpenChange={setSaveAsOpen} saving={saveTemplate.isPending}
        initialName={template ? `${template.name} (copia)` : ''}
        onSave={async ({ name, isDefault }) => {
          if (await persistTemplate({ name, isDefault, ...draftToLayout(draft) }, 'Plantilla guardada')) setSaveAsOpen(false)
        }} />
      {canManage ? <PublicPageSettingsDialog open={publicPageOpen} onOpenChange={setPublicPageOpen} /> : null}
      {canManage ? <LabelPrintersDialog open={printersOpen} onOpenChange={setPrintersOpen} printers={printers} templates={templates} /> : null}
    </div>
  )
}
