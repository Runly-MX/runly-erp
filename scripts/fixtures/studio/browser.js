import { createStudioEditor } from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import { Canvas2DRenderer } from '../../../apps/desktop/src/modules/runly.canvas/engine/Canvas2DRenderer.js'
import { LIGHT_THEME } from '../../../apps/desktop/src/modules/runly.canvas/engine/theme.js'
import { appendObject, blankDocument } from '../../../apps/shared/studio/document.js'

const fileId = '00000000-0000-4000-8000-000000000005'
window.studioVerification = async () => {
  const element = () => { const canvas = document.createElement('canvas'); document.body.append(canvas); return canvas }
  const original = document.createElement('canvas'); original.width = 40; original.height = 24
  original.getContext('2d').fillStyle = '#f59e0b'; original.getContext('2d').fillRect(0, 0, 40, 24)
  const imageUrl = original.toDataURL()
  const resolveImage = async () => imageUrl
  let editor = await createStudioEditor(element(), { document: blankDocument(640, 480), resolveImage })
  await editor.add('text', { text: 'Diseño editable', x: 10, y: 10 })
  editor.patch({ text: 'Texto modificado', x: 24, y: 30, rotation: 12, scaleX: 1.4, scaleY: 0.8 })
  await editor.add('rectangle', { x: 30, y: 300, width: 100, height: 80, fill: '#2563eb' })
  await editor.add('ellipse', { x: 300, y: 300, width: 100, height: 80 })
  await editor.add('image', { x: 450, y: 50, width: 80, height: 48, fileAssetId: fileId })
  const saved = JSON.parse(JSON.stringify(editor.snapshot()))
  const beforeBlob = await editor.exportPng()
  await editor.destroy()
  editor = await createStudioEditor(element(), { document: saved, resolveImage })
  const reopened = editor.snapshot(), exported = await editor.exportPng()
  const png = await createImageBitmap(exported)
  const pixels = document.createElement('canvas'); pixels.width = png.width; pixels.height = png.height
  const ctx = pixels.getContext('2d'); ctx.drawImage(png, 0, 0)
  const result = { saved, reopened, png: { width: png.width, height: png.height, bytes: exported.size,
    blue: [...ctx.getImageData(50, 320, 1, 1).data], image: [...ctx.getImageData(470, 70, 1, 1).data] },
    identicalPng: beforeBlob.size === exported.size }
  png.close()
  for (const [index, patch] of [[0, { text: 'Cambio para historial', x: 90 }], [1, { width: 180, rotation: 30 }], [3, { width: 200, rotation: 45 }]]) {
    const before = editor.snapshot()
    editor.select(before.objects[index].id); editor.patch(patch)
    const after = editor.snapshot()
    await editor.undo()
    if (JSON.stringify(editor.snapshot()) !== JSON.stringify(before)) throw Error('history did not restore object properties')
    await editor.redo()
    if (JSON.stringify(editor.snapshot()) !== JSON.stringify(after)) throw Error('redo lost object properties')
    await editor.undo()
  }
  editor.select(saved.objects[1].id)
  await editor.duplicate()
  const duplicate = editor.snapshot().objects.at(-1)
  if (duplicate.id === saved.objects[1].id || editor.snapshot().objects.length !== 5) throw Error('duplicate failed')
  await editor.undo()
  if (editor.snapshot().objects.length !== 4) throw Error('undo duplicate failed')
  await editor.redo()
  if (editor.snapshot().objects.length !== 5) throw Error('redo duplicate failed')
  editor.select(duplicate.id); editor.order('back')
  if (editor.snapshot().objects[0].id !== duplicate.id) throw Error('layer ordering failed')
  editor.order('front'); editor.order('down')
  if (editor.snapshot().objects.at(-2).id !== duplicate.id) throw Error('lower layer failed')
  editor.order('up')
  if (editor.snapshot().objects.at(-1).id !== duplicate.id) throw Error('raise layer failed')
  editor.order('back')
  editor.patch({ locked: true }); editor.patch({ x: 999 })
  if (editor.snapshot().objects[0].x === 999) throw Error('locked transform changed')
  editor.patch({ locked: false, hidden: true })
  if (!editor.snapshot().objects[0].hidden) throw Error('visibility lost')
  await editor.undo()
  if (editor.snapshot().objects[0].hidden) throw Error('undo visibility failed')
  result.historyAndLayers = true
  await editor.destroy()
  let imageFailure
  try {
    await createStudioEditor(element(), { document: appendObject(blankDocument(), 'image', { fileAssetId: fileId }),
      resolveImage: async () => 'data:image/png;base64,bm90LWFuLWltYWdl#token=private-test-value' })
  } catch (error) { imageFailure = error.message }
  if (!imageFailure || imageFailure.includes('token=') || imageFailure.includes('data:')) throw Error('image failure exposed its URL')
  result.safeImageErrors = true
  const benchmarks = []
  for (const count of [20, 200, 500]) {
    const doc = blankDocument(1080, 1080)
    for (let n = 0; n < count; n++) doc.objects.push({ id: `o${n}`, type: n % 5 === 0 ? 'text' : n % 2 ? 'ellipse' : 'rectangle',
      x: (n % 20) * 45, y: Math.floor(n / 20) * 35, width: 40, height: 24, rotation: 0, fill: '#2563eb',
      ...(n % 5 === 0 ? { text: 'Runly', fontSize: 10, fontFamily: 'sans-serif' } : {}) })
    let start = performance.now()
    editor = await createStudioEditor(element(), { document: doc, resolveImage })
    const fabricOpenMs = performance.now() - start
    start = performance.now(); const png = await editor.exportPng(); const fabricExportMs = performance.now() - start
    await editor.destroy()
    const canvas = element(), renderer = new Canvas2DRenderer(canvas)
    renderer.setTheme(LIGHT_THEME); renderer.resize(1080, 1080, 1)
    const objects = doc.objects.map(item => ({ id: item.id, type: item.type, transform: { x: item.x, y: item.y, rotation: item.rotation, scaleX: 1, scaleY: 1 },
      geometry: { width: item.width, height: item.height }, style: { fill: item.fill, strokeWidth: 0, fontSize: item.fontSize }, properties: { text: item.text } }))
    const scene = { objects, viewport: { x: 0, y: 0, zoom: 1 }, selectedIds: new Set(), images: new Map(), grid: { enabled: false }, background: '#ffffff' }
    start = performance.now(); renderer.render(scene); const canvasRenderMs = performance.now() - start
    start = performance.now(); await new Promise(resolve => canvas.toBlob(resolve)); const canvasEncodeMs = performance.now() - start
    benchmarks.push({ count, fabricOpenMs, fabricExportMs, pngBytes: png.size, canvasRenderMs, canvasEncodeMs })
    canvas.remove()
  }
  return { ...result, benchmarks }
}
