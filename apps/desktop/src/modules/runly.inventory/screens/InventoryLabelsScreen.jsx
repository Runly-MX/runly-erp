import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, ChipTabPanel, ChipTabs, ConfirmDialog, EmptyState, ErrorState, PageHeader, Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, Skeleton, cn,
} from '@runly/ui'
import { ChevronDown, Globe, History, Lock, PenTool } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import {
  useDeleteLabelTemplate, useItemPublicLink, useItemsByIds, useLabelPrinters, useLabelTemplates, useQueueLabelStats, useSaveLabelTemplate,
} from '../hooks/useInventoryLabels.js'
import { useLabelOutput } from '../hooks/useLabelOutput.js'
import { MAX_LABELS, labeledRows, parseLabelsParams, queueReducer, statsAfterPrint, totalLabels } from '../lib/label-queue.js'
import { draftError, draftToLayout, isDraftDirty, templateToDraft } from '../lib/label-layout.js'
import { DEFAULT_SHEET, clampSheet, sheetFit, sheetPages } from '../lib/label-sheet.js'
import { loadDesign, saveDesign } from '../lib/label-design-store.js'
import { buildLabelPreview } from '../lib/label-preview.js'
import { reprintItems } from '../lib/label-history.js'
import { LabelAssetPicker } from '../components/labels/LabelAssetPicker.jsx'
import { LabelLivePreview } from '../components/labels/LabelLivePreview.jsx'
import { LabelTemplateBar } from '../components/labels/LabelTemplateBar.jsx'
import { LabelDesignPanel } from '../components/labels/LabelDesignPanel.jsx'
import { LabelPrinterSelect } from '../components/labels/LabelPrinterSelect.jsx'
import { LabelActionBar } from '../components/labels/LabelActionBar.jsx'
import { LabelHistoryPanel } from '../components/labels/LabelHistoryPanel.jsx'
import { LabelPrintersDialog } from '../components/labels/LabelPrintersDialog.jsx'
import { PublicPageSettingsDialog } from '../components/labels/PublicPageSettingsDialog.jsx'
import { LabelTemplateSaveDialog } from '../components/labels/LabelTemplateSaveDialog.jsx'
import { plural } from '../components/labels/studio-ui.jsx'

const TABS = [
  { value: 'create', label: 'Crear etiquetas', icon: PenTool, description: 'Selecciona activos, diseña la etiqueta e imprime.' },
  { value: 'history', label: 'Historial', icon: History, description: 'Impresiones recientes; puedes reimprimir una tirada.' },
]

function StudioSummary({ assets, labels, templateName, dirty, printerName, output, pages, reprinted }) {
  const row = (label, value) => (
    <>
      <dt className="text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </>
  )
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Resumen</h2>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {row('Activos', assets)}
        {row('Etiquetas', labels)}
        {row('Plantilla', `${templateName ?? '—'}${dirty ? ' (modificada)' : ''}`)}
        {row('Impresora', printerName)}
        {row('Salida', output.mode === 'sheet' ? `Hoja carta ${output.sheet.columns} × ${output.sheet.rows}${pages ? ` · ${plural(pages, 'hoja', 'hojas')}` : ''}` : 'Rollo')}
      </dl>
      {reprinted.length ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {plural(reprinted.length, 'activo ya tiene', 'activos ya tienen')} etiqueta; se pedirá confirmación y la reimpresión queda registrada.
        </p>
      ) : null}
    </div>
  )
}

