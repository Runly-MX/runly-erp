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
  png.close(); await editor.destroy()
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
