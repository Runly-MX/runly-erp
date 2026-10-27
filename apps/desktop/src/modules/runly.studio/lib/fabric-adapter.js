import { Canvas, Rect, Ellipse, Textbox, FabricImage, ActiveSelection, Group, Path, Gradient } from 'fabric'
import { appendObject, validateDocument } from '../../../../../shared/studio/document.js'
import { resizeDocument } from '../../../../../shared/studio/page.js'
import { createDocumentHistory } from './document-history.js'
import { ensureStudioFont } from './studio-fonts.js'
import { photoFileId, documentAssetIds, supportsPhotoFill, SHAPE_TYPES } from '../../../../../shared/studio/shape-properties.js'
import { createStudioPhoto, StudioPhoto } from './studio-photo.js'
import { imageProperties, DEFAULT_IMAGE } from '../../../../../shared/studio/image-properties.js'
import { studioFontStyle } from '../../../../../shared/studio/fonts.js'
import { StudioLine } from './studio-line.js'
import { importStudioSvg } from '../../../../../shared/studio/svg-geometry.js'
import { DEFAULT_GRADIENT, gradientPaint, gradientGeometry, editGradientStop, reverseGradient } from '../../../../../shared/studio/gradient.js'
import { DEFAULT_SNAPPING, DEFAULT_GRID, snappingOptions, gridOptions, createSnapIndex, snapBounds, viewportReferences } from '../../../../../shared/studio/snapping.js'
import { transformStudioGroup } from '../../../../../shared/studio/group-transform.js'
import { applyOps, diffOps, checkOps } from '../../../../../shared/studio/operations.js'
import { exportDimensions } from '../../../../../shared/studio/export-limits.js'
import { checkAbort,abortable } from '../../../../../shared/studio/abort.js'
import { controlStyle, styleControls } from './studio-controls.js'
import { documentPages, findPage, pageId, pageDocument, replacePage } from '../../../../../shared/studio/pages.js'

// One interactive Fabric scene. Page changes flush that scene before replacing it.
// Selection and viewport are session state and never enter the saved document.
export async function createStudioEditor(element, options) {
  let current = validateDocument(options.document), active = current.page.id, closed = false
  let interacting = false
  let protectedMode = options.readOnly ?? false, transitioning = false, queue = Promise.resolve(), inner
  const selections = new Map(), viewports = new Map(), thumbnails = new Map(), history = createDocumentHistory(current)
  let auxiliaryQueue = Promise.resolve(), auxiliaryBytes = 0, transitions = 0
  const snapshot = () => inner ? validateDocument(replacePage(current, inner.snapshot())) : current
  const notifyHistory = state => options.onHistory?.({...state, ...history.state()})
  const changed = (scene, meta) => {
    current = validateDocument(replacePage(current, scene))
    if (!meta?.remote && !interacting) history.commit(current)
    options.onChange?.(current, meta)
  }
  inner = await createPageEditor(element, {...options, document: pageDocument(current, active),
    allObjects: () => documentPages(snapshot()).flatMap(scene => scene.objects),
    validateScene: scene => validateDocument(replacePage(current,scene)),
    onChange: changed, onHistory: notifyHistory,
    onSelection: (selection, ids) => { selections.set(active, ids); options.onSelection?.(selection, ids) },
  })
  function writable() {
    if (closed) throw Error('El editor está cerrado.')
    if (protectedMode) throw Error('Diseño de solo lectura.')
  }
  function enqueue(task, {block = true} = {}) {
    if (block) transitions++
    transitioning = transitions > 0
    const next = queue.then(async () => { if (closed) throw Error('El editor está cerrado.'); await inner.flush(); current = snapshot(); return task() })
    const completed = next.finally(() => { if (block) transitions--; transitioning = transitions > 0 })
    queue = completed.catch(() => {})
    return completed
  }
  async function show(next, {remote = false, select = active, track = true} = {}) {
    const before = current, previousActive = active
    current = validateDocument(next)
    const destination = findPage(current, select) ? select : current.page.id, switched = destination !== active
    const destinationSelection = selections.get(destination) ?? []
    const destinationViewport = viewports.get(destination) ?? viewports.get(active) ?? {zoom:1,panX:0,panY:0}
    if (switched) {
      transitions++; transitioning = true; inner.setReadOnly(true)
      const previousSelection = selections.get(active)
      inner.deselect(); selections.set(active, previousSelection ?? []); active = destination
      options.onActivePage?.(active, destinationViewport)
    }
    try {
      await inner.applyRemote(pageDocument(current, active))
      current = snapshot()
    } catch (error) {
      current = before; active = previousActive
      options.onActivePage?.(active, viewports.get(active))
      throw error
    } finally {
      if (switched) { transitions--; transitioning = transitions > 0; inner.setReadOnly(protectedMode) }
    }
    if (switched) { inner.selectMany(destinationSelection); inner.setViewport(destinationViewport) }
    if (track) { if (remote) history.rebase(diffOps(before, current)); else history.commit(current) }
    options.onChange?.(current, {remote, pageId: active})
    notifyHistory({})
    return current
  }
  function auxiliary(task) {
    const next = auxiliaryQueue.then(async () => { if (closed) throw Error('El editor está cerrado.'); return task() })
    auxiliaryQueue = next.catch(() => {})
    return next
  }
  async function renderPage(id, scene, task, signal) {
    checkAbort(signal)
    await options.authorizePage?.(id, signal)
    checkAbort(signal)
    const canvas = element.ownerDocument.createElement('canvas')
    let renderer
    try {
      renderer = await createPageEditor(canvas, {document: pageDocument(scene, id), resolveImage: assetId => options.resolveImage(assetId, signal), readOnly: true})
      checkAbort(signal)
      const result = await task(renderer)
      for(const assetId of documentAssetIds(pageDocument(scene,id))) { await options.resolveImage(assetId,signal); checkAbort(signal) }
      await options.authorizePage?.(id, signal)
      checkAbort(signal)
      if (JSON.stringify(findPage(snapshot(), id)) !== JSON.stringify(findPage(scene, id))) throw Error('La página cambió durante la exportación.')
      return result
    } finally { await renderer?.destroy(); canvas.width = canvas.height = 0; canvas.remove() }
  }
  async function signatureOf(scene) {
    const bytes = new TextEncoder().encode(JSON.stringify(scene))
    const digest = await crypto.subtle.digest('SHA-256',bytes)
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
  }
  const methods = {
    beginInteraction() { interacting = true; return inner.beginInteraction() },
    async endInteraction(commit = true) { await inner.endInteraction(commit); interacting = false; if (commit) history.commit(snapshot()); notifyHistory({}) },
    snapshot, activePageId: () => active, activeScene: () => pageDocument(snapshot(), active),
    listPages: () => documentPages(snapshot()).map(scene => ({...scene.page, objectCount: scene.objects.length, active: pageId(scene) === active})),
    selectPage(id) { return enqueue(async () => { if (!findPage(current, id)) throw Error('La página ya no existe.'); return show(current, {remote: true, select: id}) }) },
    applyRemote(document) { return enqueue(() => show(document, {remote: true}), {block: false}) },
    load(document) { writable(); return enqueue(() => { writable(); return show(document) }) },
    applyPageOperations(ops) {
      writable()
      return enqueue(() => { writable(); return show(validateDocument(applyOps(current, checkOps(ops)))) })
    },
    addPage({id, width = current.page.width, height = current.page.height, background = '#ffffff', name, afterId = active} = {}) {
      if (!id) throw Error('Proporciona una identidad estable para la página.')
      return methods.applyPageOperations([{type: 'addPage', afterId, scene: {page: {id, width, height, background, ...(name ? {name} : {})}, objects: []}}])
    },
    duplicatePage(id, newId) { return methods.applyPageOperations([{type: 'duplicatePage', pageId: id, newId}]) },
    removePage(id) {
      writable()
      return enqueue(() => {
        writable()
        if (documentPages(current).length === 1) throw Error('No puedes eliminar la última página.')
        return show(validateDocument(applyOps(current, [{type: 'removePage', pageId: id}])))
      })
    },
    reorderPages(ids) { return methods.applyPageOperations([{type: 'pageOrder', ids}]) },
    updatePage(id, set) { return methods.applyPageOperations([{type: 'patchPage', pageId: id, set}]) },
    transferObjects(pageId, targetPageId, ids, {copy = false, copyId} = {}) {
      return methods.applyPageOperations([{type: 'transferObjects', pageId, targetPageId, ids, copy, ...(copy ? {copyId} : {})}])
    },
    undo() { writable(); return enqueue(async () => { writable(); const next = history.peek('undo'); if (next) { await show(next, {remote: true, track: false}); history.move('undo'); notifyHistory({}) } }) },
    redo() { writable(); return enqueue(async () => { writable(); const next = history.peek('redo'); if (next) { await show(next, {remote: true, track: false}); history.move('redo'); notifyHistory({}) } }) },
    setViewport(viewport) { viewports.set(active, viewport); return inner.setViewport(viewport) },
    setReadOnly(value) { protectedMode = value; inner.setReadOnly(value) },
    async flush() { await queue; await inner.flush() },
    async exportImage(format, quality, reviewed, settings) {
      await methods.flush()
      if (reviewed && JSON.stringify(validateDocument(reviewed)) !== JSON.stringify(snapshot())) throw Error('El diseño cambió. Vuelve a descargar para revisar los créditos actualizados.')
      return inner.exportImage(format, quality, reviewed ? pageDocument(reviewed, active) : undefined, settings)
    },
    exportPng() { return methods.exportImage('png') },
    exportPage(id, format = 'png', quality = 1, reviewed = snapshot(), settings = {}) {
      if (id === active) return methods.exportImage(format, quality, reviewed, settings)
      return auxiliary(() => renderPage(id, reviewed, renderer => renderer.exportImage(format, quality, pageDocument(reviewed, id), settings), settings.signal))
    },
    getPageThumbnail(id, {signal} = {}) {
      return auxiliary(async () => {
        if (!options.authorizePage) throw Error('Falta la autorización vigente para miniaturas privadas.')
        await options.authorizePage(id, signal); checkAbort(signal)
        const scene = snapshot(), signature = await signatureOf(findPage(scene, id)), cached = thumbnails.get(id)
        if (!findPage(scene, id)) throw Error('La página ya no existe.')
        if (cached?.signature === signature) {
          for (const assetId of documentAssetIds(pageDocument(scene,id))) { await options.resolveImage(assetId,signal); checkAbort(signal) }
          await options.authorizePage(id,signal); checkAbort(signal)
          if(closed || await signatureOf(findPage(snapshot(),id)) !== signature) throw Error('La página cambió.')
          thumbnails.delete(id); thumbnails.set(id,cached); return cached.blob
        }
        if (cached) { auxiliaryBytes -= cached.blob.size; thumbnails.delete(id) }
        const blob = await renderPage(id, scene, renderer => renderer.thumbnail(signal), signal)
        if (closed) throw Error('El editor está cerrado.')
        if (blob.size <= 2 * 1024 * 1024) {
          thumbnails.set(id, {signature, blob}); auxiliaryBytes += blob.size
          while (thumbnails.size > 8 || auxiliaryBytes > 2 * 1024 * 1024) {
            const oldest = thumbnails.keys().next().value
            auxiliaryBytes -= thumbnails.get(oldest).blob.size; thumbnails.delete(oldest)
          }
        }
        return blob
      })
    },
    async destroy() { closed = true; await queue; await auxiliaryQueue; thumbnails.clear(); auxiliaryBytes = 0; selections.clear(); viewports.clear(); await inner.destroy() },
  }
  return new Proxy(methods, {get(target, key) {
    if (key in target) return target[key]
    const value = inner[key]
    if (typeof value !== 'function') return value
    return (...args) => { if (transitioning || closed) throw Error('Espera a que termine el cambio de página.'); return value.apply(inner, args) }
  }})
}

