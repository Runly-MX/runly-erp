import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, FileUploader, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, ToolButton, cn, useIsMobile, useViewMode } from '@runly/ui'
import { AlertTriangle, MousePointer2, PanelLeftClose } from 'lucide-react'
import { createStudioEditor } from '../lib/fabric-adapter.js'
import { StudioInspector } from './StudioInspector.jsx'
import { useStudioViewport } from '../hooks/useStudioViewport.js'
import { StudioTopBar } from './editor/StudioTopBar.jsx'
import { RAIL_ITEMS, StudioRail } from './editor/StudioRail.jsx'
import { ElementsPanel, TextPanel } from './editor/InsertPanels.jsx'
import { LayersPanel } from './editor/LayersPanel.jsx'
import { PageSettingsForm } from './editor/PageSettingsForm.jsx'
import { SelectionBar } from './editor/SelectionBar.jsx'
import { ZoomPill } from './editor/ZoomPill.jsx'

const DOTS = { backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)', backgroundSize: '20px 20px' }

function MobileSheet({ open, onOpenChange, title, children }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[78dvh] flex-col gap-0 p-0">
        <SheetHeader className="shrink-0 px-4 pb-2 pt-1"><SheetTitle className="text-base">{title}</SheetTitle></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,var(--sab))]">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function StudioWorkspace({ initial, resolveImage, uploadImage, onChange, editorRef, onReady, readOnly = false,
  participants = [], onPointer, onSelectionChange, resourcePanel, sharedClipboard, authorizePaste, chrome }) {
  const canvasRef = useRef(null)
  const phone = useIsMobile(), wide = !useIsMobile(1280), viewMode = useViewMode()
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [confirm, setConfirm] = useState(false)
  const [page, setPage] = useState(initial.page), [selectedIds, setSelectedIds] = useState([])
  const [panel, setPanel] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'elements' : null))
  const [inspectorOpen, setInspectorOpen] = useState(true), [inspectorSheet, setInspectorSheet] = useState(false)
  const pageRef = useRef(initial.page)
  const view = useStudioViewport(page, editorRef), zoom = view.zoom
  const [history, setHistory] = useState({ canUndo: false, canRedo: false }), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const changed = useCallback(document => { setObjects(document.objects); setPage(document.page); pageRef.current = document.page; onChange(document) }, [onChange])
  const callbacksRef = useRef({ resolveImage, changed, onPointer, onSelectionChange, authorizePaste }), modeRef = useRef(readOnly)
  useEffect(() => { callbacksRef.current = { resolveImage, changed, onPointer, onSelectionChange, authorizePaste } }, [resolveImage, changed, onPointer, onSelectionChange, authorizePaste])
  useEffect(() => { modeRef.current = readOnly; editorRef.current?.setReadOnly(readOnly) }, [readOnly, editorRef])
  // Fabric disposes asynchronously; a remount (retry, server reload, HMR) must
  // wait for the previous instance to release the same <canvas> element.
  const released = useRef(Promise.resolve())
  useEffect(() => {
    let cancelled = false
    const creation = released.current.then(() => cancelled ? null : createStudioEditor(canvasRef.current, { document: initial, resolveImage: id => callbacksRef.current.resolveImage(id),
      sharedClipboard, authorizePaste: objects => callbacksRef.current.authorizePaste?.(objects),
      readOnly: modeRef.current, onPointer: point => callbacksRef.current.onPointer?.(point && point.x >= 0 && point.y >= 0 && point.x <= pageRef.current.width && point.y <= pageRef.current.height ? point : null),
      onChange: document => callbacksRef.current.changed(document), onSelection: (selection, ids) => { setSelection(selection); setSelectedIds(ids); callbacksRef.current.onSelectionChange?.(selection?.id ?? null) }, onError: setError, onHistory: setHistory }))
    creation.then(instance => {
      if (!instance || cancelled) return
      instance.setReadOnly(modeRef.current); editorRef.current = instance; setReady(true); onReady?.(true)
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => {
      cancelled = true; editorRef.current = null; onReady?.(false)
      setReady(false); setSelection(null); setSelectedIds([])
      released.current = creation.then(instance => instance?.destroy()).catch(() => {})
    }
  }, [initial, editorRef, retry, onReady, sharedClipboard])
  // Fit the page once the editor and the viewport exist; the hook keeps fitting on resize until the user zooms.
  useEffect(() => { if (ready) requestAnimationFrame(view.fit) }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  async function attempt(action) {
    try { setBusy(true); setError(''); await action() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  const blocked = readOnly || !ready || busy
  const hasSelection = Boolean(selection) || selectedIds.length > 1
  function add(type, extra) {
    attempt(() => editorRef.current.add(type, extra))
    if (phone) setPanel(null)
  }
  function shortcut(event) {
    if (!ready || busy || event.target.closest('input,textarea,[contenteditable=true]') || editorRef.current?.isEditingText()) return
    if (event.key === 'Escape' && viewMode.isImmersive) { viewMode.stepBack(); return }
    if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection && !readOnly) { event.preventDefault(); setConfirm(true); return }
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const action = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : ({ y: 'redo', c: 'copy', v: 'paste', d: 'duplicate' })[key]
    if (!action) return
    if (readOnly && action !== 'copy') return
    event.preventDefault(); event.stopPropagation(); attempt(() => editorRef.current[action]())
  }
  const upload = async file => {
    const image = await uploadImage(file)
    await editorRef.current.add('image', { fileAssetId: image.id, width: image.width, height: image.height })
    if (phone) setPanel(null)
    return null
  }
  const uploader = <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={blocked} emptyLabel="Subir imagen" hint="PNG, JPG o WebP. Se conserva el original." onUpload={upload} />
  const panels = {
    elements: <ElementsPanel disabled={blocked} onAdd={add} />,
    text: <TextPanel disabled={blocked} onAdd={add} />,
    images: resourcePanel ? resourcePanel({ disabled: blocked, uploader }) : uploader,
    layers: <LayersPanel objects={objects} selectedIds={selectedIds} disabled={!ready || busy}
      onSelect={id => editorRef.current?.select(id)} onToggleMany={ids => editorRef.current?.selectMany(ids)}
      onPatchObject={(id, patch) => attempt(async () => { editorRef.current.select(id); editorRef.current.patch(patch) })} />,
    page: <PageSettingsForm key={`${page.width}x${page.height}:${page.background}`} page={page} disabled={readOnly || !ready} onApply={(next, scale) => editorRef.current.resize(next, scale)} />,
  }
  const panelLabel = RAIL_ITEMS.find(item => item.key === panel)?.label
  const inspector = <StudioInspector selection={selection} selectedCount={selectedIds.length} page={page} busy={busy || !ready} readOnly={readOnly} canPaste={history.canPaste}
    onPatch={patch => attempt(() => editorRef.current.patch(patch))} onRemove={() => setConfirm(true)}
    onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))}
    onAlign={(direction, target) => attempt(() => editorRef.current.align(direction, target))} onOpenPage={() => { setPanel('page'); setInspectorSheet(false) }} />
  return (
    <div role="application" aria-label="Editor gráfico de Studio" tabIndex={-1} onKeyDown={shortcut}
      className={cn('flex min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))] outline-none', viewMode.isImmersive ? 'fixed inset-0 z-50 h-dvh' : 'h-full')}>
      <StudioTopBar phone={phone} {...chrome} canEdit={!readOnly} history={history} participants={[...new Map(participants.map(user => [user.userId, user])).values()]}
        onUndo={() => attempt(() => editorRef.current.undo())} onRedo={() => attempt(() => editorRef.current.redo())}
        exportDisabled={!ready || chrome.exportDisabled} inspectorToggle inspectorOpen={wide ? inspectorOpen : inspectorSheet}
        onToggleInspector={() => (wide ? setInspectorOpen(value => !value) : setInspectorSheet(value => !value))}
        viewMode={viewMode.mode} onCycleViewMode={viewMode.cycle} />
      <div className="flex min-h-0 flex-1">
        {!phone ? <StudioRail value={panel} onChange={setPanel} /> : null}
        {!phone && panel ? (
          <aside aria-label={panelLabel} className="flex w-[300px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] xl:w-[320px]">
            <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-1.5">
              <h2 className="text-sm font-semibold">{panelLabel}</h2>
              <ToolButton label="Cerrar panel" side="right" onClick={() => setPanel(null)}><PanelLeftClose /></ToolButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{panels[panel]}</div>
          </aside>
        ) : null}
        <section aria-label="Área de diseño" className="relative min-w-0 flex-1 overflow-hidden bg-[hsl(var(--muted)/0.45)]">
          <div ref={view.viewport} {...view.gestures} aria-label="Lienzo" className="absolute inset-0 overflow-auto overscroll-contain"
            style={{ ...DOTS, touchAction: view.hand ? 'none' : 'auto', cursor: view.hand ? 'grab' : undefined }}>
            <div style={{ position: 'relative', width: Math.max(view.size.width, page.width * zoom + 96), height: Math.max(view.size.height, page.height * zoom + 96) }}>
              <div ref={view.paper} className="shadow-[0_12px_48px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5"
                style={{ position: 'absolute', left: Math.max(48, (view.size.width - page.width * zoom) / 2), top: Math.max(48, (view.size.height - page.height * zoom) / 2), transform: `scale(${zoom})`, transformOrigin: 'top left', width: page.width, height: page.height }}>
                <canvas ref={canvasRef} aria-label="Lienzo editable de Studio" />
                {participants.map(user => <div key={`${user.userId}:${user.sessionId}`} className="pointer-events-none absolute inset-0">
                  {objects.filter(object => object.id === user.selectedId).map(object => <span key={object.id} aria-label={`Selección de ${user.name}`}
                    className="absolute rounded-[2px] border-fuchsia-500" style={{ left: object.x, top: object.y, width: object.width * (object.scaleX ?? 1), height: object.height * (object.scaleY ?? 1), borderWidth: 2 / zoom, transform: `rotate(${object.rotation}deg)`, transformOrigin: 'top left' }} />)}
                  {Number.isFinite(user.x) && Number.isFinite(user.y) ? <span aria-label={`Cursor de ${user.name}`} data-document-x={user.x} data-document-y={user.y}
                    className="absolute flex items-start gap-0.5" style={{ left: user.x, top: user.y, transform: `scale(${1 / zoom})`, transformOrigin: 'top left' }}>
                    <MousePointer2 className="h-4 w-4 fill-fuchsia-500 text-white" aria-hidden />
                    <span className="mt-3 whitespace-nowrap rounded-full bg-fuchsia-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow">{user.name}</span>
                  </span> : null}
                </div>)}
              </div>
            </div>
          </div>
          {!ready && !error ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Skeleton className="aspect-square w-2/5 max-w-sm" /></div> : null}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-2 pt-2 sm:px-4 sm:pt-3">
            {hasSelection && !readOnly && ready ? (
              <SelectionBar selection={selection} selectedCount={selectedIds.length} disabled={blocked}
                onPatch={patch => attempt(() => editorRef.current.patch(patch))} onAction={action => attempt(() => editorRef.current[action]())}
                onOrder={direction => attempt(() => editorRef.current.order(direction))} onRemove={() => setConfirm(true)}
                onProperties={wide && inspectorOpen ? null : () => (wide ? setInspectorOpen(true) : setInspectorSheet(true))} />
            ) : null}
            {chrome.notices}
            {error ? (
              <Alert variant="destructive" className="pointer-events-auto max-w-lg shadow-lg">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>No se pudo completar la operación</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">{error}
                  {!ready ? <Button size="sm" variant="outline" onClick={() => { setError(''); setRetry(value => value + 1) }}>Reintentar</Button>
                    : <Button size="sm" variant="ghost" onClick={() => setError('')}>Cerrar</Button>}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className={cn('pointer-events-none absolute z-20', phone ? 'bottom-2 right-2' : 'bottom-4 right-4')}>
            <ZoomPill compact={phone} zoom={zoom} onZoom={view.changeZoom} onFit={view.fit} hand={view.hand} onHand={view.setHand} />
          </div>
          <p className="pointer-events-none absolute bottom-5 left-4 z-10 hidden text-xs tabular-nums text-[hsl(var(--muted-foreground))] md:block">{page.width} × {page.height} px</p>
        </section>
        {wide && inspectorOpen ? (
          <aside aria-label="Propiedades" className="w-[300px] shrink-0 overflow-y-auto overscroll-contain border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] xl:w-[320px]">{inspector}</aside>
        ) : null}
      </div>
      {phone ? <StudioRail orientation="horizontal" value={panel} onChange={setPanel} /> : null}
      {phone ? <MobileSheet open={Boolean(panel)} onOpenChange={open => { if (!open) setPanel(null) }} title={panelLabel ?? ''}>{panel ? panels[panel] : null}</MobileSheet> : null}
      {!wide ? (
        <Sheet open={inspectorSheet} onOpenChange={setInspectorSheet}>
          <SheetContent side="right" className="flex w-[340px] max-w-full flex-col gap-0 p-0 max-md:max-h-[78dvh]">
            <SheetHeader className="shrink-0 px-4 pb-1 pt-1"><SheetTitle className="text-base">Propiedades</SheetTitle></SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,var(--sab))]">{inspector}</div>
          </SheetContent>
        </Sheet>
      ) : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar selección" description="Se eliminarán los elementos seleccionados del diseño. Puedes deshacerlo con Ctrl+Z."
        confirmLabel="Eliminar" onConfirm={() => attempt(() => { editorRef.current.remove(); setConfirm(false) })} />
    </div>
  )
}
