import {documentPages, findPage, replacePage} from '../../../../../shared/studio/pages.js'
import { ZPL_DPI, graphicField, nativeCodes, zplLabel } from './studio-zpl.js'
import { runly } from '../../../lib/runly.js'
import { exportDimensions,STUDIO_EXPORT_LIMITS } from '../../../../../shared/studio/export-limits.js'
import { checkAbort } from '../../../../../shared/studio/abort.js'
import { BULK_PDF_PAGES, BULK_ROWS, fillDocument, rowValues, sheetGrid } from './studio-bulk.js'

// Export presets. Screen formats render in the browser; the print PDF renders
// at 300 ppp in the browser and the API builds the PDF (RGB or CMYK, bleed,
// crop marks), because browsers cannot produce CMYK.
export const PRINT_PPI = 300
export const BLEED_MM = 3
export const SOURCE_PPI = [72, 96, 150, 300]

export const DEFAULT_EXPORT = { type: 'png', scale: 1, transparent: false, quality: 0.9, profile: 'cmyk', ppi: null, bleed: true, cropMarks: false, dpi: 203, printerId: null }
// Pixel presets are screen sizes; large ones (flyers, posters) are print sizes at 150 ppp.
export const defaultPpi = page => page.ppi ?? (Math.max(page.width, page.height) >= 1500 ? 150 : 96)
export const printSizeMm = (page, ppi) => ({ width: Math.round(page.width / ppi * 25.4 * 10) / 10, height: Math.round(page.height / ppi * 25.4 * 10) / 10 })

// Preserve the requested scale exactly or reject it explicitly.
export function safeScale(page, wanted, bleed = 0) {
  exportDimensions(page,wanted,bleed);return wanted
}

// Bulk create: one image per row (ZIP) or every row's pages in one RGB PDF built
// in the browser (the CMYK print job is capped at 24 pages).
export async function exportBulk({ editor, options, scene, signal, onProgress }) {
  const { rows, mapping } = options.bulk, active = editor.activePageId(), images = options.bulk?.images ?? null
  const pageIds = options.type === 'pdf' ? options.pageIds : [active]
  if (!rows?.length || rows.length > BULK_ROWS) throw Error(`El lote admite de 1 a ${BULK_ROWS} filas.`)
  if (!pageIds?.length || pageIds.some(id => !findPage(scene, id))) throw Error('Rango de páginas no válido.')
  if (options.type === 'pdf' && !options.sheet && rows.length * pageIds.length > BULK_PDF_PAGES) throw Error(`El PDF en lote admite como máximo ${BULK_PDF_PAGES} páginas; usa menos filas o páginas.`)
  const firstField = Object.entries(mapping).find(([, header]) => header)?.[1]
  const zip = options.type === 'pdf' ? null : new (await import('jszip')).default()
  const { jsPDF } = options.type === 'pdf' ? await import('jspdf') : {}
  let pdf = null, placed = 0
  // Several labels per letter sheet: every selected page must share one size.
  const sizes = options.sheet ? pageIds.map(id => { const page = findPage(scene, id).page; return printSizeMm(page, options.ppi ?? defaultPpi(page)) }) : null
  if (sizes && sizes.some(size => size.width !== sizes[0].width || size.height !== sizes[0].height)) throw Error('Para varias etiquetas por hoja, todas las páginas deben medir lo mismo.')
  const grid = sizes ? sheetGrid(sizes[0]) : null
  if (sizes && !grid) throw Error('La etiqueta no cabe en una hoja carta.')
  if (grid && rows.length * pageIds.length > BULK_PDF_PAGES * grid.perSheet) throw Error(`Se admiten hasta ${BULK_PDF_PAGES * grid.perSheet} etiquetas por PDF.`)
  for (const [index, row] of rows.entries()) {
    checkAbort(signal)
    const variant = fillDocument(scene, rowValues(row, mapping))
    for (const id of pageIds) {
      const page = findPage(scene, id).page
      if (zip) {
        const blob = await editor.exportVariant(id, scene, variant, options.type, options.type === 'jpg' ? options.quality : 1,
          { scale: safeScale(page, options.scale), transparent: options.type === 'png' && options.transparent, signal, images })
        const label = String(row[firstField] ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 60)
        zip.file(`${String(index + 1).padStart(3, '0')}${label ? `-${label}` : ''}.${options.type}`, blob)
        continue
      }
      const ppi = options.ppi ?? defaultPpi(page), size = printSizeMm(page, ppi), scale = safeScale(page, PRINT_PPI / ppi)
      const pixels = exportDimensions(page, scale)
      if (pixels.width * pixels.height > STUDIO_EXPORT_LIMITS.printPixels) throw Error('Una página supera 32 megapíxeles a 300 ppp.')
      const blob = await editor.exportVariant(id, scene, variant, 'jpg', 0.92, { scale, signal, images })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (grid) {
        const cell = grid.cell(placed++)
        if (!pdf) pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait', compress: true })
        else if (cell.page >= pdf.getNumberOfPages()) pdf.addPage('letter', 'portrait')
        pdf.addImage(bytes, 'JPEG', cell.x, cell.y, size.width, size.height)
        continue
      }
      const orientation = size.width > size.height ? 'landscape' : 'portrait'
      if (pdf) pdf.addPage([size.width, size.height], orientation)
      else pdf = new jsPDF({ unit: 'mm', format: [size.width, size.height], orientation, compress: true })
      pdf.addImage(bytes, 'JPEG', 0, 0, size.width, size.height)
    }
    onProgress?.(index + 1, rows.length)
  }
  checkAbort(signal)
  if (pdf) return { blob: pdf.output('blob'), extension: 'pdf' }
  return { blob: await zip.generateAsync({ type: 'blob' }), extension: 'zip' }
}

