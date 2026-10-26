import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, FileUploader, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, ToolButton, cn, useIsMobile, useViewMode } from '@runly/ui'
import { AlertTriangle, MousePointer2, PanelLeftClose } from 'lucide-react'
import { toast } from 'sonner'
import { createStudioEditor } from '../lib/fabric-adapter.js'
import { StudioInspector } from './StudioInspector.jsx'
import { useStudioViewport } from '../hooks/useStudioViewport.js'
import { StudioTopBar } from './editor/StudioTopBar.jsx'
import { RAIL_ITEMS, StudioRail } from './editor/StudioRail.jsx'
import { TextPanel } from './editor/InsertPanels.jsx'
import { ElementsLibrary } from './editor/elements/ElementsLibrary.jsx'
import { LayersPanel } from './editor/LayersPanel.jsx'
import { PageSettingsForm } from './editor/PageSettingsForm.jsx'
import { SelectionBar } from './editor/SelectionBar.jsx'
import { ZoomPill } from './editor/ZoomPill.jsx'
import { FadeSwap, SidePanel } from './editor/SidePanel.jsx'
import { StudioContextMenu } from './editor/StudioContextMenu.jsx'
import { useImageTools } from './editor/image/useImageTools.js'
import { ImagePanel } from './editor/image/ImagePanel.jsx'
import { FramingOverlay } from './editor/image/FramingOverlay.jsx'
import { FramingBar } from './editor/image/FramingBar.jsx'
import { PendingPhotoBanner } from './editor/image/PendingPhotoBanner.jsx'
import { BackgroundRemovalDialog } from './editor/image/BackgroundRemovalDialog.jsx'

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
  participants = [], onPointer, onSelectionChange, resourcePanel, sharedClipboard, authorizePaste, onEditImage, catalog, chrome }) {
  const canvasRef = useRef(null)
  const phone = useIsMobile(), wide = !useIsMobile(1280), viewMode = useViewMode()
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [confirm, setConfirm] = useState(false)
  const [page, setPage] = useState(initial.page), [selectedIds, setSelectedIds] = useState([])
  const [panel, setPanel] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'elements' : null))
  const [inspectorOpen, setInspectorOpen] = useState(true), [inspectorSheet, setInspectorSheet] = useState(false)
  // Last opened panel keeps rendering while the side panel animates closed.
  const [shownPanel, setShownPanel] = useState(panel)
  if (panel && panel !== shownPanel) setShownPanel(panel)
  const pageRef = useRef(initial.page)
  const view = useStudioViewport(page, editorRef), zoom = view.zoom
  const [history, setHistory] = useState({ canUndo: false, canRedo: false }), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const changed = useCallback(document => { setObjects(document.objects); setPage(document.page); pageRef.current = document.page; onChange(document) }, [onChange])
  const callbacksRef = useRef({ resolveImage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage }), modeRef = useRef(readOnly)
  useEffect(() => { callbacksRef.current = { resolveImage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage } }, [resolveImage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage])
  useEffect(() => { modeRef.current = readOnly; editorRef.current?.setReadOnly(readOnly) }, [readOnly, editorRef])
  // Fabric disposes asynchronously; a remount (retry, server reload, HMR) must
  // wait for the previous instance to release the same <canvas> element.
  const released = useRef(Promise.resolve())
  useEffect(() => {
    let cancelled = false
    const creation = released.current.then(() => cancelled ? null : createStudioEditor(canvasRef.current, { document: initial, resolveImage: id => callbacksRef.current.resolveImage(id),
      sharedClipboard, authorizePaste: objects => callbacksRef.current.authorizePaste?.(objects),
      onEditImage: id => callbacksRef.current.onEditImage?.(id),
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
  // Group state of the selection: one shared groupId → can ungroup; 2+ free editable items → can group.
  const selectedObjects = objects.filter(object => selectedIds.includes(object.id))
  const sharedGroup = selectedObjects.length > 0 && selectedObjects.every(object => object.groupId && object.groupId === selectedObjects[0].groupId)
  const grouping = { canUngroup: sharedGroup, canGroup: selectedObjects.length > 1 && !sharedGroup && selectedObjects.every(object => !object.groupId && !object.locked && !object.hidden) }
  function add(type, extra) {
    attempt(() => editorRef.current.add(type, extra))
    if (phone) setPanel(null)
  }
  // New library elements land centred on the page.
  const centered = props => ({ ...props, x: Math.round((page.width - props.width) / 2), y: Math.round((page.height - props.height) / 2) })
  // Combined block: its parts are added, then grouped, as one undo step.
  async function addBlock(block, accent) {
    const editor = editorRef.current, origin = centered({ width: block.width, height: block.height }), parts = block.parts(accent)
    await editor.beginInteraction()
    try {
      for (const part of parts) await editor.add(part.type, { ...part.props, x: origin.x + part.props.x, y: origin.y + part.props.y })
      editor.selectMany(editor.snapshot().objects.slice(-parts.length).map(object => object.id))
      editor.group()
      await editor.endInteraction(true)
    } catch (error) { await editor.endInteraction(false); throw error }
  }
  function shortcut(event) {
    if (!ready || busy || event.target.closest('input,textarea,[contenteditable=true]') || editorRef.current?.isEditingText()) return
    if (event.key === 'Escape' && viewMode.isImmersive) { viewMode.stepBack(); return }
    if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection && !readOnly) { event.preventDefault(); setConfirm(true); return }
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 'a') { event.preventDefault(); editorRef.current.selectAll(); return }
    if (key === 'g' && !readOnly) {
      event.preventDefault()
      if (event.shiftKey ? grouping.canUngroup : grouping.canGroup) attempt(() => editorRef.current[event.shiftKey ? 'ungroup' : 'group']())
      return
    }
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
  // Photo tools: contextual "image" panel (not a rail item), framing mode, frames.
  const [imageTab, setImageTab] = useState('filters')
  const openImagePanel = (tab, key = 'image') => { if (tab) setImageTab(tab); setPanel(key) }
  const imageKit = useImageTools({ editorRef, selection, objects, resolveImage, readOnly, onError: setError, openPanel: openImagePanel,
    ensureSaved: chrome.saveState === 'saved' ? null : () => chrome.onSave() })
  const uploader = <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={blocked} emptyLabel="Subir imagen" hint="PNG, JPG o WebP. Se conserva el original." onUpload={upload} />
  const panels = {
    elements: <ElementsLibrary disabled={blocked} onFrame={imageKit.tools.frame} loadThumbnail={catalog?.thumbnail}
      onAddPrimitive={(type, props) => add(type, centered(props))} onAddLine={props => add('line', centered(props))}
      onAddFigure={(id, fill) => attempt(async () => {
        const object = await catalog.importIcon(id), ratio = object.height && object.width ? object.height / object.width : 1
        await editorRef.current.add('vector', centered({ ...object, width: 240, height: Math.round(240 * ratio), fill }))
        if (phone) setPanel(null)
      })}
      onAddBlock={(block, accent) => attempt(async () => { await addBlock(block, accent); if (phone) setPanel(null) })}
      onImportSvg={file => attempt(async () => {
      if (file.size > 512 * 1024) throw new Error('El SVG supera 512 KB.')
      const result = await editorRef.current.importSvg(await file.text(), file.name)
      if (result?.warnings?.length) toast.warning('SVG importado con cambios', { description: result.warnings.join(' ') })
      if (phone) setPanel(null)
    })} />,
    image: <ImagePanel selection={selection} imageUrl={imageKit.tools.imageUrl} tab={imageTab} onTab={setImageTab} disabled={readOnly || !ready} api={imageKit.tools} />,
    text: <TextPanel disabled={blocked} onAdd={add} />,
    images: resourcePanel ? resourcePanel({ disabled: blocked, uploader }) : uploader,
    layers: <LayersPanel objects={objects} selectedIds={selectedIds} disabled={!ready || busy}
      onSelect={id => editorRef.current?.select(id)} onSelectGroup={id => editorRef.current?.selectGroup(id)} onToggleMany={ids => editorRef.current?.selectMany(ids)}
      onPatchObject={(id, patch) => attempt(async () => { editorRef.current.select(id); editorRef.current.patch(patch) })} />,
    page: <PageSettingsForm key={`${page.width}x${page.height}:${page.background}`} page={page} disabled={readOnly || !ready} onApply={(next, scale) => editorRef.current.resize(next, scale)} />,
  }
  const panelLabel = (panel ?? shownPanel) === 'image' ? 'Imagen' : RAIL_ITEMS.find(item => item.key === (panel ?? shownPanel))?.label
  const openProperties = wide && inspectorOpen ? null : () => (wide ? setInspectorOpen(true) : setInspectorSheet(true))
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
        {!phone ? (
          <SidePanel side="left" open={Boolean(panel)} label={panelLabel}>
            <div className="flex h-12 shrink-0 items-center justify-between pl-4 pr-1.5">
              <h2 className="text-sm font-semibold">{panelLabel}</h2>
              <ToolButton label="Cerrar panel" side="right" onClick={() => setPanel(null)}><PanelLeftClose /></ToolButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {shownPanel ? <FadeSwap contentKey={shownPanel}>{panels[shownPanel]}</FadeSwap> : null}
            </div>
          </SidePanel>
        ) : null}
        <section aria-label="Área de diseño" className="relative min-w-0 flex-1 overflow-hidden bg-[hsl(var(--muted)/0.45)]">
          <StudioContextMenu selection={selection} selectedCount={selectedIds.length} readOnly={readOnly} disabled={!ready || busy} canPaste={history.canPaste}
            onPick={event => { if (ready && !editorRef.current?.isEditingText()) editorRef.current?.pick(event) }}
            onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))}
            onAlign={(direction, target) => attempt(() => editorRef.current.align(direction, target))} onPatch={patch => attempt(() => editorRef.current.patch(patch))}
            onRemove={() => setConfirm(true)} onSelectAll={() => editorRef.current?.selectAll()} onFit={view.fit} onProperties={openProperties}
            onPage={() => setPanel('page')}>
          <div ref={view.viewport} {...view.gestures} aria-label="Lienzo" className="absolute inset-0 overflow-auto overscroll-contain"
            // Double-click a photo: isolate it and move/scale it inside its frame.
            onDoubleClick={() => { if (selection?.type === 'image' && !selection.locked && !readOnly && !imageKit.framing) imageKit.tools.startFraming() }}
            style={{ ...DOTS, touchAction: view.hand ? 'none' : 'auto', cursor: view.hand ? 'grab' : undefined }}>
            <div style={{ position: 'relative', width: Math.max(view.size.width, page.width * zoom + 96), height: Math.max(view.size.height, page.height * zoom + 96) }}>
              <div ref={view.paper} className="shadow-[0_12px_48px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5"
                style={{ position: 'absolute', left: Math.max(48, (view.size.width - page.width * zoom) / 2), top: Math.max(48, (view.size.height - page.height * zoom) / 2), transform: `scale(${zoom})`, transformOrigin: 'top left', width: page.width, height: page.height }}>
                <canvas ref={canvasRef} aria-label="Lienzo editable de Studio" />
                {imageKit.framing ? <FramingOverlay item={imageKit.framing.item} props={imageKit.framing.props} natural={imageKit.framing.natural} imageUrl={imageKit.framing.imageUrl} zoom={zoom}
                  onFrame={next => imageKit.tools.image(next)} onDone={() => imageKit.finishFraming(true)} onCancel={() => imageKit.finishFraming(false)} /> : null}
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
          </StudioContextMenu>
          {!ready && !error ? <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Skeleton className="aspect-square w-2/5 max-w-sm" /></div> : null}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 px-2 pt-2 sm:px-4 sm:pt-3">
            {imageKit.framing ? (
              <FadeSwap contentKey="framing-bar" className="flex max-w-full justify-center">
                <FramingBar props={imageKit.framing.props} disabled={readOnly || !ready} onZoom={zoom => imageKit.tools.image({ zoom })} onFit={fit => imageKit.tools.image({ fit })}
                  onReset={() => imageKit.tools.image({ offsetX: 0, offsetY: 0, zoom: 1 })} onCancel={() => imageKit.finishFraming(false)} onDone={() => imageKit.finishFraming(true)} />
              </FadeSwap>
            ) : null}
            {imageKit.pending ? <PendingPhotoBanner pending={imageKit.pending} onCancel={imageKit.cancelPending} /> : null}
            {hasSelection && !readOnly && ready && !imageKit.framing ? (
              <FadeSwap contentKey="selection-bar" className="flex max-w-full justify-center">
                <SelectionBar selection={selection} selectedCount={selectedIds.length} disabled={blocked} imageTools={imageKit.tools} grouping={grouping}
                  onPatch={patch => attempt(() => editorRef.current.patch(patch))} onAction={action => attempt(() => editorRef.current[action]())}
                  onOrder={direction => attempt(() => editorRef.current.order(direction))} onRemove={() => setConfirm(true)} onProperties={openProperties} />
              </FadeSwap>
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
        {wide ? (
          <SidePanel side="right" open={inspectorOpen} label="Propiedades">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{inspector}</div>
          </SidePanel>
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
      {imageKit.backgroundRemoval ? <BackgroundRemovalDialog {...imageKit.backgroundRemoval} /> : null}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar selección" description="Se eliminarán los elementos seleccionados del diseño. Puedes deshacerlo con Ctrl+Z."
        confirmLabel="Eliminar" onConfirm={() => attempt(() => { editorRef.current.remove(); setConfirm(false) })} />
    </div>
  )
}
