import { Canvas, Rect, Ellipse, Textbox, FabricImage } from 'fabric'
import { appendObject, validateDocument } from '../../../../../shared/studio/document.js'

// Fabric owns interaction only. The persisted scene never contains Fabric JSON.
export async function createStudioEditor(element, { document, resolveImage, onChange, onSelection, onError }) {
  let current = validateDocument(document), destroyed = false
  const canvas = new Canvas(element, { width: current.page.width, height: current.page.height,
    backgroundColor: current.page.background, preserveObjectStacking: true })
  const source = new Map()

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
    object.set({ lockScalingFlip: true, minScaleLimit: 0.02 })
    source.set(item.id, item)
    return object
  }
  function snapshot() {
    // ActiveSelection stores child transforms relative to its temporary group.
    // Discard before snapshotting to recover page coordinates.
    const active = canvas.getActiveObject()
    if (active?.type === 'activeselection') canvas.discardActiveObject()
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
  function changed() {
    try { onChange?.(snapshot()); onSelection?.(selected()) } catch (error) { onError?.(error.message) }
  }
  function selection() { onSelection?.(selected()) }
  try {
    for (const item of current.objects) canvas.add(await build(item))
  } catch (error) { await canvas.dispose(); throw error }
  canvas.on('object:modified', changed)
  canvas.on('text:changed', changed)
  for (const event of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(event, selection)
  canvas.requestRenderAll()

  return {
    snapshot,
    select(id) {
      const object = canvas.getObjects().find(item => item.studioId === id)
      if (object) { canvas.setActiveObject(object); canvas.requestRenderAll() }
    },
    async add(type, extra) {
      if (destroyed) return
      const next = appendObject(snapshot(), type, extra), item = next.objects.at(-1)
      const object = await build(item)
      if (destroyed) return
      canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); changed()
    },
    patch(patch) {
      const object = canvas.getActiveObject()
      if (!object?.studioId) return
      const next = validateDocument({ ...snapshot(), objects: snapshot().objects.map(item => item.id === object.studioId ? { ...item, ...patch } : item) })
      const item = next.objects.find(item => item.id === object.studioId)
      object.set({ left: item.x, top: item.y, angle: item.rotation, fill: item.fill })
      if (item.type === 'text') {
        object.set({ text: item.text, fontSize: item.fontSize, width: item.width, scaleX: item.scaleX, scaleY: item.scaleY })
      } else {
        if (patch.width !== undefined) object.set({ scaleX: item.width / object.width })
        if (patch.height !== undefined) object.set({ scaleY: item.height / object.height })
      }
      source.set(item.id, item); object.setCoords(); canvas.requestRenderAll(); changed()
    },
    remove() {
      const objects = canvas.getActiveObjects()
      canvas.discardActiveObject(); canvas.remove(...objects); canvas.requestRenderAll(); changed()
    },
    exportPng() {
      canvas.discardActiveObject(); canvas.renderAll()
      return new Promise((resolve, reject) => canvas.toCanvasElement(1).toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseño.')), 'image/png'))
    },
    async destroy() { destroyed = true; await canvas.dispose() },
  }
}
