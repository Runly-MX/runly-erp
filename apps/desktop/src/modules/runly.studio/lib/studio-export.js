import {documentPages, findPage} from '../../../../../shared/studio/pages.js'
import { runly } from '../../../lib/runly.js'
import { exportDimensions,STUDIO_EXPORT_LIMITS } from '../../../../../shared/studio/export-limits.js'
import { checkAbort } from '../../../../../shared/studio/abort.js'

// Export presets. Screen formats render in the browser; the print PDF renders
// at 300 ppp in the browser and the API builds the PDF (RGB or CMYK, bleed,
// crop marks), because browsers cannot produce CMYK.
export const PRINT_PPI = 300
export const BLEED_MM = 3
export const SOURCE_PPI = [72, 96, 150, 300]

export const DEFAULT_EXPORT = { type: 'png', scale: 1, transparent: false, quality: 0.9, profile: 'cmyk', ppi: null, bleed: true, cropMarks: false }
// Pixel presets are screen sizes; large ones (flyers, posters) are print sizes at 150 ppp.
export const defaultPpi = page => (Math.max(page.width, page.height) >= 1500 ? 150 : 96)
export const printSizeMm = (page, ppi) => ({ width: Math.round(page.width / ppi * 25.4 * 10) / 10, height: Math.round(page.height / ppi * 25.4 * 10) / 10 })

// Preserve the requested scale exactly or reject it explicitly.
export function safeScale(page, wanted, bleed = 0) {
  exportDimensions(page,wanted,bleed);return wanted
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
