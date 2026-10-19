import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Camera, ChevronDown, Lock, Maximize, Volume2, VolumeX } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, PageHeader, PeekSheet, Switch, cn } from '@runly/ui'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { requestWakeLock, toggleFullscreen, fullscreenSupported } from '../../runly.attendance/kiosk/lib/feedback.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { useScanKiosk } from '../hooks/useScanKiosk.js'
import { ADMIN_ACTIONS, ADMIN_STATUS_BY_VALUE } from '../lib/admin-status.js'
import { buildLabelsPath, MAX_QUEUE_ITEMS } from '../lib/label-queue.js'
import { buildNewCustodyPath } from '../lib/custody-links.js'
import { createBrowserEnv } from '../lib/label-transports.js'
import { CAMERA_STATUS_LABEL, PREF_KEYS, announceResult, readFlag, writeFlag } from '../lib/scan-kiosk.js'
import { buildCsv, exportFilename, sessionCounts, toExportTable } from '../lib/scan-session.js'
import { ScanCamera } from '../components/scan/ScanCamera.jsx'
import { ScanResultCard } from '../components/scan/ScanResultCard.jsx'
import { ScanResultCompact } from '../components/scan/ScanResultCompact.jsx'
import { ScanSessionPanel } from '../components/scan/ScanSessionList.jsx'
import { ScanSearchField } from '../components/scan/ScanSearchField.jsx'
import { MOBILE_BAR_HEIGHT, ScanActionBar } from '../components/scan/ScanActionBar.jsx'
import { plural } from '../components/labels/studio-ui.jsx'
import { InventoryAdminTransitionDialog } from '../components/InventoryAdminTransitionDialog.jsx'

const ITEM_PATH = '/app/m/runly.inventory/inventory'
const statusLabel = (value) => ADMIN_STATUS_BY_VALUE[value]?.label ?? value ?? ''
const SAFE_BOTTOM = 'var(--sab)'
const PEEK = 64
const CARD_AUTO_HIDE_MS = 6000
const isEditable = (el) => Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))

function useMedia(query) {
  const [match, setMatch] = useState(() => Boolean(globalThis.matchMedia?.(query).matches))
  useEffect(() => {
    const list = globalThis.matchMedia?.(query)
    if (!list) return undefined
    const onChange = () => setMatch(list.matches)
    list.addEventListener?.('change', onChange)
    return () => list.removeEventListener?.('change', onChange)
  }, [query])
  return match
}

function usePref(key, fallback) {
  const [value, setValue] = useState(() => readFlag(key, fallback))
  useEffect(() => { writeFlag(key, value) }, [key, value])
  return [value, setValue]
}

