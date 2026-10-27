import { documentPages, findPage, pageId } from '../../../../../shared/studio/pages.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, FileUploader, Sheet, SheetContent, SheetHeader, SheetTitle, Skeleton, ToolButton, cn, useIsMobile, useViewMode } from '@runly/ui'
import { AlertTriangle, PanelLeftClose } from 'lucide-react'
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
import { CanvasColorSampler } from './editor/CanvasColorSampler.jsx'
import { EyedropperContext, nativeEyedropper, rememberColor, toHex } from '../lib/studio-colors.js'
import { StudioContextMenu } from './editor/StudioContextMenu.jsx'
import { useCanvasDrop } from './editor/useCanvasDrop.js'
import { DropFrameHint, DropLandingHint } from './editor/DropFrameHint.jsx'
import { watchTouchDrag } from '../lib/studio-drag.js'
import { useImageTools } from './editor/image/useImageTools.js'
import { ImagePanel } from './editor/image/ImagePanel.jsx'
import { FramingOverlay } from './editor/image/FramingOverlay.jsx'
import { FramingBar } from './editor/image/FramingBar.jsx'
import { PendingPhotoBanner } from './editor/image/PendingPhotoBanner.jsx'
import { BackgroundRemovalDialog } from './editor/image/BackgroundRemovalDialog.jsx'
import { usePaintTools } from './editor/paint/usePaintTools.js'
import { PageBackground } from './editor/paint/PageBackground.jsx'
import { useCanvasPreferences } from './editor/canvas/useCanvasPreferences.js'
import { CanvasPreferencesMenu } from './editor/canvas/CanvasPreferencesMenu.jsx'
import { GridOverlay, GuidesOverlay } from './editor/canvas/CanvasOverlays.jsx'
import { Rulers } from './editor/canvas/Rulers.jsx'
import { canHoldPhoto } from '../lib/photo-target.js'
import { RemotePresence } from './editor/collaboration/RemotePresence.jsx'
import { groupParticipants, selectionsByObject } from '../lib/studio-presence.js'
import { newContentId, pageLabel, pageSignature } from '../lib/studio-pages.js'
import { usePageThumbnails } from '../hooks/usePageThumbnails.js'
import { PagesPanel } from './editor/pages/PagesPanel.jsx'
import { PageNavigator, PageSwitcher } from './editor/pages/PageSwitcher.jsx'

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

