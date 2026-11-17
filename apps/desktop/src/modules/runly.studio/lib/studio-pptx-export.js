// PowerPoint export in the browser: pptx-build assembles editable elements; this module
// supplies the assets with the design's existing authorization: original photo bytes
// (embedded as binaries, never URLs), one image per object PowerPoint cannot represent
// (rendered by the editor's own renderer and cropped to the object) and, optionally, the
// Phase 4 MP4 of the whole selection on an extra slide.
import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { findPage, replacePage } from '../../../../../shared/studio/pages.js'
import { checkAbort } from '../../../../../shared/studio/abort.js'
import { buildPptx } from './pptx-build.js'
import { exportMotion } from './studio-motion-export.js'

const SCALED = new Set(['text', 'line'])
const dataUrl = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob) })
const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(value => (value ? resolve(value) : reject(Error('No se pudo preparar una imagen.'))), 'image/png'))
// PowerPoint reads PNG, JPEG and GIF; other formats (WebP) are re-encoded as PNG.
async function officeImage(blob) {
  if (/^image\/(png|jpeg|gif)$/.test(blob.type)) return blob
  const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas')
  canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close()
  try { return await toBlob(canvas) } finally { canvas.width = canvas.height = 0 }
}
// Axis-aligned box of a rotated object, padded for strokes and shadows, inside the page.
function objectBox(item, page) {
  const w = SCALED.has(item.type) ? item.width * (item.scaleX ?? 1) : item.width, h = SCALED.has(item.type) ? item.height * (item.scaleY ?? 1) : item.height
  const r = (item.rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [item.x + x * c - y * s, item.y + x * s + y * c])
  const shadow = item.image?.shadow ?? item.fillPaint?.image?.shadow
  const pad = 2 + (item.shape?.strokeWidth ?? item.image?.border?.width ?? item.strokeWidth ?? 0) + (shadow ? shadow.blur * 2 + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY)) : 0)
  const x0 = Math.max(0, Math.min(...corners.map(p => p[0])) - pad), y0 = Math.max(0, Math.min(...corners.map(p => p[1])) - pad)
  const x1 = Math.min(page.width, Math.max(...corners.map(p => p[0])) + pad), y1 = Math.min(page.height, Math.max(...corners.map(p => p[1])) + pad)
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

// design: the reviewed Studio document; pages: metadata of the exported pages in order.
export async function exportPptx({ editor, design, pages, options = {}, signal, onProgress = () => {}, title }) {
  const pageIds = pages.map(page => page.id), originals = new Map()
  const render = (scene, objects, settings) => editor.exportVariant(scene.page.id, design, replacePage(design, { page: scene.page, objects }), 'png', 1, { signal, ...settings })
  const assets = {
    image(assetId) {
      if (!originals.has(assetId)) originals.set(assetId, editor.imageBlob(assetId, signal).then(officeImage).then(dataUrl))
      return originals.get(assetId)
    },
    async raster(item, scene) {
      const scale = Math.max(scene.page.width, scene.page.height) <= 2048 ? 2 : 1, box = objectBox(item, scene.page)
      const bitmap = await createImageBitmap(await render(scene, [item], { scale, transparent: true }))
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(box.width * scale); canvas.height = Math.ceil(box.height * scale)
      canvas.getContext('2d').drawImage(bitmap, box.x * scale, box.y * scale, box.width * scale, box.height * scale, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      try { return { data: await dataUrl(await toBlob(canvas)), box } } finally { canvas.width = canvas.height = 0 }
    },
    async background(scene) { return dataUrl(await render(scene, [], { scale: 1 })) },
  }
  let video = null
  if (options.video) {
    const motion = await exportMotion({ editor, document: design, pages, options: { type: 'mp4', side: 1280, fps: 30, quality: 'standard' }, signal, onProgress: value => onProgress(value, 'encoding') })
    checkAbort(signal)
    const first = findPage(design, pageIds[0])
    const cover = await dataUrl(await render(first, first.objects, { scale: Math.min(1, 1280 / Math.max(first.page.width, first.page.height)) }))
    video = { data: (await dataUrl(motion.blob)).replace(/^data:/, ''), cover, width: motion.plan.width, height: motion.plan.height }
  }
  const { data, report } = await buildPptx({ PptxGenJS, JSZip, document: design, pageIds, title, assets, video, signal, onProgress: value => onProgress(value, 'rendering') })
  return { blob: data, extension: 'pptx', report }
}
