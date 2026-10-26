import { Canvas, Rect, Ellipse, Textbox, FabricImage, ActiveSelection, Group, Path } from 'fabric'
import { appendObject, validateDocument } from '../../../../../shared/studio/document.js'
import { resizeDocument } from '../../../../../shared/studio/page.js'
import { createDocumentHistory } from './document-history.js'
import { ensureStudioFont } from './studio-fonts.js'

// Fabric owns interaction; only the canonical Runly scene enters history or storage.
export async function createStudioEditor(element, { document, resolveImage, onChange, onSelection, onError, onHistory, onPointer, readOnly = false, sharedClipboard, authorizePaste }) {
  let protectedMode = readOnly, exportingNow = false
  const writable = () => {
    if (protectedMode) throw new Error('Diseño de solo lectura.')
    if (exportingNow) throw new Error('Espera a que termine la exportación.')
  }
  let current = validateDocument(document), destroyed = false, history, clipboard = []
  let queue = Promise.resolve()
  const canvas = new Canvas(element, { width: current.page.width, height: current.page.height,
    backgroundColor: current.page.background, preserveObjectStacking: true, enableRetinaScaling: false })
  const source = new Map()
  const flags = item => ({ visible: !item.hidden, selectable: !item.locked, evented: !item.locked,
    lockMovementX: item.locked || protectedMode || exportingNow, lockMovementY: item.locked || protectedMode || exportingNow, lockScalingX: item.locked || protectedMode || exportingNow, lockScalingY: item.locked || protectedMode || exportingNow,
    lockRotation: item.locked || protectedMode || exportingNow, editable: !item.locked && !protectedMode && !exportingNow })
  async function build(item) {
    const options = { left: item.x, top: item.y, angle: item.rotation, fill: item.fill, originX: 'left', originY: 'top' }
    let object
    if (item.type === 'text') {
      await ensureStudioFont(item.fontFamily)
      object = new Textbox(item.text, { ...options, width: item.width, fontSize: item.fontSize, fontFamily: item.fontFamily, fontWeight:400, fontStyle:'normal', scaleX: item.scaleX, scaleY: item.scaleY })
    }
    else if (item.type === 'rectangle') object = new Rect({ ...options, width: item.width, height: item.height })
    else if (item.type === 'ellipse') object = new Ellipse({ ...options, rx: item.width / 2, ry: item.height / 2 })
    else if (item.type === 'vector') {
      const { width,height,paths } = item.geometry
      const shapes = [new Rect({ left:0,top:0,width,height,fill:'transparent',strokeWidth:0 })]
      for (const path of paths) shapes.push(new Path(path.d, { fill:path.fill==='color'?item.fill:null, stroke:path.stroke==='color'?item.fill:null, strokeWidth:path.strokeWidth, strokeLineCap:path.cap, strokeLineJoin:path.join }))
      object = new Group(shapes, { ...options, subTargetCheck:false, interactive:false })
      object.set({ scaleX:item.width/object.width,scaleY:item.height/object.height })
    }
    else {
      try { object = await FabricImage.fromURL(await resolveImage(item.fileAssetId), { crossOrigin: 'anonymous' }) }
      catch { throw new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
      object.set({ ...options, scaleX: item.width / object.width, scaleY: item.height / object.height })
    }
    object.studioId = item.id
    object.set({ ...flags(item), lockScalingFlip: true, minScaleLimit: 0.02 })
    return object
  }
  function snapshot() {
    const stable = (value, original) => Math.abs(value - original) < 1e-8 ? original : value
    return validateDocument({ ...current, objects: canvas.getObjects().map(object => {
      const item = source.get(object.studioId)
      const position = object.getXY(), scaling = object.group ? object.getObjectScaling() : { x: object.scaleX, y: object.scaleY }
      return { ...item, x: stable(position.x, item.x), y: stable(position.y, item.y), width: stable(Math.max(1, object.width * scaling.x), item.width),
        height: stable(Math.max(1, object.height * scaling.y), item.height), rotation: stable(object.getTotalAngle() % 360, item.rotation), fill: object.fill,
        ...(item.type === 'text' ? { text: object.text, fontSize: object.fontSize, width: object.width, height: object.height, scaleX: stable(scaling.x, item.scaleX), scaleY: stable(scaling.y, item.scaleY) } : {}) }
    }) })
  }
  function selected() {
    const object = canvas.getActiveObject()
    return object?.studioId ? snapshot().objects.find(item => item.id === object.studioId) : null
  }
  function selection() {
    const active = canvas.getActiveObject()
    if (active?.type === 'activeselection') active.set({ lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true })
    onSelection?.(selected(), canvas.getActiveObjects().map(object => object.studioId))
  }
  function changed(record = true) {
    try {
      const document = snapshot()
      if (record) history.commit(document)
      onChange?.(document); selection(); onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    } catch (error) { onError?.(error.message) }
  }
  async function restore(document, requiresWrite = false) {
    const next = validateDocument(document), objects = []
    try { for (const item of next.objects) objects.push(await build(item)); if(requiresWrite)writable() }
    catch (error) { objects.forEach(object => object.dispose()); throw error }
    if (destroyed) { objects.forEach(object => object.dispose()); return }
    canvas.discardActiveObject(); canvas.getObjects().forEach(object => { canvas.remove(object); object.dispose() })
    current = next; source.clear(); next.objects.forEach(item => source.set(item.id, item))
    objects.forEach(object=>object.set(flags(source.get(object.studioId))))
    canvas.add(...objects); canvas.setDimensions({ width: next.page.width, height: next.page.height })
    canvas.backgroundColor = next.page.background; canvas.requestRenderAll()
  }
  function enqueue(action) {
    const task = queue.then(() => destroyed ? undefined : action())
    queue = task.catch(() => {})
    return task
  }
  async function travelHistory(direction) {
    writable()
    const next = history.peek(direction)
    if (!next) return
    const ids = canvas.getActiveObjects().map(object => object.studioId)
    await restore(next, true)
    history.move(direction)
    // Restore by stable document IDs, never by disposed Fabric object references.
    const surviving = ids.filter(id => source.has(id) && !source.get(id).hidden)
    if (surviving.length === 1) editor.select(surviving[0])
    else editor.selectMany(surviving)
    changed(false)
  }
  try { await restore(current) } catch (error) { await canvas.dispose(); throw error }
  history = createDocumentHistory(snapshot())
  onHistory?.({ ...history.state(), canPaste: sharedClipboard ? sharedClipboard.read().length > 0 : false })
  // Only committed transforms enter history; pointer moves do not create entries.
  canvas.on('object:modified', () => changed())
  canvas.on('text:changed', () => changed())
  canvas.on('mouse:move', event => { const point = canvas.getScenePoint(event.e); onPointer?.({ x: point.x, y: point.y }) })
  canvas.on('mouse:out', () => onPointer?.(null))
  for (const event of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(event, selection)
  const editor = {
    snapshot,
    flush: () => queue,
    setReadOnly(value) {
      protectedMode = value; canvas.getObjects().forEach(object => object.set(flags(source.get(object.studioId))))
      if (canvas.getActiveObject()?.type === 'activeselection') canvas.getActiveObject().set({ lockMovementX: value || exportingNow, lockMovementY: value || exportingNow })
      canvas.requestRenderAll()
    },
    select(id) {
      const object = canvas.getObjects().find(item => item.studioId === id)
      if (object) { canvas.setActiveObject(object); canvas.requestRenderAll(); selection() }
    },
    selectMany(ids) {
      canvas.discardActiveObject()
      const wanted = new Set(ids)
      const objects = canvas.getObjects().filter(object => wanted.has(object.studioId) && !source.get(object.studioId)?.hidden && !source.get(object.studioId)?.locked)
      if (objects.length === 1) canvas.setActiveObject(objects[0])
      else if (objects.length > 1) canvas.setActiveObject(new ActiveSelection(objects, { canvas, lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true }))
      canvas.requestRenderAll(); selection()
    },
    // Context menu: select what is under the pointer, keeping a multi-selection
    // the pointer is inside of. Returns false on empty canvas.
    pick(event) {
      const target = canvas.findTarget(event)
      if (!target) { canvas.discardActiveObject(); canvas.requestRenderAll(); selection(); return false }
      if (target !== canvas.getActiveObject() && target.studioId) { canvas.setActiveObject(target); canvas.requestRenderAll(); selection() }
      return true
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
        } else for (const {object,box} of bounds) {
          const dx = { left: reference.left - box.left, center: reference.left + reference.width / 2 - box.left - box.width / 2, right: reference.left + reference.width - box.left - box.width }[direction] ?? 0
          const dy = { top: reference.top - box.top, middle: reference.top + reference.height / 2 - box.top - box.height / 2, bottom: reference.top + reference.height - box.top - box.height }[direction] ?? 0
          object.set({ left: object.left + dx, top: object.top + dy }); object.setCoords()
        }
        // Validate before recording; rollback all object coordinates on invalid limits.
        try { validateDocument(snapshot()) } catch (error) { for (const object of objects) { object.set(positions.get(object)); object.setCoords() }; editor.selectMany(ids); throw error }
        editor.selectMany(ids); canvas.requestRenderAll(); changed()
      })
    },
    add(type, extra) {
      writable()
      return enqueue(async () => {
        writable()
        const item = appendObject(snapshot(), type, extra).objects.at(-1), object = await build(item)
        if (destroyed) { object.dispose(); return }
        try{writable()}catch(error){object.dispose();throw error}
        source.set(item.id, item); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); changed()
      })
    },
    patch(patch) {
      writable()
      const object = canvas.getActiveObject()
      if (!object?.studioId) return
      const original = source.get(object.studioId)
      if (original.locked && Object.keys(patch).some(key => !['locked', 'hidden'].includes(key))) return
      const next = validateDocument({ ...snapshot(), objects: snapshot().objects.map(item => item.id === object.studioId ? { ...item, ...patch } : item) })
      const item = next.objects.find(item => item.id === object.studioId)
      if (item.type === 'text' && item.fontFamily !== original.fontFamily) return enqueue(async () => {
        await ensureStudioFont(item.fontFamily); writable()
        if (destroyed || !canvas.getObjects().includes(object)) return
        // Preserve intervening edits and selection while the font downloads.
        const latest=source.get(item.id)
        if(latest.locked)return
        source.set(item.id,{...latest,fontFamily:item.fontFamily})
        object.set({fontFamily:item.fontFamily});object.setCoords();canvas.requestRenderAll();changed()
      })
      object.set({ left: item.x, top: item.y, angle: item.rotation, fill: item.fill, ...flags(item) })
      if(item.type==='vector') object.getObjects().slice(1).forEach((shape,index) => { const path=item.geometry.paths[index];shape.set({fill:path.fill==='color'?item.fill:null,stroke:path.stroke==='color'?item.fill:null}) })
      if (item.type === 'text') object.set({ text: item.text, fontSize: item.fontSize, width: item.width, scaleX: item.scaleX, scaleY: item.scaleY })
      else {
        if (patch.width !== undefined) object.set({ scaleX: item.width / object.width })
        if (patch.height !== undefined) object.set({ scaleY: item.height / object.height })
      }
      source.set(item.id, item); object.setCoords(); canvas.requestRenderAll(); changed()
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
        for (const item of clipboard) {
          const properties = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))
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
    exportImage(format = 'png', quality = 0.9, reviewedScene) {
      return enqueue(async () => {
        if (!['png','jpg'].includes(format) || !Number.isFinite(quality) || quality < 0.1 || quality > 1) throw new Error('Formato o calidad no válidos.')
        if(reviewedScene && JSON.stringify(snapshot())!==JSON.stringify(validateDocument(reviewedScene)))throw new Error('El diseño cambió. Vuelve a descargar para revisar los créditos actualizados.')
        exportingNow = true; editor.setReadOnly(protectedMode)
        try {
        for(const family of new Set(snapshot().objects.filter(item=>item.type==='text').map(item=>item.fontFamily))) await ensureStudioFont(family)
        // Refresh every original capability before rendering; a cached bitmap is not fresh authorization.
        for (const id of new Set(snapshot().objects.filter(item => item.type === 'image').map(item => item.fileAssetId))) {
          try { const original = await FabricImage.fromURL(await resolveImage(id), { crossOrigin: 'anonymous' }); original.dispose() }
          catch { throw new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
        }
        canvas.discardActiveObject(); canvas.renderAll()
        const output = canvas.toCanvasElement(1)
        return await new Promise((resolve, reject) => output.toBlob(blob => { output.width = 0; output.height = 0; blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseño.')) }, format === 'jpg' ? 'image/jpeg' : 'image/png', quality))
        } finally { exportingNow = false; editor.setReadOnly(protectedMode) }
      })
    },
    exportPng() { return editor.exportImage('png') },
    async destroy() { destroyed = true; await queue; await canvas.dispose() },
  }
  return editor
}