export function StudioWorkspace({ initial, resolveImage, authorizePage, uploadImage, onChange, editorRef, onReady, readOnly = false,
  participants = [], selfId = null, onPointer, onSelectionChange, resourcePanel, sharedClipboard, authorizePaste, onEditImage, catalog, chrome }) {
  const canvasRef = useRef(null)
  const phone = useIsMobile(), wide = !useIsMobile(1280), viewMode = useViewMode()
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [confirm, setConfirm] = useState(false)
  const [page, setPage] = useState(initial.page), [selectedIds, setSelectedIds] = useState([])
  const [panel, setPanel] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= 1280 ? 'elements' : null))
  // A touch drag from the phone sheet needs the canvas: the sheet steps aside.
  useEffect(() => watchTouchDrag(active => { if (active && window.matchMedia('(max-width: 767px)').matches) setPanel(null) }), [])
  const [inspectorOpen, setInspectorOpen] = useState(true), [inspectorSheet, setInspectorSheet] = useState(false)
  // Last opened panel keeps rendering while the side panel animates closed.
  const [shownPanel, setShownPanel] = useState(panel)
  if (panel && panel !== shownPanel) setShownPanel(panel)
  const pageRef = useRef(initial.page)
  const view = useStudioViewport(page, editorRef), zoom = view.zoom, fitRef = useRef(view.fit)
  fitRef.current = view.fit
  const [history, setHistory] = useState({ canUndo: false, canRedo: false }), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const [doc, setDoc] = useState(initial), [browsing, setBrowsing] = useState(false), [removing, setRemoving] = useState(null)
  const [activePageId, setActivePageId] = useState(initial.page.id ?? 'page-1')
  const visibleParticipants = useMemo(() => participants.filter(person => (person.pageId ?? 'page-1') === activePageId), [participants, activePageId])
  const canvasPeople = useMemo(() => groupParticipants(visibleParticipants, selfId), [visibleParticipants, selfId])
  const people = useMemo(() => groupParticipants(participants, selfId), [participants, selfId]), remoteSelections = useMemo(() => selectionsByObject(participants, selfId), [participants, selfId])
  const changed = useCallback((document, meta) => { setDoc(document); const scene = findPage(document, editorRef.current?.activePageId()) ?? document; setObjects(scene.objects); setPage(scene.page); pageRef.current = scene.page; onChange(document, meta) }, [onChange, editorRef])
  const canvas = useCanvasPreferences(editorRef, ready)
  const { onGuides, onEditorPreferences } = canvas
  const callbacksRef = useRef({ resolveImage, authorizePage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage, onGuides, onEditorPreferences }), modeRef = useRef(readOnly)
  useEffect(() => { callbacksRef.current = { resolveImage, authorizePage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage, onGuides, onEditorPreferences } },
    [resolveImage, authorizePage, changed, onPointer, onSelectionChange, authorizePaste, onEditImage, onGuides, onEditorPreferences])
  useEffect(() => { modeRef.current = readOnly; editorRef.current?.setReadOnly(readOnly) }, [readOnly, editorRef])
  // Fabric disposes asynchronously; a remount (retry, server reload, HMR) must
  // wait for the previous instance to release the same <canvas> element.
  const released = useRef(Promise.resolve())
  useEffect(() => {
    let cancelled = false
    const creation = released.current.then(() => cancelled ? null : createStudioEditor(canvasRef.current, { document: initial, resolveImage: (...args) => callbacksRef.current.resolveImage(...args),
      authorizePage: callbacksRef.current.authorizePage ? (...args) => callbacksRef.current.authorizePage(...args) : undefined,
      onActivePage: (id, viewport) => { setActivePageId(id); if (viewport) view.restore(viewport); else requestAnimationFrame(() => requestAnimationFrame(() => fitRef.current())) },
      sharedClipboard, authorizePaste: objects => callbacksRef.current.authorizePaste?.(objects),
      onEditImage: id => callbacksRef.current.onEditImage?.(id),
      onGuides: guides => callbacksRef.current.onGuides?.(guides), onEditorPreferences: state => callbacksRef.current.onEditorPreferences?.(state),
      readOnly: modeRef.current, onPointer: point => callbacksRef.current.onPointer?.(point && point.x >= 0 && point.y >= 0 && point.x <= pageRef.current.width && point.y <= pageRef.current.height ? point : null),
      onChange: (document, meta) => callbacksRef.current.changed(document, meta), onSelection: (selection, ids) => { setSelection(selection); setSelectedIds(ids); callbacksRef.current.onSelectionChange?.(selection?.id ?? null) }, onError: setError, onHistory: setHistory }))
    creation.then(instance => {
      if (!instance || cancelled) return
      instance.setReadOnly(modeRef.current); editorRef.current = instance; setReady(true); onReady?.(true)
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => {
      cancelled = true; editorRef.current = null; onReady?.(false)
      setReady(false); setSelection(null); setSelectedIds([])
      released.current = creation.then(instance => instance?.destroy()).catch(() => {})
    }
  }, [initial, editorRef, retry, onReady, sharedClipboard, view.restore])
  // Fit the page once the editor and the viewport exist; the hook keeps fitting on resize until the user zooms.
  useEffect(() => { if (ready) requestAnimationFrame(view.fit) }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps
  async function attempt(action) {
    try { setBusy(true); setError(''); await action() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  const blocked = readOnly || !ready || busy
  // Page browser: metadata from the real document; signatures only while a page view is open.
  const pagesOpen = panel === 'pages' || browsing, signatures = useRef(new WeakMap())
  const pageList = useMemo(() => documentPages(doc).map((scene, index) => {
    let key = ''
    if (pagesOpen) { key = signatures.current.get(scene) ?? pageSignature(scene); signatures.current.set(scene, key) }
    return { ...scene.page, id: pageId(scene), objectCount: scene.objects.length, key, active: pageId(scene) === activePageId, label: pageLabel(scene.page, index) }
  }), [doc, activePageId, pagesOpen])
  const pageCount = pageList.length, activeIndex = Math.max(0, pageList.findIndex(item => item.active))
  const thumbnails = usePageThumbnails(editorRef, pageList, pagesOpen && ready)
  const closeBrowsers = () => { setBrowsing(false); if (phone) setPanel(current => (current === 'pages' ? null : current)) }
  const goToPage = id => attempt(async () => { await editorRef.current.selectPage(id); closeBrowsers() })
  const pageActions = {
    onSelect: goToPage,
    onAdd: () => attempt(async () => {
      const editor = editorRef.current, id = newContentId('p'), current = editor.activeScene().page
      await editor.addPage({ id, width: current.width, height: current.height, background: current.background, afterId: editor.activePageId() })
      await editor.selectPage(id)
    }),
    onDuplicate: source => attempt(async () => { const id = newContentId('p'); await editorRef.current.duplicatePage(source, id); await editorRef.current.selectPage(id) }),
    onRename: (id, name) => attempt(() => editorRef.current.updatePage(id, { name })),
    onRemove: id => setRemoving(pageList.find(item => item.id === id) ?? null),
    onReorder: ids => attempt(() => editorRef.current.reorderPages(ids)),
    onTransfer: (target, copy) => attempt(async () => {
      const editor = editorRef.current, label = pageList.find(item => item.id === target)?.label ?? 'otra página'
      await editor.transferObjects(editor.activePageId(), target, selectedIds, { copy, ...(copy ? { copyId: newContentId('c') } : {}) })
      toast.success(copy ? `Copiado a ${label}` : `Movido a ${label}`)
    }),
  }
  const pagesProps = { pages: pageList, canEdit: !readOnly && ready, busy: busy || !ready, selectedCount: selectedIds.length, people, thumbnails, ...pageActions }
  const hasSelection = Boolean(selection) || selectedIds.length > 1
  // Group state of the selection: one shared groupId → can ungroup; 2+ free editable items → can group.
  const selectedObjects = objects.filter(object => selectedIds.includes(object.id))
  const sharedGroup = selectedObjects.length > 0 && selectedObjects.every(object => object.groupId && object.groupId === selectedObjects[0].groupId)
  const grouping = { canUngroup: sharedGroup, canGroup: selectedObjects.length > 1 && !sharedGroup && selectedObjects.every(object => !object.groupId && !object.locked && !object.hidden) }
  // Extent of the selection in page units (rulers highlight it).
  const selectionBox = selectedObjects.length ? (() => {
    const left = Math.min(...selectedObjects.map(o => o.x)), top = Math.min(...selectedObjects.map(o => o.y))
    const right = Math.max(...selectedObjects.map(o => o.x + o.width * (o.scaleX ?? 1))), bottom = Math.max(...selectedObjects.map(o => o.y + o.height * (o.scaleY ?? 1)))
    return { x: left, y: top, width: right - left, height: bottom - top }
  })() : null
  const group = sharedGroup && selectedObjects.length > 1 ? { id: selectedObjects[0].groupId, count: objects.filter(object => object.groupId === selectedObjects[0].groupId).length } : null
  // Scale/rotate a flat group around its visual centre (engine transformGroup), then keep it selected.
  const transformGroup = options => attempt(async () => {
    const members = objects.filter(object => object.groupId === group.id)
    const left = Math.min(...members.map(o => o.x)), top = Math.min(...members.map(o => o.y))
    const right = Math.max(...members.map(o => o.x + o.width * (o.scaleX ?? 1))), bottom = Math.max(...members.map(o => o.y + o.height * (o.scaleY ?? 1)))
    await editorRef.current.transformGroup(group.id, { ...options, origin: { x: (left + right) / 2, y: (top + bottom) / 2 } })
    editorRef.current.selectGroup(group.id)
  })
  // New elements land centred on the page, or centred on the drop point.
  const centered = (props, point = null) => ({ ...props,
    x: Math.round(point ? point.x - props.width / 2 : (page.width - props.width) / 2), y: Math.round(point ? point.y - props.height / 2 : (page.height - props.height) / 2) })
  function add(type, extra, point = null) {
    attempt(() => editorRef.current.add(type, point || extra?.x === undefined ? centered(extra, point) : extra))
    if (phone) setPanel(null)
  }
  // Combined block: its parts are added, then grouped, as one undo step.
  async function addBlock(block, accent, point = null) {
    const editor = editorRef.current, origin = centered({ width: block.width, height: block.height }, point), parts = block.parts(accent)
    await editor.beginInteraction()
    try {
      for (const part of parts) await editor.add(part.type, { ...part.props, x: origin.x + part.props.x, y: origin.y + part.props.y })
      editor.selectMany(editor.activeScene().objects.slice(-parts.length).map(object => object.id))
      editor.group()
      await editor.endInteraction(true)
    } catch (error) { await editor.endInteraction(false); throw error }
  }
  // Same patch on several elements as one undo step (the engine patches the active object).
  async function patchMany(ids, patch) {
    const editor = editorRef.current
    await editor.beginInteraction()
    try { for (const id of ids) { editor.select(id, { individual: true }); editor.patch(patch) } await editor.endInteraction(true) }
    catch (error) { await editor.endInteraction(false); throw error }
  }
  function shortcut(event) {
    if (!ready || busy || browsing || event.target.closest('input,textarea,[contenteditable=true]') || editorRef.current?.isEditingText()) return
    if (event.key === 'Escape' && viewMode.isImmersive) { viewMode.stepBack(); return }
    if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection && !readOnly) { event.preventDefault(); setConfirm(true); return }
    // Tools without modifiers: H = mover vista, V = seleccionar.
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'h' || event.key === 'H') { event.preventDefault(); view.setHand(true); return }
      if (event.key === 'v' || event.key === 'V') { event.preventDefault(); view.setHand(false); return }
      // Mayús+R = reglas.
      if (event.shiftKey && event.key === 'R') { event.preventDefault(); canvas.toggle.rulers(); return }
      // I = cuentagotas: colorea la selección con el color tomado.
      if ((event.key === 'i' || event.key === 'I') && selection && selection.type !== 'image' && !selection.locked && !readOnly) {
        event.preventDefault()
        const target = selection.id
        pickColor().then(color => { if (color && editorRef.current) attempt(async () => { editorRef.current.select(target); editorRef.current.patch({ fill: color }) }) })
        return
      }
    }
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    // Ctrl+' = cuadrícula (as in other design tools).
    if (event.key === "'") { event.preventDefault(); canvas.toggle.grid(); return }
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
  // Photo tools live in Propiedades when it is docked; otherwise in the left panel / sheet.
  const openImagePanel = (tab, key = 'image') => {
    if (tab) setImageTab(tab)
    if (key === 'image' && wide && inspectorOpen) { setPanel(current => (current === 'image' ? null : current)); return }
    setPanel(key)
  }
  const imageKit = useImageTools({ editorRef, selection, objects, resolveImage, readOnly, onError: setError, openPanel: openImagePanel,
    ensureSaved: chrome.syncState === 'synced' ? null : chrome.ensureSaved })
  const paint = usePaintTools({ editorRef, page, selection, begin: imageKit.tools.begin, end: imageKit.tools.end, onError: setError, fillShape: imageKit.tools.fillShape })
  const tools = { ...imageKit.tools, paint }
  const drop = useCanvasDrop({ editorRef, canvasRef, objects, readOnly: readOnly || !ready, attempt })
  const uploader = <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={blocked} emptyLabel="Subir imagen" hint="PNG, JPG o WebP. Se conserva el original." onUpload={upload} />
  const panels = {
    elements: <ElementsLibrary disabled={blocked} onFrame={imageKit.tools.frame} loadThumbnail={catalog?.thumbnail}
      onAddPrimitive={(type, props, point) => add(type, props, point)} onAddLine={(props, point) => add('line', props, point)}
      onAddFigure={(id, fill, point) => attempt(async () => {
        const object = await catalog.importIcon(id), ratio = object.height && object.width ? object.height / object.width : 1
        await editorRef.current.add('vector', centered({ ...object, width: 240, height: Math.round(240 * ratio), fill }, point))
        if (phone) setPanel(null)
      })}
      onAddBlock={(block, accent, point) => attempt(async () => { await addBlock(block, accent, point); if (phone) setPanel(null) })}
      onImportSvg={file => attempt(async () => {
      if (file.size > 512 * 1024) throw new Error('El SVG supera 512 KB.')
      const result = await editorRef.current.importSvg(await file.text(), file.name)
      if (result?.warnings?.length) toast.warning('SVG importado con cambios', { description: result.warnings.join(' ') })
      if (phone) setPanel(null)
    })} />,
    image: <ImagePanel selection={selection} imageUrl={imageKit.tools.imageUrl} tab={imageTab} onTab={setImageTab} disabled={readOnly || !ready} api={imageKit.tools} />,
    text: <TextPanel disabled={blocked} onAdd={add} />,
    images: resourcePanel ? resourcePanel({ disabled: blocked, uploader }) : uploader,
    layers: <LayersPanel objects={objects} selectedIds={selectedIds} remoteSelections={remoteSelections} disabled={!ready || busy}
      onSelect={id => editorRef.current?.select(id)} onSelectGroup={id => editorRef.current?.selectGroup(id)} onToggleMany={ids => editorRef.current?.selectMany(ids)}
      onPatchObject={(id, patch) => attempt(async () => { editorRef.current.select(id, { individual: true }); editorRef.current.patch(patch) })} />,
    pages: <PagesPanel {...pagesProps} layout={phone ? 'grid' : 'list'} />,
    page: <PageSettingsForm key={`${page.width}x${page.height}:${page.background}`} page={page} disabled={readOnly || !ready} onApply={(next, scale) => editorRef.current.resize(next, scale)}
      background={<PageBackground page={page} disabled={readOnly || !ready} paint={paint} onError={setError} canApplyToSelection={canHoldPhoto(selection) && !selection.locked} />} />,
  }
  const panelLabel = (panel ?? shownPanel) === 'image' ? 'Imagen' : RAIL_ITEMS.find(item => item.key === (panel ?? shownPanel))?.label
  const openProperties = wide && inspectorOpen ? null : () => (wide ? setInspectorOpen(true) : setInspectorSheet(true))
  const inspector = <StudioInspector selection={selection} selectedCount={selectedIds.length} page={page} busy={busy || !ready} readOnly={readOnly} canPaste={history.canPaste}
    onPatch={patch => attempt(() => editorRef.current.patch(patch))} onRemove={() => setConfirm(true)}
    onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))}
    onAlign={(direction, target) => attempt(() => editorRef.current.align(direction, target))} onOpenPage={() => { setPanel('page'); setInspectorSheet(false) }}
    photoTools={imageKit.tools.photo && !readOnly ? panels.image : null} shapeTools={readOnly ? null : tools} onError={setError}
    group={readOnly ? null : group} grouping={readOnly ? null : grouping} onTransformGroup={transformGroup} />
  // Eyedropper fallback + colors already used in the design (for every color picker).
  const [sampling, setSampling] = useState(null)
  const pickFromCanvas = useCallback(() => new Promise(resolve => setSampling(() => resolve)), [])
  const documentColors = [...new Set([page.background, ...objects.map(object => object.fill), ...objects.map(object => object.image?.border?.width ? object.image.border.color : null), ...objects.map(object => object.shape?.strokeWidth ? object.shape.strokeColor : null)]
    .filter(color => /^#[0-9a-f]{6}$/i.test(color ?? '')).map(color => color.toLowerCase()))]
  const colorContext = { pickFromCanvas, documentColors }
  const finishSampling = color => { sampling?.(color); setSampling(null) }
  async function pickColor() {
    let color = null
    if (nativeEyedropper()) { try { color = (await new window.EyeDropper().open()).sRGBHex } catch { return null } } else color = await pickFromCanvas()
    color = toHex(color)
    if (color) rememberColor(color)
    return color
  }
  return (
    <EyedropperContext.Provider value={colorContext}>
    <div role="application" aria-label="Editor gráfico de Studio" tabIndex={-1} onKeyDown={shortcut}
      className={cn('flex min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))] text-[hsl(var(--foreground))] outline-none', viewMode.isImmersive ? 'fixed inset-0 z-50 h-dvh' : 'h-full')}>
      <StudioTopBar phone={phone} {...chrome} page={page} pages={pageList} pageCount={pageCount} canEdit={!readOnly} history={history} people={people.filter(person => !person.isSelf)} objects={objects}
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
        <section ref={drop.zoneRef} aria-label="Área de diseño" className="relative min-w-0 flex-1 overflow-hidden bg-[hsl(var(--muted)/0.45)]" {...drop.handlers}>
          <StudioContextMenu selection={selection} selectedCount={selectedIds.length} readOnly={readOnly} disabled={!ready || busy} canPaste={history.canPaste}
            onPick={event => { if (ready && !editorRef.current?.isEditingText()) editorRef.current?.pick(event) }}
            onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))}
            onAlign={(direction, target) => attempt(() => editorRef.current.align(direction, target))} onPatch={patch => attempt(() => editorRef.current.patch(patch))}
            onRemove={() => setConfirm(true)} onSelectAll={() => editorRef.current?.selectAll()} onFit={view.fit} onProperties={openProperties}
            grouping={grouping} onPatchMany={patch => attempt(() => patchMany(selectedIds, patch))}
            lockedCount={objects.filter(object => object.locked).length} onUnlockAll={() => attempt(() => patchMany(objects.filter(object => object.locked).map(object => object.id), { locked: false }))}
            onPage={() => setPanel('page')}>
          <div ref={view.viewport} {...view.gestures} aria-label="Lienzo" className="absolute inset-0 overflow-auto overscroll-contain"
            onPointerDownCapture={event => {
              view.gestures.onPointerDownCapture?.(event)
              if (event.defaultPrevented || event.pointerType === 'touch' || event.button !== 0 || view.hand || view.panning || event.altKey || sampling || imageKit.framing) return
              if (!view.paper.current?.contains(event.target)) editorRef.current?.deselect()
            }}
            // Double-click a photo: isolate it and move/scale it inside its frame.
            onDoubleClick={() => { if (imageKit.tools.photo && !selection.locked && !readOnly && !imageKit.framing) imageKit.tools.startFraming() }}
            style={{ ...DOTS, touchAction: 'none', overflowAnchor: 'none', cursor: view.panning ? 'grabbing' : view.hand ? 'grab' : undefined }}>
            <div style={view.stageStyle}>
              <div ref={view.paper} className="shadow-[0_12px_48px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5"
                style={view.paperStyle}>
                <canvas ref={canvasRef} aria-label="Lienzo editable de Studio" />
                {canvas.preferences.grid.visible ? <GridOverlay page={page} zoom={zoom} step={canvas.references?.grid.displayStep ?? canvas.preferences.grid.size} /> : null}
                {canvas.preferences.guides ? <GuidesOverlay guides={canvas.guides} page={page} zoom={zoom} /> : null}
                {drop.target ? <DropFrameHint frame={drop.target} zoom={zoom} /> : null}
                {drop.landing ? <DropLandingHint landing={drop.landing} zoom={zoom} /> : null}
                {imageKit.framing ? <FramingOverlay item={imageKit.framing.item} props={imageKit.framing.props} natural={imageKit.framing.natural} imageUrl={imageKit.framing.imageUrl} outline={imageKit.framing.outline} zoom={zoom}
                  onFrame={next => imageKit.tools.image(next)} onDone={() => imageKit.finishFraming(true)} onCancel={() => imageKit.finishFraming(false)} /> : null}
                <RemotePresence people={canvasPeople} selections={remoteSelections} objects={objects} zoom={zoom} />
              </div>
            </div>
          </div>
          </StudioContextMenu>
          {canvas.preferences.grid.rulers ? <Rulers viewportRef={view.viewport} paperRef={view.paper} page={page} zoom={zoom} selection={selectionBox} /> : null}
          {sampling ? <CanvasColorSampler canvas={canvasRef.current} onPick={finishSampling} onCancel={() => finishSampling(null)} /> : null}
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
                <SelectionBar selection={selection} selectedCount={selectedIds.length} disabled={blocked} imageTools={tools} grouping={grouping}
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
            <ZoomPill compact={phone} zoom={zoom} onZoom={view.changeZoom} onFit={view.fit} hand={view.hand} onHand={view.setHand}>
              <CanvasPreferencesMenu canvas={canvas} compact={phone} />
            </ZoomPill>
          </div>
          <div className={cn('pointer-events-none absolute z-20 flex', phone ? 'inset-x-0 bottom-16 justify-center' : 'bottom-4 left-4')}>
            <PageSwitcher index={activeIndex} total={pageCount} label={pageList[activeIndex]?.label ?? ''} compact={phone} navigatorOpen={browsing} disabled={!ready}
              onPrev={() => goToPage(pageList[activeIndex - 1].id)} onNext={() => goToPage(pageList[activeIndex + 1].id)}
              onBrowse={() => (phone ? setPanel(current => (current === 'pages' ? null : 'pages')) : setBrowsing(value => !value))} />
          </div>
          <p className={cn('pointer-events-none absolute bottom-16 z-10 hidden text-xs tabular-nums text-[hsl(var(--muted-foreground))] md:block', canvas.preferences.grid.rulers ? 'left-8' : 'left-4')}>{page.width} × {page.height} px</p>
          {browsing ? <PageNavigator onClose={() => { setBrowsing(false); requestAnimationFrame(() => document.querySelector('[data-page-browse]')?.focus()) }} {...pagesProps} /> : null}
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
      <ConfirmDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null) }} title={`Eliminar ${removing?.label ?? 'página'}`}
        description="Se eliminará la página con sus elementos. Puedes deshacerlo con Ctrl+Z mientras no cierres el editor." confirmLabel="Eliminar página"
        onConfirm={() => { const id = removing.id; setRemoving(null); attempt(() => editorRef.current.removePage(id)) }} />
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar selección" description="Se eliminarán los elementos seleccionados del diseño. Puedes deshacerlo con Ctrl+Z."
        confirmLabel="Eliminar" onConfirm={() => attempt(() => { editorRef.current.remove(); setConfirm(false) })} />
    </div>
    </EyedropperContext.Provider>
  )
}
