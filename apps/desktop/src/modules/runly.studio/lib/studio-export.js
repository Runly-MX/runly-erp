import { runly } from '../../../lib/runly.js'
import { exportDimensions,STUDIO_EXPORT_LIMITS } from '../../../../../shared/studio/export-limits.js'

// Export presets. Screen formats render in the browser; the print PDF renders
// at 300 ppp in the browser and the API builds the PDF (RGB or CMYK, bleed,
// crop marks), because browsers cannot produce CMYK.
export const PRINT_PPI = 300
export const BLEED_MM = 3
export const SOURCE_PPI = [72, 96, 150, 300]

export const DEFAULT_EXPORT = { type: 'png', scale: 1, transparent: false, quality: 0.9, profile: 'cmyk', ppi: null, bleed: true, cropMarks: true }
// Pixel presets are screen sizes; large ones (flyers, posters) are print sizes at 150 ppp.
export const defaultPpi = page => (Math.max(page.width, page.height) >= 1500 ? 150 : 96)
export const printSizeMm = (page, ppi) => ({ width: Math.round(page.width / ppi * 25.4 * 10) / 10, height: Math.round(page.height / ppi * 25.4 * 10) / 10 })

// Preserve the requested scale exactly or reject it explicitly.
export function safeScale(page, wanted, bleed = 0) {
  exportDimensions(page,wanted,bleed);return wanted
}

export async function exportDesign({ editor, options, scene, designId, token, name,revision }) {
  if (options.type === 'pdf') {
    const page = scene.page, ppi = options.ppi ?? defaultPpi(page), size = printSizeMm(page, ppi)
    const bleed = options.bleed ? BLEED_MM / 25.4 * ppi : 0
    const pixels=exportDimensions(page,PRINT_PPI/ppi,bleed)
    if(pixels.width*pixels.height>STUDIO_EXPORT_LIMITS.printPixels)throw Error('El PDF supera 32 megapíxeles a 300 ppp. Reduce las dimensiones físicas; no se redujo la resolución.')
    const png = await editor.exportImage('png', 1, scene, { scale: safeScale(page, PRINT_PPI / ppi, bleed), bleed })
    const blob = await runly.studio.exportPrintPdf(designId, png, { widthMm: page.width / ppi * 25.4, heightMm: page.height / ppi * 25.4,
      bleedMm: options.bleed ? BLEED_MM : 0, cropMarks: Boolean(options.cropMarks), profile: options.profile, title: name,revision }, token)
    return { blob, extension: 'pdf', size }
  }
  const blob = await editor.exportImage(options.type, options.type === 'jpg' ? options.quality : 1, scene,
    { scale: safeScale(scene.page, options.scale), transparent: options.type === 'png' && options.transparent })
  return { blob, extension: options.type }
}
