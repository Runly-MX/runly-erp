// One image of ONE object, drawn by the editor's own renderer and cropped to that object
// (PowerPoint and Website exports use it only for objects without an editable equivalent).
import { replacePage } from '../../../../../shared/studio/pages.js'
import { objectSize } from '../../../../../shared/studio/object-kinds.js'

export const blobToDataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) })
export const canvasToPng = canvas => new Promise((resolve, reject) => canvas.toBlob(value => (value ? resolve(value) : reject(Error('No se pudo preparar una imagen.'))), 'image/png'))

// Axis-aligned box of a rotated object, padded for strokes and shadows, inside the page.
export function objectBox(item, page) {
  const { w, h } = objectSize(item)
  const r = (item.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [item.x + x * c - y * s, item.y + x * s + y * c])
  const shadow = item.image?.shadow ?? item.fillPaint?.image?.shadow
  const pad = 2 + (item.shape?.strokeWidth ?? item.image?.border?.width ?? item.strokeWidth ?? 0) + (shadow ? shadow.blur * 2 + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY)) : 0)
  const x0 = Math.max(0, Math.min(...corners.map(p => p[0])) - pad), y0 = Math.max(0, Math.min(...corners.map(p => p[1])) - pad)
  const x1 = Math.min(page.width, Math.max(...corners.map(p => p[0])) + pad), y1 = Math.min(page.height, Math.max(...corners.map(p => p[1])) + pad)
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

// → { blob (PNG), box (page px) }. Scale 2 for pages up to 2048 px on their long side.
export async function rasterizeObject({ editor, design, scene, item, signal }) {
  const scale = Math.max(scene.page.width, scene.page.height) <= 2048 ? 2 : 1, box = objectBox(item, scene.page)
  const rendered = await editor.exportVariant(scene.page.id, design, replacePage(design, { page: scene.page, objects: [item] }), 'png', 1, { signal, scale, transparent: true })
  const bitmap = await createImageBitmap(rendered), canvas = document.createElement('canvas')
  canvas.width = Math.ceil(box.width * scale); canvas.height = Math.ceil(box.height * scale)
  canvas.getContext('2d').drawImage(bitmap, box.x * scale, box.y * scale, box.width * scale, box.height * scale, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  try { return { blob: await canvasToPng(canvas), box } } finally { canvas.width = canvas.height = 0 }
}
