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
import { blobToDataUrl as dataUrl, canvasToPng as toBlob, rasterizeObject } from './object-raster.js'

// PowerPoint reads PNG, JPEG and GIF; other formats (WebP) are re-encoded as PNG.
async function officeImage(blob) {
  if (/^image\/(png|jpeg|gif)$/.test(blob.type)) return blob
  const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas')
  canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close()
  try { return await toBlob(canvas) } finally { canvas.width = canvas.height = 0 }
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
      const { blob, box } = await rasterizeObject({ editor, design, scene, item, signal })
      return { data: await dataUrl(blob), box }
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