async function pixelsOf(blob) {
  const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas')
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(bitmap, 0, 0)
    return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height }
  } finally { bitmap.close(); canvas.width = canvas.height = 0 }
}

// ZPL for the active page: one label per row (or one without data) at options.dpi.
export async function exportZpl({ editor, options, scene, signal }) {
  const id = editor.activePageId(), page = findPage(scene, id).page, rows = options.bulk?.rows ?? [null]
  if (!ZPL_DPI.includes(options.dpi)) throw Error('Elige la resolución de la impresora.')
  if (rows.length > BULK_ROWS) throw Error(`El lote admite hasta ${BULK_ROWS} filas.`)
  const scale = safeScale(page, options.dpi / defaultPpi(page)), labels = [], images = options.bulk?.images ?? null
  for (const row of rows) {
    checkAbort(signal)
    const variant = row ? fillDocument(scene, rowValues(row, options.bulk.mapping)) : scene, current = findPage(variant, id)
    const { commands, ids } = nativeCodes(current.objects, scale)
    // Native codes are hidden from the raster so they print once, crisp.
    const raster = replacePage(variant, { ...current, objects: current.objects.map(object => (ids.has(object.id) ? { ...object, hidden: true } : object)) })
    const { data, width, height } = await pixelsOf(await editor.exportVariant(id, scene, raster, 'png', 1, { scale, signal, images }))
    labels.push(zplLabel({ width, height, graphic: graphicField(data, width, height), codes: commands }))
  }
  checkAbort(signal)
  return { blob: new Blob([labels.join('\n')], { type: 'text/plain' }), extension: 'zpl', count: labels.length }
}

export async function exportDesign({ editor, options, scene, designId, token, name,revision,signal }) {
  checkAbort(signal)
  // Native editable package: built by the API from the saved design; the browser renders nothing.
  if (options.type === 'runlystudio') {
    if (options.acknowledgeImageCopies !== true) throw Error('Confirma la inclusión de copias de las imágenes para descargar el paquete.')
    const blob = await runly.studio.exportPackage('design', designId, { acknowledgeImageCopies: true }, token, signal)
    checkAbort(signal)
    return { blob, extension: 'runlystudio' }
  }
  if (options.type === 'pdf') {
    const all = documentPages(scene), wanted = options.pageIds ?? all.map(({page}) => page.id)
    if (!Array.isArray(wanted) || !wanted.length || new Set(wanted).size !== wanted.length || wanted.some(id => !findPage(scene,id))) throw Error('Rango de páginas no válido.')
    const pages = all.filter(({page}) => wanted.includes(page.id)).map(({page}) => ({pageId:page.id,ppi:options.ppi??defaultPpi(page)}))
    let jobId
    try {
      const response = await runly.studio.createPrintJob(designId,{revision,pages,profile:options.profile,bleed:Boolean(options.bleed),cropMarks:Boolean(options.cropMarks)},token,signal)
      const job=response.data??response;jobId=job.id
      checkAbort(signal)
      for (const entry of job.pages) {
        const page=findPage(scene,entry.pageId).page, bleed=entry.bleedMm/25.4*entry.ppi
        const pixels=exportDimensions(page,PRINT_PPI/entry.ppi,bleed)
        if(pixels.width*pixels.height>STUDIO_EXPORT_LIMITS.printPixels)throw Error('El PDF supera 32 megapíxeles a 300 ppp.')
        let png=await editor.exportPage(entry.pageId,'png',1,scene,{scale:safeScale(page,PRINT_PPI/entry.ppi,bleed),bleed,signal})
        checkAbort(signal)
        await runly.studio.appendPrintPage(designId,jobId,entry.pageId,png,token,signal)
        png=null;checkAbort(signal)
      }
      const blob=await runly.studio.finishPrintJob(designId,jobId,token,signal)
      checkAbort(signal);jobId=null
      return {blob,extension:'pdf',pageCount:pages.length}
    } finally {
      // Use a fresh request: the export signal may already be aborted. The
      // server independently expires abandoned jobs and verifies access again.
      if(jobId)await runly.studio.cancelPrintJob(designId,jobId,token).catch(()=>{})
    }
  }
  const page=findPage(scene,editor.activePageId()).page
  const blob = await editor.exportImage(options.type, options.type === 'jpg' ? options.quality : 1, scene,
    { scale: safeScale(page, options.scale), transparent: options.type === 'png' && options.transparent,signal })
  checkAbort(signal)
  return { blob, extension: options.type }
}
