import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Camera, ChevronDown, ChevronUp, Lock, Maximize, Search } from 'lucide-react'
import { Button, ConfirmDialog, EmptyState, Input, PageHeader, Switch, cn } from '@runly/ui'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { beep, haptic, requestWakeLock, toggleFullscreen, fullscreenSupported } from '../../runly.attendance/kiosk/lib/feedback.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { useScanApi } from '../hooks/useInventoryScan.js'
import { ADMIN_ACTIONS, ADMIN_STATUS_BY_VALUE } from '../lib/admin-status.js'
import { buildLabelsPath, MAX_QUEUE_ITEMS } from '../lib/label-queue.js'
import { buildNewCustodyPath } from '../lib/custody-links.js'
import { createBrowserEnv } from '../lib/label-transports.js'
import {
  buildCsv, exportFilename, findRowByCode, loadSession, normalizeScanCode, rowKeyFor, saveSession, sessionCounts, sessionReducer, toExportTable,
} from '../lib/scan-session.js'
import { ScanCamera } from '../components/scan/ScanCamera.jsx'
import { ScanResultCard } from '../components/scan/ScanResultCard.jsx'
import { ScanSessionList } from '../components/scan/ScanSessionList.jsx'
import { ScanSessionActions } from '../components/scan/ScanSessionActions.jsx'
import { InventoryAdminTransitionDialog } from '../components/InventoryAdminTransitionDialog.jsx'