function LabelStudio({ companyId, companyName }) {
  const can = useInventoryCan()
  const canRead = can('inventory.label.read')
  const canPrint = can('inventory.label.print')
  const canManage = can('inventory.label.manage')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const deepLink = useMemo(() => parseLabelsParams(searchParams), [searchParams])
  const saved = useMemo(() => loadDesign(companyId), [companyId])

  // ── Selection (preloaded from the item list, the scan kiosk or ?items=) ──
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
  const missingStats = useMemo(() => rows.filter((r) => r.labelPrintCount === undefined).map((r) => r.id).slice(0, 100), [rows])
  const fetchedStats = useQueueLabelStats(missingStats, { enabled: canRead })
  const statsKey = JSON.stringify(fetchedStats)
  useEffect(() => {
    if (Object.keys(fetchedStats).length) dispatch({ type: 'stats', stats: fetchedStats })
  }, [statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Template, printer, editable draft and output (remembered per company) ─
  const templatesQuery = useLabelTemplates({ enabled: canRead })
  const printersQuery = useLabelPrinters({ enabled: canRead })
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data])
  const printers = useMemo(() => printersQuery.data ?? [], [printersQuery.data])
  const [templateId, setTemplateId] = useState(saved?.templateId ?? null)
  const [printerId, setPrinterId] = useState(saved ? saved.printerId : undefined)
  const [draft, setDraft] = useState(() => saved?.draft ?? templateToDraft(null))
  const [output, setOutput] = useState(() => saved?.output ?? { mode: 'roll', sheet: DEFAULT_SHEET })
  const keepSavedDraft = useRef(Boolean(saved?.draft && saved?.templateId))
  const template = templates.find((t) => t.id === templateId) ?? null
  const printer = printers.find((p) => p.id === printerId) ?? null

  useEffect(() => {
    if (!printersQuery.data) return
    if (printerId === undefined || (printerId && !printers.some((p) => p.id === printerId))) {
      setPrinterId(printers.find((p) => p.isDefault)?.id ?? null)
    }
  }, [printerId, printersQuery.data, printers])
  useEffect(() => {
    if (!templates.length) return
    const current = templates.find((t) => t.id === templateId)
    if (current) {
      if (!keepSavedDraft.current) return
      keepSavedDraft.current = false
      return
    }
    keepSavedDraft.current = false
    const preferred = templates.find((t) => t.id === printer?.defaultTemplateId) ?? templates.find((t) => t.isDefault) ?? templates[0]
    setTemplateId(preferred.id)
    setDraft(templateToDraft(preferred))
  }, [templates, templateId, printer])
  useEffect(() => {
    if (templateId) saveDesign(companyId, { templateId, printerId, draft, output })
  }, [companyId, templateId, printerId, draft, output])

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

  const total = totalLabels(rows)
  const fit = sheetFit(output.sheet, Number(draft.widthMm), Number(draft.heightMm))
  const sheet = output.mode === 'sheet' && fit.fits ? clampSheet(output.sheet) : null
  const labelOutput = useLabelOutput({
    rows, templateId: template?.id, layout: layoutOverride, printer, sheet,
    onLogged: (printed) => dispatch({ type: 'stats', stats: statsAfterPrint(printed) }),
  })
  const plan = labelOutput.plan
  const pages = output.mode === 'sheet' && plan.format === 'pdf' ? sheetPages(total, fit.perPage) : 0

  // ── Preview: one selected label at a time, or the first search result ────
  const [previewIndex, setPreviewIndex] = useState(0)
  const [sample, setSample] = useState(null)
  const onSample = useCallback((item) => setSample(item), [])
  useEffect(() => { if (previewIndex > rows.length - 1) setPreviewIndex(Math.max(0, rows.length - 1)) }, [rows.length, previewIndex])
  const previewItem = rows[previewIndex] ?? (rows.length ? rows[0] : sample)
  // The preview is computed locally, so it only needs a valid draft.
  const previewBlocked = invalidReason
  // Instant SVG preview from the shared geometry (no network). The QR uses the
  // real public link once fetched, a folio placeholder until then.
  const wantsLink = canPrint && !previewBlocked && draft.layout !== 'text-only' && draft.qrOptions?.contentMode !== 'embedded'
  const publicLink = useItemPublicLink(previewItem?.id, { enabled: wantsLink })
  const qrUrl = publicLink.data?.url ?? null
  const preview = useMemo(
    () => (previewItem && !previewBlocked
      ? buildLabelPreview({ draft, item: previewItem, companyName, qrUrl, origin: typeof window !== 'undefined' ? window.location.origin : '' })
      : { svg: null, overflow: 0, error: null }),
    [draft, previewItem, previewBlocked, companyName, qrUrl],
  )

  // ── Output guards ────────────────────────────────────────────────────────
  const reprinted = labeledRows(rows)
  const disabledReason = !canPrint ? 'Sin permiso para imprimir etiquetas.'
    : !rows.length ? 'Selecciona al menos un activo.'
      : invalidReason ?? (total > MAX_LABELS ? `Máximo ${MAX_LABELS} etiquetas por impresión.` : null)
        ?? (output.mode === 'sheet' && plan.format === 'pdf' && !fit.fits ? `La cuadrícula no cabe en la hoja: ${fit.reason}` : null)
  const outputDisabled = Boolean(disabledReason) || !template
  const [confirmReprint, setConfirmReprint] = useState(null)
  function guarded(action) {
    if (reprinted.length) setConfirmReprint(() => action)
    else action()
  }

  // ── Template management ──────────────────────────────────────────────────
  const saveTemplate = useSaveLabelTemplate()
  const deleteTemplate = useDeleteLabelTemplate()
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState(false)
  const [printersOpen, setPrintersOpen] = useState(false)
  const [publicPageOpen, setPublicPageOpen] = useState(false)
  async function persistTemplate(data, success, { keepDraft = false } = {}) {
    try {
      const result = await saveTemplate.mutateAsync(data)
      toast.success(success)
      if (result?.id && !keepDraft) { setTemplateId(result.id); setDraft(templateToDraft(result)) }
      return true
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la plantilla')
      return false
    }
  }

  // ── Tabs, phone steps and history reprint ────────────────────────────────
  const [tab, setTab] = useState('create')
  const [step, setStep] = useState('select')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  function changeStep(next) {
    setStep(next)
    window.scrollTo?.({ top: 0 })
  }
  function reprint(run) {
    const items = reprintItems(run)
    dispatch({ type: 'replace', items })
    if (run.templateId && templates.some((t) => t.id === run.templateId)) selectTemplate(run.templateId)
    if (run.printerId && printers.some((p) => p.id === run.printerId)) setPrinterId(run.printerId)
    setPreviewIndex(0)
    setTab('create')
    setStep('select')
    toast.success(`${plural(items.length, 'activo listo', 'activos listos')} para reimprimir`, { description: 'Revisa las copias y el diseño antes de imprimir.' })
  }

  const busy = Boolean(labelOutput.busy) || saveTemplate.isPending

  if (!canRead) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={Lock} title="Sin acceso a etiquetas" description="Pide a un administrador el permiso Ver etiquetas de inventario." />
      </div>
    )
  }

  const loadingConfig = templatesQuery.isLoading || printersQuery.isLoading
  const configError = templatesQuery.error || printersQuery.error
  const printerName = printer?.name ?? 'Navegador (PDF)'
  const previewProps = {
    preview, draft, item: previewItem, index: rows.length ? Math.min(previewIndex, rows.length - 1) : 0, count: rows.length,
    onIndex: setPreviewIndex, sample: !rows.length && Boolean(sample), blockedReason: previewBlocked,
  }
  const printerSelect = (
    <LabelPrinterSelect printers={printers} printerId={printer?.id ?? null} onChange={selectPrinter} plan={plan}
      canManage={canManage} busy={busy} onManage={() => setPrintersOpen(true)} />
  )

  const design = loadingConfig ? (
    <div className="space-y-3 p-4" aria-hidden="true"><Skeleton className="h-11 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-48 w-full" /></div>
  ) : configError ? (
    <div className="p-4">
      <ErrorState title="No se pudo cargar la configuración" description={configError.message}
        onRetry={() => { templatesQuery.refetch(); printersQuery.refetch() }} />
    </div>
  ) : (
    <div className="space-y-2 p-4">
      <LabelTemplateBar templates={templates} templateId={templateId} dirty={dirty} canManage={canManage} busy={busy}
        onSelect={selectTemplate} onReset={() => setDraft(templateToDraft(template))}
        onSaveChanges={() => persistTemplate({ id: template.id, name: template.name, ...draftToLayout(draft) }, 'Plantilla actualizada')}
        onSaveAs={() => setSaveAsOpen(true)}
        onMakeDefault={() => persistTemplate({ id: template.id, isDefault: true }, 'Plantilla predeterminada actualizada', { keepDraft: true })}
        onDelete={() => setConfirmDeleteTemplate(true)} />
      <div className="border-t border-[hsl(var(--border))] pt-1">
        <LabelDesignPanel key={templateId ?? 'none'} draft={draft} onDraftChange={setDraft} output={output} onOutputChange={setOutput}
          labelCount={total} printers={printers} printerId={printer?.id ?? null} onPrinterChange={selectPrinter} plan={plan}
          canManage={canManage} busy={busy} onManagePrinters={() => setPrintersOpen(true)} />
      </div>
    </div>
  )

  return (
    <div className={cn('min-h-dvh space-y-4 p-4 md:p-6', tab === 'create' ? 'pb-44 lg:pb-0' : 'pb-8')}>
      <PageHeader
        eyebrow="Runly Inventario"
        title="Etiquetas"
        description="Selecciona activos, diseña la etiqueta con vista previa en vivo e imprime en rollo u hoja carta."
        onBack={() => navigate('/app/m/runly.inventory/inventory')}
        backLabel="Inventario"
        actions={canManage ? (
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setPublicPageOpen(true)}>
            <Globe className="mr-1.5 h-4 w-4" />Página pública
          </Button>
        ) : null}
      />

      <ChipTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Etiquetas" showDescription={false} />

      <ChipTabPanel value="create" active={tab === 'create'}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(400px,460px)] lg:items-start">
          <section aria-label="Activos" className={cn('min-w-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]', step !== 'select' && 'hidden lg:block')}>
            <LabelAssetPicker rows={rows} dispatch={dispatch} disabled={busy || !canPrint} onSample={onSample} />
          </section>

          <aside aria-label="Diseño" className={cn(
            'min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]',
            'lg:sticky lg:top-4 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:overscroll-contain',
            step === 'select' && 'hidden lg:block',
          )}>
            <div className="sticky top-0 z-10 rounded-t-lg border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
              <button type="button" className="mb-2 flex min-h-10 w-full items-center justify-between text-sm font-semibold lg:hidden"
                aria-expanded={!previewCollapsed} onClick={() => setPreviewCollapsed((v) => !v)}>
                Vista previa
                <ChevronDown className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', !previewCollapsed && 'rotate-180')} aria-hidden="true" />
              </button>
              <div className={cn(previewCollapsed && 'hidden lg:block')}>
                <div className="lg:hidden"><LabelLivePreview {...previewProps} compact /></div>
                <div className="hidden lg:block"><LabelLivePreview {...previewProps} /></div>
              </div>
            </div>
            <div className={cn(step === 'print' && 'hidden lg:block')}>{design}</div>
            {step === 'print' ? (
              <div className="space-y-5 p-4 lg:hidden">
                <StudioSummary assets={rows.length} labels={total} templateName={template?.name} dirty={dirty} printerName={printerName}
                  output={output} pages={pages} reprinted={reprinted} />
                {printerSelect}
                {disabledReason ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{disabledReason}</p> : null}
              </div>
            ) : null}
          </aside>
        </div>
      </ChipTabPanel>

      {tab === 'create' ? (
        <LabelActionBar
          assets={rows.length} labels={total} reprinted={reprinted.length} templateName={template ? `${template.name}${dirty ? ' (modificada)' : ''}` : null}
          printerName={printerName} plan={plan} busy={labelOutput.busy} disabled={outputDisabled} disabledReason={disabledReason}
          onPrint={() => guarded(labelOutput.print)}
          onDownload={(format) => (format === 'png' ? labelOutput.download(format) : guarded(() => labelOutput.download(format)))}
          step={step} onStep={changeStep} onPreview={() => setPreviewOpen(true)} />
      ) : null}

      <ChipTabPanel value="history" active={tab === 'history'}>
        <LabelHistoryPanel canPrint={canPrint} onReprint={reprint} />
      </ChipTabPanel>

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="bottom" className="flex max-h-[90dvh] flex-col gap-0 p-0">
          <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
            <SheetTitle>Vista previa</SheetTitle>
            <SheetDescription>{Number(draft.widthMm)} × {Number(draft.heightMm)} mm · {template?.name ?? ''}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><LabelLivePreview {...previewProps} hideTitle /></div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(confirmReprint)}
        onOpenChange={(v) => { if (!v) setConfirmReprint(null) }}
        title="Reimprimir etiquetas"
        description={`${reprinted.length === 1 ? 'Un activo ya tiene' : `${reprinted.length} activos ya tienen`} etiqueta impresa. La reimpresión queda registrada en su historial.`}
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

export default function InventoryLabelsScreen() {
  const { activeCompanyId, activeCompany } = useActiveCompany()
  return <LabelStudio key={activeCompanyId ?? 'none'} companyId={activeCompanyId} companyName={activeCompany?.name ?? ''} />
}