function ScanKiosk({ companyId }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const canPrint = can('inventory.label.print')
  // Desktop keeps the code field focused for USB/Bluetooth scanners; a phone would pop its keyboard.
  const [finePointer] = useState(() => Boolean(globalThis.matchMedia?.('(pointer: fine)').matches))
  const wide = useMedia('(min-width: 640px)')
  // Phone in landscape: drop the header description so the camera stays near the top.
  const short = useMedia('(max-height: 500px)')
  const [cameraOn, setCameraOn] = usePref(PREF_KEYS.camera, true)
  const [muted, setMuted] = usePref(PREF_KEYS.muted, false)
  const [autoAdd, setAutoAdd] = usePref(PREF_KEYS.autoAdd, true)
  const [paused, setPaused] = useState(false)
  const [camStatus, setCamStatus] = useState('starting')
  const kiosk = useScanKiosk({ companyId, autoAdd, muted })
  const { rows, dispatch, last, highlightKey } = kiosk

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cardDismissed, setCardDismissed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [adminAction, setAdminAction] = useState(null)
  const [exporting, setExporting] = useState(false)
  const searchRef = useRef(null)

  const [searchFocused, setSearchFocused] = useState(false)
  // Phone floating card: a plain hit fades after a few seconds (the list row
  // stays highlighted); results that need a decision stay until closed.
  useEffect(() => {
    setCardDismissed(false)
    if (last?.state !== 'added' && last?.state !== 'duplicate') return undefined
    const timer = setTimeout(() => setCardDismissed(true), CARD_AUTO_HIDE_MS)
    return () => clearTimeout(timer)
  }, [last])
  // Keep the screen awake while the camera is reading.
  useEffect(() => {
    if (!cameraOn || paused) return undefined
    let lock = null
    requestWakeLock().then((l) => { lock = l })
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [cameraOn, paused])
  // A keyboard-wedge scanner types into whatever has focus: printable keys
  // typed while nothing editable (and no dialog or menu) is focused go to the
  // code field. Physical keys only, so a phone's soft keyboard never pops up.
  useEffect(() => {
    const onKey = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.key === ' ') return
      if (isEditable(document.activeElement)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      searchRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const focusSearch = useCallback((text) => {
    if (typeof text === 'string') setSearch(text)
    setSheetOpen(false)
    const input = searchRef.current
    input?.scrollIntoView?.({ block: 'center' })
    input?.focus()
  }, [])

  // ── Bulk actions over matched rows ──────────────────────────────────────
  const matchedItems = useMemo(() => rows.filter((r) => r.item).map((r) => r.item), [rows])
  const counts = sessionCounts(rows)
  const adminActions = useMemo(() => Object.entries(ADMIN_ACTIONS)
    .filter(([, a]) => can(a.permission) && matchedItems.length && matchedItems.every((item) => item.adminStatus === a.from))
    .map(([key, a]) => ({ key, label: a.label })), [can, matchedItems])
  const capped = (items) => {
    if (items.length > MAX_QUEUE_ITEMS) toast.info(`Se tomaron los primeros ${MAX_QUEUE_ITEMS} equipos.`)
    return items.slice(0, MAX_QUEUE_ITEMS)
  }
  const printItems = (items) => navigate(buildLabelsPath({ itemIds: items.map((i) => i.id) }), { state: { labelItems: items } })

  async function refreshItems(ids) {
    const codes = rows.filter((r) => r.item && ids.includes(r.item.id)).map((r) => r.code)
    const items = {}
    try {
      for (let i = 0; i < codes.length; i += 50) {
        for (const res of await kiosk.api.resolve(codes.slice(i, i + 50))) if (res.item) items[res.item.id] = res.item
      }
      dispatch({ type: 'refresh', items })
    } catch { /* the list keeps the previous status; the next read refreshes it */ }
  }

  async function exportList(format) {
    if (!rows.length) return
    const table = toExportTable(rows, { statusLabel })
    const env = createBrowserEnv()
    try {
      setExporting(true)
      if (format === 'csv') env.download(new Blob([buildCsv(table)], { type: 'text/csv;charset=utf-8' }), exportFilename('csv'))
      else env.download(await kiosk.api.exportXlsx(table), exportFilename('xlsx'))
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo exportar la lista')
    } finally {
      setExporting(false)
    }
  }

  function removeRow(row) {
    const index = rows.findIndex((r) => r.key === row.key)
    dispatch({ type: 'remove', key: row.key })
    toast('Quitado de la lista', {
      description: row.item?.name ?? row.code,
      action: { label: 'Deshacer', onClick: () => dispatch({ type: 'restore', row, index }) },
    })
  }

  const actions = {
    canPrint,
    canCustody: can('inventory.custody.manage'),
    adminActions,
    hasMatched: matchedItems.length > 0,
    hasRows: rows.length > 0,
    exporting,
    onPrint: () => printItems(capped(matchedItems)),
    onCustody: () => navigate(buildNewCustodyPath({ kind: 'DELIVERY', itemIds: capped(matchedItems).map((i) => i.id) })),
    onAdmin: (key) => setAdminAction(key),
    onExport: exportList,
    onClear: () => setConfirmClear(true),
  }
  const openItem = (item) => navigate(`${ITEM_PATH}/${item.id}`)
  const cardProps = {
    result: last,
    canPrint,
    onAdd: last && !last.added ? kiosk.addLast : null,
    onOpen: openItem,
    onPrint: (item) => printItems([item]),
    onSearch: focusSearch,
    onRetry: kiosk.enqueue,
  }
  const panelProps = {
    rows, counts, filter, onFilter: setFilter, highlightKey, onRemove: removeRow, onOpen: openItem, onClear: () => setConfirmClear(true),
  }
  const floatingCard = Boolean(last) && !cardDismissed && !sheetOpen && !searchFocused
  const muteToggle = (
    <Button type="button" size="icon" variant="ghost" className="size-11" aria-pressed={muted} aria-label={muted ? 'Activar sonido' : 'Silenciar'} title={muted ? 'Activar sonido' : 'Silenciar'}
      onClick={() => setMuted((v) => !v)}>
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </Button>
  )

  return (
    <div className={cn('min-h-dvh p-4 md:p-6 lg:pb-0', floatingCard ? 'pb-72 [@media(max-height:560px)]:pb-40' : 'pb-40')}>
      <div className="space-y-4 lg:pb-4">
        <PageHeader
          eyebrow="Runly Inventario"
          title="Escanear"
          description={short ? undefined : 'Lee etiquetas QR o códigos de barras, o busca equipos, para armar una lista y actuar sobre ella.'}
          onBack={() => navigate(ITEM_PATH)}
          backLabel="Inventario"
          actions={fullscreenSupported() && wide ? (
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={toggleFullscreen}><Maximize className="mr-1.5 h-4 w-4" />Pantalla completa</Button>
          ) : null}
        />

        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announceResult(last)}</p>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <div className="min-w-0 space-y-4 lg:[@media(min-height:820px)]:sticky lg:[@media(min-height:820px)]:top-4">
            <section aria-label="Cámara" className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <div className="flex min-h-12 items-center gap-2 px-4 py-1.5">
                <Camera className="size-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Cámara</h2>
                <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">{cameraOn ? CAMERA_STATUS_LABEL[camStatus] : 'Oculta y apagada'}</span>
                <Button type="button" variant="ghost" className="ml-auto h-10 shrink-0 px-3" aria-expanded={cameraOn} onClick={() => { setCameraOn((v) => !v); setPaused(false) }}>
                  {cameraOn ? 'Ocultar' : 'Mostrar'}
                  <ChevronDown className={cn('ml-1.5 size-4 transition-transform motion-reduce:transition-none', cameraOn && 'rotate-180')} aria-hidden="true" />
                </Button>
              </div>
              {cameraOn ? (
                <ScanCamera
                  className="aspect-4/3 max-h-[45dvh] w-full rounded-none lg:max-h-[36dvh]"
                  paused={paused} onPausedChange={setPaused} onRead={kiosk.enqueue}
                  tone={kiosk.banner?.tone ?? null} feedback={kiosk.banner}
                  muted={muted} onMutedChange={setMuted} onStatusChange={setCamStatus} onManual={() => focusSearch()}
                />
              ) : null}
            </section>

            <section aria-label="Búsqueda" className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 pb-4 pt-2">
              <ScanSearchField ref={searchRef} value={search} onChange={setSearch} onResolve={kiosk.enqueue} onPick={kiosk.pick}
                autoFocus={finePointer} blurAfterSubmit={!finePointer} onFocusChange={setSearchFocused}
                labelAction={(
                  <div className="flex items-center gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                      <Switch checked={autoAdd} onCheckedChange={setAutoAdd} />Agregar automáticamente
                    </label>
                    {!cameraOn ? muteToggle : null}
                  </div>
                )} />
            </section>

            <div className="hidden lg:block"><ScanResultCard {...cardProps} /></div>
          </div>

          <section aria-label="Lista de escaneo" className="hidden min-w-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] lg:block">
            <ScanSessionPanel {...panelProps} />
          </section>
        </div>
      </div>

      <ScanActionBar actions={actions} counts={counts} />

      {floatingCard ? (
        <div className="fixed inset-x-3 z-30 lg:hidden [@media(max-height:560px)]:hidden"
          style={{ bottom: `calc(${MOBILE_BAR_HEIGHT} + ${SAFE_BOTTOM} + ${PEEK + 8}px)` }}>
          <ScanResultCompact {...cardProps} onDismiss={() => setCardDismissed(true)} />
        </div>
      ) : null}

      <PeekSheet
        className="lg:hidden"
        label="Lista de escaneo"
        expanded={sheetOpen}
        onExpandedChange={setSheetOpen}
        bottom={`calc(${MOBILE_BAR_HEIGHT} + ${SAFE_BOTTOM})`}
        maxHeight={`calc(100dvh - ${MOBILE_BAR_HEIGHT} - ${SAFE_BOTTOM} - 3rem)`}
        peekHeight={PEEK}
        handle={(
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="min-w-8 rounded-md bg-(--brand-soft) px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums text-(--brand-primary)">{counts.total}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Lista de escaneo</span>
              <span className="block truncate text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
                {counts.total ? `${plural(counts.matched, 'encontrado', 'encontrados')}${counts.unmatched ? ` · ${plural(counts.unmatched, 'no encontrado', 'no encontrados')}` : ''}` : 'Vacía'}
              </span>
            </span>
          </span>
        )}
      >
        <ScanSessionPanel {...panelProps} showTitle={false} />
      </PeekSheet>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vaciar lista"
        description="Se quitan todos los códigos escaneados en esta sesión. Los equipos no cambian."
        detail={plural(counts.total, 'código', 'códigos')}
        confirmLabel="Vaciar"
        onConfirm={() => { kiosk.reset(); setFilter('all'); setConfirmClear(false) }}
      />
      <InventoryAdminTransitionDialog
        action={adminAction}
        ids={adminAction ? matchedItems.map((i) => i.id) : null}
        open={Boolean(adminAction)}
        onOpenChange={(open) => { if (!open) setAdminAction(null) }}
        onDone={() => refreshItems(matchedItems.map((i) => i.id))}
      />
    </div>
  )
}

export default function InventoryScanScreen() {
  const can = useInventoryCan()
  const { activeCompanyId } = useActiveCompany()
  if (!can('inventory.item.read')) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState icon={Lock} title="Sin acceso a inventario" description="Pide a un administrador el permiso Ver items del inventario." />
      </div>
    )
  }
  // Keyed by company: each company keeps its own session list.
  return <ScanKiosk key={activeCompanyId ?? 'none'} companyId={activeCompanyId} />
}