const ITEM_PATH = '/app/m/runly.inventory/inventory'
const CAMERA_PREF_KEY = 'runly.inventory.scan.camera'
const readPref = (key, fallback) => { try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1' } catch { return fallback } }
const writePref = (key, value) => { try { localStorage.setItem(key, value ? '1' : '0') } catch { /* blocked */ } }
const statusLabel = (value) => ADMIN_STATUS_BY_VALUE[value]?.label ?? value ?? ''

function Panel({ children, className }) {
  return <section className={cn('min-w-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:p-4', className)}>{children}</section>
}

function ScanKiosk({ companyId }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const api = useScanApi()
  // Desktop keeps the code field focused for USB/Bluetooth scanners; a phone would pop its keyboard.
  const [finePointer] = useState(() => Boolean(globalThis.matchMedia?.('(pointer: fine)').matches))
  const [rows, dispatch] = useReducer(sessionReducer, companyId, loadSession)
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  useEffect(() => { saveSession(companyId, rows) }, [companyId, rows])

  const [last, setLast] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [flash, setFlash] = useState(null)
  const [autoAdd, setAutoAdd] = useState(true)
  const [sound, setSound] = useState(true)
  const [cameraOn, setCameraOn] = useState(() => readPref(CAMERA_PREF_KEY, true))
  const [manual, setManual] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [adminAction, setAdminAction] = useState(null)
  const [exporting, setExporting] = useState(false)
  const inputRef = useRef(null)
  const chain = useRef(Promise.resolve())
  const flashTimer = useRef(null)
  const autoAddRef = useRef(autoAdd)
  const soundRef = useRef(sound)
  autoAddRef.current = autoAdd
  soundRef.current = sound

  useEffect(() => { writePref(CAMERA_PREF_KEY, cameraOn) }, [cameraOn])
  // Keep the screen awake while the camera kiosk is in use.
  useEffect(() => {
    if (!cameraOn) return undefined
    let lock = null
    requestWakeLock().then((l) => { lock = l })
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [cameraOn])
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const feedback = useCallback((kind) => {
    haptic(kind === 'ok' ? 40 : kind === 'duplicate' ? [30, 40, 30] : [120, 60, 120])
    if (soundRef.current) beep(kind === 'ok' ? 'in' : kind === 'duplicate' ? 'info' : 'error')
    setFlash(kind)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 700)
  }, [])

  const process = useCallback(async (text) => {
    const code = normalizeScanCode(text)
    if (!code) return
    const readAt = new Date().toISOString()
    const known = findRowByCode(rowsRef.current, code)
    if (known) {
      dispatch({ type: 'touch', key: known.key, readAt })
      setHighlightKey(known.key)
      setLast({ code, item: known.item, matchedBy: known.matchedBy, state: known.item ? 'duplicate' : 'missing', added: true })
      feedback(known.item ? 'duplicate' : 'missing')
      return
    }
    setLast({ code, state: 'loading' })
    let result
    try {
      [result] = await api.resolve([code])
    } catch (err) {
      setLast({ code, state: 'error', message: err?.message ?? 'Revisa la conexión e inténtalo de nuevo.' })
      feedback('missing')
      return
    }
    result = { code, item: result?.item ?? null, matchedBy: result?.matchedBy ?? null }
    const key = rowKeyFor(result)
    if (rowsRef.current.some((r) => r.key === key)) {
      dispatch({ type: 'add', result, readAt })
      setHighlightKey(key)
      setLast({ ...result, state: 'duplicate', added: true })
      feedback('duplicate')
      return
    }
    const add = autoAddRef.current
    if (add) {
      dispatch({ type: 'add', result, readAt })
      setHighlightKey(key)
    }
    setLast({ ...result, readAt, state: result.item ? (add ? 'added' : 'pending') : 'missing', added: add })
    feedback(result.item ? 'ok' : 'missing')
  }, [api, feedback])

  // Reads are processed one at a time so a burst keeps its order and duplicates are caught.
  const enqueue = useCallback((text) => {
    chain.current = chain.current.then(() => process(text)).catch(() => {})
  }, [process])

  function addLast() {
    if (!last || last.added) return
    dispatch({ type: 'add', result: last, readAt: last.readAt })
    setHighlightKey(rowKeyFor(last))
    setLast({ ...last, state: last.item ? 'added' : 'missing', added: true })
  }

  function submitManual(event) {
    event.preventDefault()
    if (!normalizeScanCode(manual)) return
    enqueue(manual)
    setManual('')
    inputRef.current?.focus()
  }

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

  async function refreshItems(ids) {
    const codes = rows.filter((r) => r.item && ids.includes(r.item.id)).map((r) => r.code)
    const items = {}
    try {
      for (let i = 0; i < codes.length; i += 50) {
        for (const res of await api.resolve(codes.slice(i, i + 50))) if (res.item) items[res.item.id] = res.item
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
      else env.download(await api.exportXlsx(table), exportFilename('xlsx'))
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo exportar la lista')
    } finally {
      setExporting(false)
    }
  }

  const actions = {
    canPrint: can('inventory.label.print'),
    canCustody: can('inventory.custody.manage'),
    adminActions,
    hasMatched: matchedItems.length > 0,
    hasRows: rows.length > 0,
    exporting,
    onPrint: () => {
      const items = capped(matchedItems)
      navigate(buildLabelsPath({ itemIds: items.map((i) => i.id) }), { state: { labelItems: items } })
    },
    onCustody: () => navigate(buildNewCustodyPath({ kind: 'DELIVERY', itemIds: capped(matchedItems).map((i) => i.id) })),
    onAdmin: (key) => setAdminAction(key),
    onExport: exportList,
    onClear: () => setConfirmClear(true),
  }
  const openItem = (item) => navigate(`${ITEM_PATH}/${item.id}`)

  const summary = (
    <p className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
      {counts.total === 1 ? '1 código' : `${counts.total} códigos`} · {counts.matched} {counts.matched === 1 ? 'encontrado' : 'encontrados'}
      {counts.unmatched ? <span className="text-red-600 dark:text-red-400"> · {counts.unmatched} no {counts.unmatched === 1 ? 'encontrado' : 'encontrados'}</span> : null}
    </p>
  )

  return (
    <div className="min-h-dvh space-y-4 p-4 pb-28 md:p-6 md:pb-28 lg:pb-6">
      <PageHeader
        eyebrow="Runly Inventario"
        title="Escanear"
        description="Lee códigos QR, folios, series o números de activo y arma una lista de equipos."
        onBack={() => navigate(ITEM_PATH)}
        backLabel="Inventario"
        actions={fullscreenSupported() ? (
          <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen}><Maximize className="mr-1.5 h-4 w-4" />Pantalla completa</Button>
        ) : null}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Panel className="space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Camera className="size-4" aria-hidden="true" />Cámara</h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCameraOn((v) => !v)} aria-expanded={cameraOn}>
              {cameraOn ? <><ChevronUp />Ocultar</> : <><ChevronDown />Mostrar</>}
            </Button>
          </div>
          {cameraOn ? <ScanCamera active={cameraOn} onRead={enqueue} flash={flash} className="aspect-[4/3] max-h-[50dvh] w-full lg:aspect-square lg:max-h-none" /> : null}

          <form onSubmit={submitManual} className="flex gap-2">
            <Input
              ref={inputRef}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Folio, serie o n.º de activo"
              aria-label="Código a buscar"
              autoFocus={finePointer}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 rounded-md font-mono placeholder:font-sans"
            />
            <Button type="submit" className="h-11 shrink-0" disabled={!manual.trim()} aria-label="Buscar código"><Search /><span className="hidden sm:inline">Buscar</span></Button>
          </form>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <Switch checked={autoAdd} onCheckedChange={setAutoAdd} aria-label="Agregar automáticamente a la lista" />Agregar automáticamente
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <Switch checked={sound} onCheckedChange={setSound} aria-label="Sonido al leer" />Sonido
            </label>
          </div>

          <ScanResultCard result={last} onAdd={last && !last.added ? addLast : null} onOpen={openItem} />
        </Panel>

        <Panel className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Lista de escaneo</h2>
              {summary}
            </div>
            <div className="hidden lg:block"><ScanSessionActions actions={actions} /></div>
          </div>
          <ScanSessionList rows={rows} highlightKey={highlightKey} onRemove={(key) => dispatch({ type: 'remove', key })} onOpen={openItem} />
        </Panel>
      </div>

      {/* Phone / tablet: counts and actions stay reachable at the bottom */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{counts.matched} {counts.matched === 1 ? 'equipo' : 'equipos'}</p>
          {counts.unmatched ? <p className="text-xs text-red-600 dark:text-red-400">{counts.unmatched} no {counts.unmatched === 1 ? 'encontrado' : 'encontrados'}</p> : null}
        </div>
        <ScanSessionActions actions={actions} compact />
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Vaciar lista"
        description="Se quitan todos los códigos escaneados en esta sesión. Los equipos no cambian."
        detail={`${counts.total} ${counts.total === 1 ? 'código' : 'códigos'}`}
        confirmLabel="Vaciar"
        onConfirm={() => { dispatch({ type: 'clear' }); setLast(null); setHighlightKey(null); setConfirmClear(false) }}
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
