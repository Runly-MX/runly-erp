import { Canvas, Rect, Ellipse, Textbox, FabricImage } from 'fabric'
import { appendObject, validateDocument } from '../../../../../shared/studio/document.js'
import { createDocumentHistory } from './document-history.js'

// Fabric owns interaction; only the canonical Runly scene enters history or storage.
export async function createStudioEditor(element, { document, resolveImage, onChange, onSelection, onError, onHistory }) {
  let current = validateDocument(document), destroyed = false, history, clipboard = []
  let queue = Promise.resolve()
  const canvas = new Canvas(element, { width: current.page.width, height: current.page.height,
    backgroundColor: current.page.background, preserveObjectStacking: true })
  const source = new Map()
  const flags = item => ({ visible: !item.hidden, selectable: !item.locked, evented: !item.locked,
    lockMovementX: item.locked, lockMovementY: item.locked, lockScalingX: item.locked, lockScalingY: item.locked,
    lockRotation: item.locked, editable: !item.locked })
  async function build(item) {
    const options = { left: item.x, top: item.y, angle: item.rotation, fill: item.fill, originX: 'left', originY: 'top' }
    let object
    if (item.type === 'text') object = new Textbox(item.text, { ...options, width: item.width, fontSize: item.fontSize, fontFamily: 'sans-serif', scaleX: item.scaleX, scaleY: item.scaleY })
    else if (item.type === 'rectangle') object = new Rect({ ...options, width: item.width, height: item.height })
    else if (item.type === 'ellipse') object = new Ellipse({ ...options, rx: item.width / 2, ry: item.height / 2 })
    else {
      object = await FabricImage.fromURL(await resolveImage(item.fileAssetId), { crossOrigin: 'anonymous' })
      object.set({ ...options, scaleX: item.width / object.width, scaleY: item.height / object.height })
    }
    object.studioId = item.id
    object.set({ ...flags(item), lockScalingFlip: true, minScaleLimit: 0.02 })
    return object
  }
  function snapshot() {
    if (canvas.getActiveObject()?.type === 'activeselection') canvas.discardActiveObject()
    return validateDocument({ ...current, objects: canvas.getObjects().map(object => {
      const item = source.get(object.studioId)
      return { ...item, x: object.left, y: object.top, width: Math.max(1, object.width * object.scaleX),
        height: Math.max(1, object.height * object.scaleY), rotation: object.angle % 360, fill: object.fill,
        ...(item.type === 'text' ? { text: object.text, fontSize: object.fontSize, width: object.width, height: object.height, scaleX: object.scaleX, scaleY: object.scaleY } : {}) }
    }) })
  }
  function selected() {
    const object = canvas.getActiveObject()
    return object?.studioId ? snapshot().objects.find(item => item.id === object.studioId) : null
  }
  function selection() { onSelection?.(selected()) }
  function changed(record = true) {
    try {
      const document = snapshot()
      if (record) history.commit(document)
      onChange?.(document); selection(); onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    } catch (error) { onError?.(error.message) }
  }
  async function restore(document) {
    const next = validateDocument(document), objects = []
    try { for (const item of next.objects) objects.push(await build(item)) }
    catch (error) { objects.forEach(object => object.dispose()); throw error }
    if (destroyed) { objects.forEach(object => object.dispose()); return }
    canvas.discardActiveObject(); canvas.getObjects().forEach(object => { canvas.remove(object); object.dispose() })
    current = next; source.clear(); next.objects.forEach(item => source.set(item.id, item))
    canvas.add(...objects); canvas.backgroundColor = next.page.background; canvas.requestRenderAll()
  }
  function enqueue(action) {
    const task = queue.then(() => destroyed ? undefined : action())
    queue = task.catch(() => {})
    return task
  }
  try { await restore(current) } catch (error) { await canvas.dispose(); throw error }
  history = createDocumentHistory(snapshot())
  onHistory?.(history.state())
  // Only committed transforms enter history; pointer moves do not create entries.
  canvas.on('object:modified', () => changed())
  canvas.on('text:changed', () => changed())
  for (const event of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(event, selection)
  const editor = {
    snapshot,
    flush: () => queue,
    select(id) {
      const object = canvas.getObjects().find(item => item.studioId === id)
      if (object) { canvas.setActiveObject(object); canvas.requestRenderAll(); selection() }
    },
    add(type, extra) {
      return enqueue(async () => {
        const item = appendObject(snapshot(), type, extra).objects.at(-1), object = await build(item)
        if (destroyed) { object.dispose(); return }
        source.set(item.id, item); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); changed()
      })
    },
    patch(patch) {
      const object = canvas.getActiveObject()
      if (!object?.studioId) return
      const original = source.get(object.studioId)
      if (original.locked && Object.keys(patch).some(key => !['locked', 'hidden'].includes(key))) return
      const next = validateDocument({ ...snapshot(), objects: snapshot().objects.map(item => item.id === object.studioId ? { ...item, ...patch } : item) })
      const item = next.objects.find(item => item.id === object.studioId)
      object.set({ left: item.x, top: item.y, angle: item.rotation, fill: item.fill, ...flags(item) })
      if (item.type === 'text') object.set({ text: item.text, fontSize: item.fontSize, width: item.width, scaleX: item.scaleX, scaleY: item.scaleY })
      else {
        if (patch.width !== undefined) object.set({ scaleX: item.width / object.width })
        if (patch.height !== undefined) object.set({ scaleY: item.height / object.height })
      }
      source.set(item.id, item); object.setCoords(); canvas.requestRenderAll(); changed()
    },
    remove() {
      const objects = canvas.getActiveObjects().filter(object => !source.get(object.studioId)?.locked)
      if (!objects.length) return
      canvas.discardActiveObject(); canvas.remove(...objects)
      objects.forEach(object => { source.delete(object.studioId); object.dispose() })
      canvas.requestRenderAll(); changed()
    },
    copy() {
      const ids = new Set(canvas.getActiveObjects().map(object => object.studioId))
      clipboard = snapshot().objects.filter(item => ids.has(item.id))
      onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    },
    paste() {
      return enqueue(async () => {
        if (!clipboard.length) return
        let next = snapshot()
        for (const item of clipboard) {
          const properties = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))
          next = appendObject(next, item.type, { ...properties, x: item.x + 20, y: item.y + 20, locked: false, hidden: false })
        }
        await restore(next); editor.select(next.objects.at(-1).id); changed()
      })
    },
    duplicate() { editor.copy(); return editor.paste() },
    order(direction) {
      const object = canvas.getActiveObject()
      if (!object?.studioId || source.get(object.studioId)?.locked) return
      const objects = canvas.getObjects(), index = objects.indexOf(object)
      const target = { front: objects.length - 1, back: 0, up: index + 1, down: index - 1 }[direction]
      canvas.moveObjectTo(object, Math.max(0, Math.min(objects.length - 1, target))); canvas.requestRenderAll(); changed()
    },
    undo() { return enqueue(async () => { const next = history.peek('undo'); if (next) { await restore(next); history.move('undo'); changed(false) } }) },
    redo() { return enqueue(async () => { const next = history.peek('redo'); if (next) { await restore(next); history.move('redo'); changed(false) } }) },
    exportPng() {
      return enqueue(async () => {
        canvas.discardActiveObject(); canvas.renderAll()
        return new Promise((resolve, reject) => canvas.toCanvasElement(1).toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseño.')), 'image/png'))
      })
    },
    async destroy() { destroyed = true; await queue; await canvas.dispose() },
  }
  return editor
}