// Fabric owns interaction; only the canonical Runly scene enters history or storage.
async function createPageEditor(element, { document, resolveImage, onChange, onSelection, onError, onHistory, onPointer, onEditImage, onGuides, onEditorPreferences, readOnly = false, sharedClipboard, authorizePaste, allObjects, validateScene }) {
  function validateCandidate(input) {
    const clean = validateDocument(input)
    validateScene?.(clean)
    return clean
  }
  let protectedMode = readOnly, exportingNow = false
  const writable = () => {
    if (protectedMode) throw new Error('Diseño de solo lectura.')
    if (exportingNow) throw new Error('Espera a que termine la exportación.')
  }
  let current = validateCandidate(document), destroyed = false, history, clipboard = []
  let queue = Promise.resolve(), interaction = null, pendingAdjustments = null, selectingGroup = false, individualSelection = null
  const canvas = new Canvas(element, { width: current.page.width, height: current.page.height,
    backgroundColor: current.page.background, preserveObjectStacking: true, enableRetinaScaling: false })
  const source = new Map()
  let snapping={...DEFAULT_SNAPPING},grid={...DEFAULT_GRID},viewport={zoom:1,panX:0,panY:0},snapIndex=null
  const clearGuides=()=>{snapIndex=null;onGuides?.([])}
  function pagePaint(page) {
    const p=page.backgroundPaint
    return p?new Gradient({type:p.gradientType,gradientUnits:'pixels',coords:gradientGeometry(p,page.width,page.height),colorStops:p.stops.map(s=>({...s}))}):page.background
  }
  const preferences=()=>onEditorPreferences?.({snapping:{...snapping},...viewportReferences(current.page,viewport,grid)})
  function gestureIndex(target) {
    const ids=new Set(target.type==='activeselection'?target.getObjects().map(o=>o.studioId):[target.studioId])
    const groups=new Set([...ids].map(id=>source.get(id)?.groupId).filter(Boolean))
    for(const item of source.values())if(groups.has(item.groupId))ids.add(item.id)
    return createSnapIndex(current.page,canvas.getObjects().map(o=>({...o.getBoundingRect(),id:o.studioId,hidden:source.get(o.studioId)?.hidden})),[...ids])
  }
  const flags = item => ({ visible: !item.hidden, selectable: !item.locked, evented: !item.locked,
    lockMovementX: item.locked || protectedMode || exportingNow, lockMovementY: item.locked || protectedMode || exportingNow, lockScalingX: item.locked || protectedMode || exportingNow, lockScalingY: item.locked || protectedMode || exportingNow,
    lockRotation: item.locked || protectedMode || exportingNow, editable: !item.locked && !protectedMode && !exportingNow })
  async function build(item,budget={pixels:canvas.getObjects().filter(object=>object.studioId!==item.id).reduce((sum,object)=>sum+(object.studioPixels??0),0)}) {
    let pixels=0
    const reserve=image=>{
      pixels=image.width*image.height
      if(!pixels||image.width>8192||image.height>8192||pixels>25_000_000||budget.pixels+pixels>25_000_000)throw Error('El diseño supera el límite de 25 megapíxeles de imágenes decodificadas o 8192 px por lado.')
      budget.pixels+=pixels
    }
    const options = { left: item.x, top: item.y, angle: item.rotation, fill: item.fill, strokeWidth:0, originX: 'left', originY: 'top' }
    let object
    if(SHAPE_TYPES.includes(item.type)&&(item.fillPaint||item.shape)){
      object=photoFileId(item)?await createStudioPhoto(item,resolveImage,reserve):new StudioPhoto(item,null)
    }
    else if (item.type === 'text') {
      await ensureStudioFont(item.fontFamily,item.fontVariant)
      const style=studioFontStyle(item.fontFamily,item.fontVariant)
      object = new Textbox(item.text, { ...options, width: item.width, fontSize: item.fontSize, fontFamily: item.fontFamily, fontWeight:style.weight, fontStyle:style.style, scaleX: item.scaleX, scaleY: item.scaleY,
        textAlign:item.textAlign,lineHeight:item.lineHeight,charSpacing:item.charSpacing,underline:item.underline,linethrough:item.linethrough })
    }
    else if (item.type === 'rectangle') object = new Rect({ ...options, width: item.width, height: item.height })
    else if (item.type === 'ellipse') object = new Ellipse({ ...options, rx: item.width / 2, ry: item.height / 2 })
    else if(item.type==='line')object=new StudioLine(item)
    else if (item.type === 'vector') {
      const { width,height,paths } = item.geometry
      const shapes = [new Rect({ left:0,top:0,width,height,fill:'transparent',strokeWidth:0 })]
      for (const path of paths) shapes.push(new Path(path.d, { fill:path.fill==='color'?item.fill:null, stroke:path.stroke==='color'?item.fill:null, strokeWidth:path.strokeWidth, strokeLineCap:path.cap, strokeLineJoin:path.join }))
      object = new Group(shapes, { ...options, subTargetCheck:false, interactive:false })
      object.set({ scaleX:item.width/object.width,scaleY:item.height/object.height })
    }
    else if(item.type==='image'&&item.image) object=await createStudioPhoto(item,resolveImage,reserve)
    else {
      try { object = await FabricImage.fromURL(await resolveImage(item.fileAssetId), { crossOrigin: 'anonymous' }) }
      catch { throw new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
      try{reserve(object)}catch(error){object.dispose();throw error}
      object.set({ ...options, scaleX: item.width / object.width, scaleY: item.height / object.height })
    }
    object.studioId = item.id
    object.studioPixels=pixels
    object.set({ ...flags(item), opacity:item.opacity??1, lockScalingFlip: true, minScaleLimit: 0.02 })
    return object
  }
  function snapshot() {
    const stable = (value, original) => Math.abs(value - original) < 1e-8 ? original : value
    return validateDocument({ ...current, objects: canvas.getObjects().map(object => {
      const item = source.get(object.studioId)
      const position = object.getXY(), scaling = object.group ? object.getObjectScaling() : { x: object.scaleX, y: object.scaleY }
      return { ...item, x: stable(position.x, item.x), y: stable(position.y, item.y), width: stable(Math.max(1, object.width * scaling.x), item.width),
        height: stable(Math.max(1, object.height * scaling.y), item.height), rotation: stable(object.getTotalAngle() % 360, item.rotation), fill: item.fill,
        ...(item.type === 'text' ? { text: object.text, fontSize: object.fontSize } : {}),
        ...(['text','line'].includes(item.type) ? { width: object.width, height: object.height, scaleX: stable(scaling.x, item.scaleX), scaleY: stable(scaling.y, item.scaleY) } : {}) }
    }) })
  }
  const mergePatch=(item,patch)=>({...item,...patch,...(patch.shape?{shape:{...item.shape,...patch.shape}}:{})})
  const withPhoto=(item,fileAssetId)=>item.type==='image'?{...item,fileAssetId}:{...item,fillPaint:{...item.fillPaint,fileAssetId}}
  function selected() {
    const object = canvas.getActiveObject()
    return object?.studioId ? snapshot().objects.find(item => item.id === object.studioId) : null
  }
  function selection() {
    const active = canvas.getActiveObject()
    const groupId=active?.studioId&&source.get(active.studioId)?.groupId
    if(groupId&&!selectingGroup&&individualSelection!==active.studioId){editor.selectGroup(groupId);return}
    if (active?.type === 'activeselection') {
      // User groups move together. Scaling/rotation stays locked until nested
      // affine transforms have their own verified canonical representation.
      active.set({ lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true })
    }
    onSelection?.(selected(), canvas.getActiveObjects().map(object => object.studioId))
  }
  function changed(record = true) {
    try {
      const document = snapshot()
      if (record && !interaction) history.commit(document)
      onChange?.(document); selection(); onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    } catch (error) { onError?.(error.message) }
  }
  async function restore(document, requiresWrite = false) {
    const next = validateCandidate(document), objects = [],budget={pixels:0}
    try { for (const item of next.objects) objects.push(await build(item,budget)); if(requiresWrite)writable() }
    catch (error) { objects.forEach(object => object.dispose()); throw error }
    if (destroyed) { objects.forEach(object => object.dispose()); return }
    canvas.discardActiveObject(); canvas.getObjects().forEach(object => { canvas.remove(object); object.dispose() })
    current = next; source.clear(); next.objects.forEach(item => source.set(item.id, item))
    objects.forEach(object=>object.set(flags(source.get(object.studioId))))
    canvas.add(...objects); canvas.setDimensions({ width: next.page.width, height: next.page.height })
    canvas.backgroundColor = pagePaint(next.page); clearGuides(); canvas.requestRenderAll()
  }
  function enqueue(action) {
    const task = queue.then(() => destroyed ? undefined : action())
    queue = task.catch(() => {})
    return task
  }
  function editSelectedGradient(edit) {
    writable();const id=selected()?.id
    return enqueue(()=>{
      writable();const item=snapshot().objects.find(o=>o.id===id),object=canvas.getObjects().find(o=>o.studioId===id)
      if(!item||item.locked||item.hidden||item.fillPaint?.type!=='gradient'||!(object instanceof StudioPhoto))throw Error('Selecciona un degradado editable.')
      const next={...item,fillPaint:gradientPaint(edit(item.fillPaint))}
      object.configure(next);source.set(id,next);canvas.requestRenderAll();changed()
    })
  }
  async function travelHistory(direction) {
    writable()
    const next = history.peek(direction)
    if (!next) return
    // Selective history: the result already contains collaborators' changes.
    await applyDocument(next)
    history.move(direction)
    changed(false)
  }
  // Same kind of Fabric object for both versions, so it can be updated in place.
  const photoClass = item => SHAPE_TYPES.includes(item.type) && Boolean(item.fillPaint || item.shape)
  function inPlace(prev, item) {
    if (!prev || prev.type !== item.type || photoFileId(prev) !== photoFileId(item) || photoClass(prev) !== photoClass(item)) return false
    if (item.type === 'text' && (prev.fontFamily !== item.fontFamily || prev.fontVariant !== item.fontVariant)) return false
    if (item.type === 'vector' && JSON.stringify(prev.geometry) !== JSON.stringify(item.geometry)) return false
    return !(item.type === 'image' && Boolean(prev.image) !== Boolean(item.image))
  }
  // Objects the local user is dragging, transforming or typing in: a remote
  // version must not yank them mid-gesture (the local result is sent at the end).
  function busyIds() {
    const target = canvas._currentTransform?.target, active = canvas.getActiveObject()
    const ids = target ? (target.type === 'activeselection' ? target.getObjects() : [target]).map(object => object.studioId) : []
    if (active?.isEditing) ids.push(active.studioId)
    return new Set(ids)
  }
  // Minimal canvas update to `document`: in-place property updates, rebuild
  // only when the object kind changes, add, remove, reorder and page. Keeps the
  // selection by id and never touches history.
  async function applyDocument(document, { skip = new Set(),attempt=0 } = {}) {
    const next = validateCandidate(document), wanted = new Map(next.objects.map(item => [item.id, item]))
    const before=snapshot(),live=new Map(before.objects.map(item=>[item.id,item])),prepared=new Map()
    const budget={pixels:canvas.getObjects().reduce((n,o)=>n+(skip.has(o.studioId)||wanted.has(o.studioId)&&inPlace(live.get(o.studioId),wanted.get(o.studioId))?o.studioPixels??0:0),0)}
    try{
      for(const item of next.objects){
        if(skip.has(item.id))continue
        const prev=live.get(item.id),object=canvas.getObjects().find(o=>o.studioId===item.id)
        if(!object||!inPlace(prev,item))prepared.set(item.id,await build(item,budget))
      }
      if(destroyed){for(const object of prepared.values())object.dispose();return}
      const now=snapshot(),delta=diffOps(before,now)
      if(delta.length){
        for(const object of prepared.values())object.dispose()
        prepared.clear()
        if(attempt>=3)throw Error('El diseño cambió durante la carga de recursos. Reintenta la sincronización.')
        return applyDocument(applyOps(next,delta),{skip:busyIds(),attempt:attempt+1})
      }
    }catch(error){for(const object of prepared.values())object.dispose();throw error}
    const selectedIds = canvas.getActiveObjects().map(object => object.studioId)
    let reselect = false
    if(canvas.getActiveObject()?.type==='activeselection'&&!selectedIds.some(id=>skip.has(id))){canvas.discardActiveObject();reselect=true}
    const drop = object => { if (selectedIds.includes(object.studioId)) { canvas.discardActiveObject(); reselect = true }; canvas.remove(object); object.dispose() }
    for (const object of [...canvas.getObjects()]) if (!wanted.has(object.studioId) && !skip.has(object.studioId)) { drop(object); source.delete(object.studioId) }
    for (const item of next.objects) {
      if (skip.has(item.id)) continue
      const prev = live.get(item.id), object = canvas.getObjects().find(candidate => candidate.studioId === item.id)
      if (object && JSON.stringify(prev) === JSON.stringify(item)) continue
      if (object && inPlace(prev, item)) { setItem(object, item, item); continue }
      const built = prepared.get(item.id)
      const stale = canvas.getObjects().find(candidate => candidate.studioId === item.id)
      if (stale) { const index = canvas.getObjects().indexOf(stale); drop(stale); canvas.insertAt(index, built) } else canvas.add(built)
      built.set(flags(item)); source.set(item.id, item)
    }
    next.objects.forEach((item, index) => {
      const object = canvas.getObjects().find(candidate => candidate.studioId === item.id)
      if (object && canvas.getObjects().indexOf(object) !== index) canvas.moveObjectTo(object, index)
    })
    if (JSON.stringify(current.page) !== JSON.stringify(next.page)) {
      canvas.setDimensions({ width: next.page.width, height: next.page.height }); canvas.backgroundColor = pagePaint(next.page); clearGuides()
    }
    current = { ...current, page: next.page }
    if (reselect) {
      // Restore by stable document IDs, never by disposed Fabric object references.
      const surviving = selectedIds.filter(id => source.has(id) && !source.get(id).hidden)
      if (surviving.length === 1) editor.select(surviving[0]); else if (surviving.length) editor.selectMany(surviving)
    }
    canvas.requestRenderAll()
  }
  function applyItem(object,item,patch) { setItem(object,item,patch); changed() }
  function setItem(object,item,patch) {
    if(object instanceof StudioPhoto){
      object.set({left:item.x,top:item.y,angle:item.rotation,fill:item.fill,opacity:item.opacity??1,scaleX:1,scaleY:1,...flags(item)})
      object.configure(item);source.set(item.id,item);object.setCoords();canvas.requestRenderAll();return
    }
    object.set({left:item.x,top:item.y,angle:item.rotation,fill:item.fill,opacity:item.opacity??1,...flags(item)})
    if(item.type==='vector'&&!object.configure)object.getObjects().slice(1).forEach((shape,index)=>{const path=item.geometry.paths[index];shape.set({fill:path.fill==='color'?item.fill:null,stroke:path.stroke==='color'?item.fill:null})})
    if(item.type==='text'){
      const style=studioFontStyle(item.fontFamily,item.fontVariant)
      object.set({text:item.text,fontSize:item.fontSize,width:item.width,scaleX:item.scaleX,scaleY:item.scaleY,fontFamily:item.fontFamily,fontWeight:style.weight,fontStyle:style.style,
        textAlign:item.textAlign,lineHeight:item.lineHeight,charSpacing:item.charSpacing,underline:item.underline,linethrough:item.linethrough})
    }
    if(item.type==='line'){object.set({width:item.width,height:item.height,scaleX:item.scaleX,scaleY:item.scaleY});object.configure(item)}
    if((item.type==='image'||SHAPE_TYPES.includes(item.type))&&object.configure)object.configure({...item,width:object.width,height:object.height})
    if(!['text','line'].includes(item.type)){
      if(patch.width!==undefined)object.set({scaleX:item.width/object.width})
      if(patch.height!==undefined)object.set({scaleY:item.height/object.height})
    }
    source.set(item.id,item);object.setCoords();canvas.requestRenderAll()
  }
  styleControls(canvas)
  try { await restore(current) } catch (error) { await canvas.dispose(); throw error }
  history = createDocumentHistory(snapshot())
  onHistory?.({ ...history.state(), canPaste: sharedClipboard ? sharedClipboard.read().length > 0 : false })
  // Only committed transforms enter history; pointer moves do not create entries.
  canvas.on('object:modified', () => {
    clearGuides()
    // A frame resize recomputes cover/contain instead of baking a stretched photo.
    const doc=snapshot(),items=new Map(doc.objects.map(item=>[item.id,item]))
    for(const object of canvas.getObjects())if(object.configure&&source.get(object.studioId)?.type!=='line'&&!object.group){
      const item=items.get(object.studioId);object.set({scaleX:1,scaleY:1});object.configure(item);object.setCoords();source.set(item.id,item)
    }
    changed()
  })
  canvas.on('before:transform',({transform})=>{snapIndex=gestureIndex(transform.target)})
  canvas.on('object:moving',({target,e})=>{
    if(protectedMode||exportingNow||target.lockMovementX||target.lockMovementY)return
    snapIndex??=gestureIndex(target)
    target.setCoords()
    // The viewport is currently CSS scaled; measure the actual displayed canvas.
    const measured=canvas.upperCanvasEl.getBoundingClientRect().width/canvas.getWidth()
    const result=snapBounds(snapIndex,target.getBoundingRect(),{zoom:measured||viewport.zoom,disabled:Boolean(e?.altKey),options:snapping,grid})
    target.set({left:target.left+result.dx,top:target.top+result.dy});target.setCoords();onGuides?.(result.guides)
  })
  canvas.on('mouse:up',clearGuides)
  canvas.on('text:changed', () => changed())
  canvas.on('mouse:move', event => { const point = canvas.getScenePoint(event.e); onPointer?.({ x: point.x, y: point.y }) })
  canvas.on('mouse:out', () => onPointer?.(null))
  for (const event of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(event, selection)
  // New objects and multi-selections get the handles for the current zoom.
  canvas.on('object:added', ({ target }) => target.set(controlStyle(viewport.zoom)))
  canvas.on('selection:created', () => canvas.getActiveObject()?.set(controlStyle(viewport.zoom)))
  const editor = {
    snapshot,
    // Real-time collaboration: show the shared document. Not a local change:
    // no history entry; history and an open interaction are rebased by the
    // remote delta. Objects under a local gesture keep their local version.
    applyRemote(document) {
      return enqueue(async () => {
        const before = snapshot()
        await applyDocument(document, { skip: busyIds() })
        if(destroyed)return
        const after = snapshot(), remote = diffOps(before, after)
        history.rebase(remote)
        if (interaction) interaction.document = validateCandidate(applyOps(interaction.document, remote))
        try { onChange?.(after, { remote: true }); selection(); onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 }) } catch (error) { onError?.(error.message) }
        return after
      })
    },
    // Replace the scene as a local change (draft recovery); one undo step.
    load(document) { writable(); return enqueue(async () => { writable(); await applyDocument(document); changed() }) },
    setGradient(paint=DEFAULT_GRADIENT){const item=selected();if(!item||!supportsPhotoFill(item))throw Error('Selecciona una forma compatible.');return editor.patch({fillPaint:gradientPaint(paint)})},
    updateGradientStop(index,patch){return editSelectedGradient(paint=>editGradientStop(paint,index,patch))},
    addGradientStop(stop){return editSelectedGradient(paint=>({...paint,stops:[...paint.stops,stop].sort((a,b)=>a.offset-b.offset)}))},
    removeGradientStop(index){return editSelectedGradient(paint=>{if(!Number.isInteger(index)||index<0||index>=paint.stops.length)throw Error('Punto no válido.');return {...paint,stops:paint.stops.filter((_,i)=>i!==index)}})},
    reverseGradient(){return editSelectedGradient(reverseGradient)},
    resetGradient(){return editor.setGradient(DEFAULT_GRADIENT)},
    setSolidFill(color){return editor.patch({fill:color,fillPaint:{type:'solid',color}})},
    setPageGradient(paint=DEFAULT_GRADIENT){writable();const value=gradientPaint(paint);return enqueue(async()=>{writable();await restore({...snapshot(),page:{...current.page,backgroundPaint:value}},true);changed()})},
    setPageBackground(color){writable();return enqueue(async()=>{writable();await restore({...snapshot(),page:{...current.page,background:color,backgroundPaint:undefined}},true);changed()})},
    setSnappingEnabled(enabled){return editor.setSnappingOptions({enabled})},
    setSnappingOptions(patch){snapping=snappingOptions({...snapping,...patch});clearGuides();preferences();return {...snapping}},
    setGridOptions(patch){grid=gridOptions({...grid,...patch});clearGuides();preferences();return {...grid}},
    setViewport(value){const next={...viewport,...value};viewportReferences(current.page,next,grid);const zoomed=next.zoom!==viewport.zoom;viewport=next;clearGuides();preferences();if(zoomed)styleControls(canvas,next.zoom)},
    getEditorPreferences(){return {snapping:{...snapping},...viewportReferences(current.page,viewport,grid)}},
    transformGroup(groupId,options={}){writable();return enqueue(async()=>{
      writable();const members=canvas.getObjects().filter(o=>source.get(o.studioId)?.groupId===groupId)
      canvas.discardActiveObject()
      const bounds=members.map(o=>o.getBoundingRect()),origin=options.origin??{x:Math.min(...bounds.map(b=>b.left)),y:Math.min(...bounds.map(b=>b.top))}
      const next=transformStudioGroup(snapshot(),groupId,{...options,origin})
      await restore(next,true);editor.selectGroup(groupId);changed()
    })},
    setShapeStyle(patch){const item=selected();if(!item||!SHAPE_TYPES.includes(item.type))throw Error('Selecciona una forma.');return editor.patch({shape:patch})},
    setPhotoFill(fileAssetId,image={}){const item=selected();if(!item||!supportsPhotoFill(item))throw Error('Esta geometría no admite fotografía.');return editor.patch({fill:item.fillPaint?.type==='solid'?item.fillPaint.color:item.fill,fillPaint:{type:'image',fileAssetId,image}})},
    removePhotoFill(){const item=selected();if(!item||!SHAPE_TYPES.includes(item.type))throw Error('Selecciona una forma.');return editor.patch({fillPaint:undefined})},
    async importSvg(svg,name){writable();const result=importStudioSvg(svg,name);await editor.add('vector',result.object);return {warnings:result.warnings,provenance:result.provenance}},
    setLineStyle(patch){if(selected()?.type!=='line')throw Error('Selecciona una línea.');return editor.patch(patch)},
    group() {
      writable()
      const ids=new Set(canvas.getActiveObjects().map(o=>o.studioId)),doc=snapshot(),items=doc.objects.filter(o=>ids.has(o.id))
      if(items.length<2||items.some(o=>o.locked||o.hidden||o.groupId))throw Error('Selecciona al menos dos elementos editables y sin agrupar.')
      let n=1;while((allObjects?.()??doc.objects).some(o=>o.groupId===`group-${n}`||o.id===`group-${n}`))n++
      const groupId=`group-${n}`
      validateCandidate({...doc,objects:doc.objects.map(item=>ids.has(item.id)?{...item,groupId}:item)})
      for(const item of items)source.set(item.id,{...item,groupId})
      changed();return {id:groupId,objectIds:items.map(o=>o.id)}
    },
    ungroup() {
      writable()
      const groups=new Set(canvas.getActiveObjects().map(o=>source.get(o.studioId)?.groupId).filter(Boolean))
      for(const [id,item]of source)if(groups.has(item.groupId)){const next={...item};delete next.groupId;source.set(id,next)}
      changed()
    },
    groups(){const groups=new Map();for(const item of snapshot().objects)if(item.groupId){if(!groups.has(item.groupId))groups.set(item.groupId,[]);groups.get(item.groupId).push(item.id)}return [...groups].map(([id,objectIds])=>({id,objectIds}))},
    selectGroup(id){const group=editor.groups().find(g=>g.id===id);if(group)editor.selectMany(group.objectIds)},
    setTextStyle(patch) {
      const item=selected();if(item?.type!=='text')throw Error('Selecciona un texto.')
      const allowed=new Set(['fontFamily','fontVariant','fontSize','textAlign','lineHeight','charSpacing','underline','linethrough','fill'])
      if(Object.keys(patch).some(key=>!allowed.has(key)))throw Error('Propiedad de texto no admitida.')
      return editor.patch(patch)
    },
    beginInteraction() {
      writable();return enqueue(() => {writable();if(interaction)throw Error('Ya hay una interacción activa.');interaction={document:snapshot(),ids:canvas.getActiveObjects().map(o=>o.studioId)}})
    },
    async endInteraction(commit = true) {
      writable();await pendingAdjustments?.promise;return enqueue(async () => {writable();if(!interaction)return;const previous=interaction;interaction=null
        if(!commit){await applyDocument(previous.document);writable();editor.selectMany(previous.ids)}
        else history.commit(snapshot())
        changed(false)
      })
    },
    setImageMask(mask,properties={}) {return editor.patchImage({mask,...properties})},
    cropImage(crop) {return editor.patchImage({crop})},
    patchImage(patch) {
      writable()
      const target=editor.captureImage().object
      return enqueue(async () => {
        const captured=editor.captureImage(target.id)
        if(canvas.getActiveObject()?.studioId!==target.id||photoFileId(captured.object)!==photoFileId(target))throw Error('La imagen seleccionada cambió durante la operación.')
        const properties=imageProperties({...imageProperties(captured.object.type==='image'?captured.object.image:captured.object.fillPaint.image),...patch})
        const candidate=captured.object.type==='image'?{...captured.object,image:properties}:{...captured.object,fillPaint:{...captured.object.fillPaint,image:properties}}
        const next=validateCandidate({...snapshot(),objects:snapshot().objects.map(o=>o.id===candidate.id?candidate:o)}).objects.find(o=>o.id===candidate.id)
        const active=canvas.getActiveObject()
        if(active.configure){
          writable();active.configure({...next,width:active.width,height:active.height});source.set(next.id,next);canvas.requestRenderAll();changed();return
        }
        const replacement=await build(next)
        try {
          writable()
          if(destroyed||editor.captureImage(next.id).fingerprint!==captured.fingerprint)throw Error('La imagen cambió durante el procesamiento.')
          const old=canvas.getActiveObject(),index=canvas.getObjects().indexOf(old)
          canvas.discardActiveObject();canvas.remove(old);old.dispose();source.set(next.id,next);canvas.insertAt(index,replacement);editor.select(next.id);changed()
        }catch(error){replacement.dispose();throw error}
      })
    },
    updateImageAdjustments(patch) {
      const captured=editor.captureImage()
      // One filter pass per animation frame, with the latest slider values.
      if(pendingAdjustments&&pendingAdjustments.id===captured.object.id){Object.assign(pendingAdjustments.patch,patch);return pendingAdjustments.promise}
      const pending={id:captured.object.id,fileId:photoFileId(captured.object),patch:{...patch}}
      pendingAdjustments=pending
      pending.promise=(async()=>{
        await new Promise(resolve=>requestAnimationFrame(resolve))
        if(pendingAdjustments===pending)pendingAdjustments=null
        const latest=editor.captureImage(pending.id)
        if(photoFileId(latest.object)!==pending.fileId)throw Error('La fotografía cambió durante el ajuste.')
        if(canvas.getActiveObject()?.studioId!==pending.id)throw Error('La selección cambió durante el ajuste.')
        return editor.patchImage({adjustments:{...imageProperties(latest.object.type==='image'?latest.object.image:latest.object.fillPaint.image).adjustments,...pending.patch}})
      })()
      return pending.promise
    },
    resetImageAdjustments() {return editor.patchImage({adjustments:DEFAULT_IMAGE.adjustments})},
    resetImageFraming() {const {object}=editor.captureImage();const properties=imageProperties(object.type==='image'?object.image:object.fillPaint.image);return editor.patchImage({...properties,offsetX:0,offsetY:0,zoom:1,rotation:0,crop:DEFAULT_IMAGE.crop})},
    editImage(id = canvas.getActiveObject()?.studioId) {
      writable()
      if (!onEditImage) throw Error('El editor fotográfico no está conectado.')
      return onEditImage(id)
    },
    captureImage(id = canvas.getActiveObject()?.studioId) {
      writable()
      const item = snapshot().objects.find(item => item.id === id && photoFileId(item) && !item.locked && !item.hidden)
      if (!item) throw Error('Selecciona una imagen editable.')
      return { object: item, fileAssetId:photoFileId(item), fingerprint: JSON.stringify(item) }
    },
    replaceImage(id, fileAssetId, fingerprint) {
      writable()
      return enqueue(async () => {
        writable()
        const captured = editor.captureImage(id)
        if (fingerprint && captured.fingerprint !== fingerprint) throw Error('La imagen cambió durante la edición. La copia se conserva en Files.')
        await authorizePaste?.([withPhoto(captured.object,fileAssetId)])
        const item = validateCandidate({...snapshot(),objects:snapshot().objects.map(object => object.id === id ? withPhoto(object,fileAssetId) : object)}).objects.find(object => object.id === id)
        const replacement = await build(item)
        try {
          writable()
          if (destroyed || editor.captureImage(id).fingerprint !== captured.fingerprint) throw Error('La imagen cambió durante la edición. La copia se conserva en Files.')
          const original = canvas.getObjects().find(object => object.studioId === id), index = canvas.getObjects().indexOf(original)
          canvas.discardActiveObject(); canvas.remove(original); original.dispose()
          source.set(id,item); canvas.insertAt(index,replacement); editor.select(id); canvas.requestRenderAll(); changed()
        } catch (error) { replacement.dispose(); throw error }
      })
    },
    flush: async () => {await pendingAdjustments?.promise;await queue},
    setReadOnly(value) {
      protectedMode = value; canvas.getObjects().forEach(object => object.set(flags(source.get(object.studioId))))
      if (canvas.getActiveObject()?.type === 'activeselection') canvas.getActiveObject().set({ lockMovementX: value || exportingNow, lockMovementY: value || exportingNow })
      canvas.requestRenderAll()
    },
    select(id,{individual=false}={}) {
      individualSelection=individual?id:null
      const object = canvas.getObjects().find(item => item.studioId === id)
      if (object) { canvas.setActiveObject(object); canvas.requestRenderAll(); selection() }
    },
    selectMany(ids) {
      selectingGroup=true;individualSelection=null
      canvas.discardActiveObject()
      const wanted = new Set(ids)
      const objects = canvas.getObjects().filter(object => wanted.has(object.studioId) && !source.get(object.studioId)?.hidden && !source.get(object.studioId)?.locked)
      if (objects.length === 1) canvas.setActiveObject(objects[0])
      else if (objects.length > 1) canvas.setActiveObject(new ActiveSelection(objects, { canvas, lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true }))
      canvas.requestRenderAll(); selection();selectingGroup=false
    },
    // Context menu: select what is under the pointer, keeping a multi-selection
    // the pointer is inside of. Returns false on empty canvas.
    pick(event) {
      const target = canvas.findTarget(event)
      if (!target) { canvas.discardActiveObject(); canvas.requestRenderAll(); selection(); return false }
      if (target !== canvas.getActiveObject() && target.studioId) { canvas.setActiveObject(target); canvas.requestRenderAll(); selection() }
      return true
    },
    deselect() {
      const active = canvas.getActiveObject()
      if (active?.isEditing) active.exitEditing()
      individualSelection = null
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      selection()
    },
    selectAll() { editor.selectMany(canvas.getObjects().map(object => object.studioId)) },
    isEditingText: () => Boolean(canvas.getActiveObject()?.isEditing),
    setPanMode(value) { canvas.skipTargetFind = value; canvas.selection = !value; canvas.defaultCursor = value ? 'grab' : 'default' },
    resize(page, scaleContent = false) {
      writable()
      return enqueue(async () => { writable(); const next = resizeDocument(snapshot(), page, scaleContent); await restore(next,true); changed() })
    },
    align(direction, target = 'page') {
      writable()
      return enqueue(async () => {
        writable()
        const ids = canvas.getActiveObjects().map(object => object.studioId)
        const wanted = new Set(ids)
        canvas.discardActiveObject()
        const objects = canvas.getObjects().filter(object => wanted.has(object.studioId) && !source.get(object.studioId)?.locked && !source.get(object.studioId)?.hidden)
        const bounds = objects.map(object => ({ object, box: object.getBoundingRect() }))
        const positions = new Map(objects.map(object => [object, { left: object.left, top: object.top }]))
        if (!bounds.length || (direction.startsWith('distribute') && bounds.length < 3)) { editor.selectMany(ids); return }
        const reference = target === 'page' ? { left: 0, top: 0, width: current.page.width, height: current.page.height } : {
          left: Math.min(...bounds.map(({box}) => box.left)), top: Math.min(...bounds.map(({box}) => box.top)),
          width: Math.max(...bounds.map(({box}) => box.left + box.width)) - Math.min(...bounds.map(({box}) => box.left)),
          height: Math.max(...bounds.map(({box}) => box.top + box.height)) - Math.min(...bounds.map(({box}) => box.top)),
        }
        if (direction.startsWith('distribute')) {
          const horizontal = direction === 'distribute-x', axis = horizontal ? 'left' : 'top', size = horizontal ? 'width' : 'height'
          bounds.sort((a,b) => a.box[axis] - b.box[axis])
          const first = bounds[0].box[axis], last = bounds.at(-1).box
          const gap = (last[axis] + last[size] - first - bounds.reduce((sum,{box}) => sum + box[size],0)) / (bounds.length - 1)
          let position = first
          for (const {object,box} of bounds) { object.set(axis, object[axis] + position - box[axis]); object.setCoords(); position += box[size] + gap }
        } else {
        const groupIds=new Set(objects.map(o=>source.get(o.studioId)?.groupId))
        const asGroup=target==='page'&&objects.length>1&&groupIds.size===1&&!groupIds.has(undefined)
        const union=asGroup?{left:Math.min(...bounds.map(b=>b.box.left)),top:Math.min(...bounds.map(b=>b.box.top)),right:Math.max(...bounds.map(b=>b.box.left+b.box.width)),bottom:Math.max(...bounds.map(b=>b.box.top+b.box.height))}:null
        for (const entry of bounds) {
          const {object}=entry,box=union?{left:union.left,top:union.top,width:union.right-union.left,height:union.bottom-union.top}:entry.box
          const dx = { left: reference.left - box.left, center: reference.left + reference.width / 2 - box.left - box.width / 2, right: reference.left + reference.width - box.left - box.width }[direction] ?? 0
          const dy = { top: reference.top - box.top, middle: reference.top + reference.height / 2 - box.top - box.height / 2, bottom: reference.top + reference.height - box.top - box.height }[direction] ?? 0
          object.set({ left: object.left + dx, top: object.top + dy }); object.setCoords()
        }
        }
        // Validate before recording; rollback all object coordinates on invalid limits.
        try { validateCandidate(snapshot()) } catch (error) { for (const object of objects) { object.set(positions.get(object)); object.setCoords() }; editor.selectMany(ids); throw error }
        editor.selectMany(ids); canvas.requestRenderAll(); changed()
      })
    },
    add(type, extra) {
      writable()
      return enqueue(async () => {
        writable()
        const occupied = new Set((allObjects?.() ?? snapshot().objects).map(object => object.id))
        let ordinal = 1
        while (occupied.has(`object-${ordinal}`)) ordinal++
        const next = validateCandidate(appendObject(snapshot(), type, {id: `object-${ordinal}`, ...extra}))
        const item = next.objects.at(-1), object = await build(item)
        if (destroyed) { object.dispose(); return }
        try{writable();validateCandidate(next)}catch(error){object.dispose();throw error}
        source.set(item.id, item); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); changed()
      })
    },
    patch(patch) {
      writable()
      patch={...patch}
      for(const end of ['start','end'])if(patch[end+'Arrow']!==undefined&&patch[end+'Cap']===undefined)patch[end+'Cap']=patch[end+'Arrow']?'arrow':'none'
      let object = canvas.getActiveObject()
      if (!object?.studioId) return
      const original = source.get(object.studioId)
      if(patch.fill!==undefined&&original.fillPaint?.type==='solid'&&patch.fillPaint===undefined)patch.fillPaint={type:'solid',color:patch.fill}
      if (original.locked && Object.keys(patch).some(key => !['locked', 'hidden'].includes(key))) return
      const next = validateCandidate({ ...snapshot(), objects: snapshot().objects.map(item => item.id === object.studioId ? mergePatch(item,patch) : item) })
      let item = next.objects.find(item => item.id === object.studioId)
      if(SHAPE_TYPES.includes(item.type)&&(item.fillPaint||item.shape||original.fillPaint||original.shape))return enqueue(async()=>{
        writable()
        object=canvas.getObjects().find(o=>o.studioId===original.id)
        if(!object)throw Error('La forma ya no existe.')
        if(source.get(original.id)?.locked&&Object.keys(patch).some(k=>!['locked','hidden'].includes(k)))throw Error('La forma est\u00e1 bloqueada.')
        item=validateCandidate({...snapshot(),objects:snapshot().objects.map(o=>o.id===original.id?mergePatch(o,patch):o)}).objects.find(o=>o.id===original.id)
        const fingerprint=JSON.stringify(snapshot().objects.find(o=>o.id===original.id))
        if(object instanceof StudioPhoto&&photoFileId(item)===photoFileId(source.get(item.id))){
          object.set({left:item.x,top:item.y,angle:item.rotation,fill:item.fill,scaleX:1,scaleY:1,...flags(item)})
          object.configure(item);source.set(item.id,item);object.setCoords();canvas.requestRenderAll();changed();return
        }
        await authorizePaste?.([item]);const replacement=await build(item)
        try{writable();if(destroyed||JSON.stringify(snapshot().objects.find(o=>o.id===original.id))!==fingerprint)throw Error('La forma cambi\u00f3 durante la operaci\u00f3n.')
          const index=canvas.getObjects().indexOf(object);canvas.discardActiveObject();canvas.remove(object);object.dispose();source.set(item.id,item);canvas.insertAt(index,replacement);editor.select(item.id);canvas.requestRenderAll();changed()
        }catch(error){replacement.dispose();throw error}
      })
      if (item.type === 'text' && (item.fontFamily !== original.fontFamily || item.fontVariant !== original.fontVariant)) return enqueue(async () => {
        await ensureStudioFont(item.fontFamily,item.fontVariant); writable()
        if (destroyed || !canvas.getObjects().includes(object)) return
        // Preserve intervening edits and selection while the font downloads.
        const latest=source.get(item.id)
        if(latest.locked)return
        const refreshed=validateCandidate({...snapshot(),objects:snapshot().objects.map(current=>current.id===item.id?{...current,...patch}:current)}).objects.find(current=>current.id===item.id)
        applyItem(object,refreshed,patch)
      })
      applyItem(object,item,patch)
    },
    remove() {
      writable()
      const objects = canvas.getActiveObjects().filter(object => !source.get(object.studioId)?.locked)
      if (!objects.length) return
      canvas.discardActiveObject(); canvas.remove(...objects)
      objects.forEach(object => { source.delete(object.studioId); object.dispose() })
      canvas.requestRenderAll(); changed()
    },
    copy() {
      const ids = new Set(canvas.getActiveObjects().map(object => object.studioId))
      clipboard = snapshot().objects.filter(item => ids.has(item.id))
      sharedClipboard?.write(snapshot(), clipboard)
      onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    },
    paste() {
      writable()
      return enqueue(async () => {
        if (sharedClipboard) clipboard = sharedClipboard.read()
        if (!clipboard.length) return
        await authorizePaste?.(clipboard)
        writable()
        let next = snapshot()
        const groupIds=new Map(),occupiedGroupIds=new Set((allObjects?.()??next.objects).flatMap(object=>[object.groupId,object.id]).filter(Boolean))
        for (const item of clipboard) {
          const properties = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))
          if(properties.groupId){if(!groupIds.has(properties.groupId)){let n=1;while(occupiedGroupIds.has(`group-${n}`))n++;const groupId=`group-${n}`;occupiedGroupIds.add(groupId);groupIds.set(properties.groupId,groupId)}properties.groupId=groupIds.get(properties.groupId)}
          const id = `clip-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
          next = appendObject(next, item.type, { ...properties, id, x: item.x + 20, y: item.y + 20, locked: false, hidden: false })
        }
        await restore(next,true); editor.select(next.objects.at(-1).id); changed()
      })
    },
    duplicate() { editor.copy(); return editor.paste() },
    order(direction) {
      writable()
      const object = canvas.getActiveObject()
      if (!object?.studioId || source.get(object.studioId)?.locked) return
      const objects = canvas.getObjects(), index = objects.indexOf(object)
      const target = { front: objects.length - 1, back: 0, up: index + 1, down: index - 1 }[direction]
      canvas.moveObjectTo(object, Math.max(0, Math.min(objects.length - 1, target))); canvas.requestRenderAll(); changed()
    },
    undo() { writable(); return enqueue(() => travelHistory('undo')) },
    redo() { writable(); return enqueue(() => travelHistory('redo')) },
    // options: scale (resolution multiplier), transparent (PNG without page
    // background), bleed (px rendered beyond each page edge, for print).
    async exportImage(format = 'png', quality = 0.9, reviewedScene, { scale = 1, transparent = false, bleed = 0,signal } = {}) {
      checkAbort(signal)
      await abortable(editor.flush(),signal)
      return enqueue(async () => {
        checkAbort(signal)
        if (!['png','jpg'].includes(format) || !Number.isFinite(quality) || quality < 0.1 || quality > 1) throw new Error('Formato o calidad no válidos.')
        const dimensions=exportDimensions(current.page,scale,bleed)
        if(reviewedScene && JSON.stringify(snapshot())!==JSON.stringify(validateCandidate(reviewedScene)))throw new Error('El diseño cambió. Vuelve a descargar para revisar los créditos actualizados.')
        exportingNow = true; editor.setReadOnly(protectedMode)
        try {
        for(const item of snapshot().objects.filter(item=>item.type==='text')) await abortable(ensureStudioFont(item.fontFamily,item.fontVariant),signal)
        // Refresh every original capability before rendering; a cached bitmap is not fresh authorization.
        for (const id of documentAssetIds(snapshot())) {
          try { const original = await FabricImage.fromURL(await abortable(resolveImage(id,signal),signal), { crossOrigin: 'anonymous',signal }); original.dispose() }
          catch (error) { checkAbort(signal);throw error?.status ? error : new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
        }
        checkAbort(signal)
        canvas.discardActiveObject()
        const background = canvas.backgroundColor
        if (transparent && format === 'png') canvas.backgroundColor = null
        canvas.renderAll()
        let output
        try { output = canvas.toCanvasElement(scale, { left: -bleed, top: -bleed, width:dimensions.width/scale, height:dimensions.height/scale }) }
        finally { canvas.backgroundColor = background; canvas.renderAll() }
        try{
          checkAbort(signal)
          if(format==='jpg'){const ctx=output.getContext('2d');ctx.save();ctx.globalCompositeOperation='destination-over';ctx.fillStyle=current.page.background;ctx.fillRect(0,0,output.width,output.height);ctx.restore()}
          const blob=await new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseño.')), format === 'jpg' ? 'image/jpeg' : 'image/png', quality))
          checkAbort(signal);return blob
        }finally{output.width=0;output.height=0}
        } finally { exportingNow = false; editor.setReadOnly(protectedMode) }
      })
    },
    async thumbnail(signal) {
      await editor.flush(); checkAbort(signal)
      const output = canvas.toCanvasElement(Math.min(1, 256 / Math.max(current.page.width, current.page.height)))
      try {
        const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'))
        checkAbort(signal)
        if (!blob) throw Error('No se pudo generar la miniatura.')
        return blob
      } finally { output.width = output.height = 0 }
    },
    exportPng() { return editor.exportImage('png') },
    async destroy() { destroyed = true; await queue; await canvas.dispose() },
  }
  return editor
}
