import { STUDIO_EXPORT_LIMITS, exportDimensions } from '../../../../../shared/studio/export-limits.js'

// What an export will really produce, computed before downloading with the same
// limits the editor enforces. Pure: the dialog shows it and blocks the download
// when the engine would refuse it (nothing is silently downscaled).
// Print constants mirror studio-export.js and studio-print.js (API).
export const PRINT_PPI = STUDIO_EXPORT_LIMITS.printPpi
export const BLEED_MM = 3
const MARK_OFFSET_MM = 2, MARK_LENGTH_MM = 5, MIN_TRIM_MM = 10, MAX_TRIM_MM = 2000
const round1 = value => Math.round(value * 10) / 10

export const mm = value => `${round1(value).toLocaleString('es-MX')} mm`
export const pixels = ({ width, height }) => `${width.toLocaleString('es-MX')} × ${height.toLocaleString('es-MX')} px`
export const megapixels = ({ width, height }) => `${(width * height / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MP`

function attempt(page, scale, bleedPx = 0) {
  try { return { size: exportDimensions(page, scale, bleedPx) } } catch (error) { return { error: error.message } }
}

export function planScreenExport(page, { type, scale }) {
  const { size, error } = attempt(page, scale)
  return { kind: 'screen', type, scale, size, error }
}

export function planPrintExport(page, { ppi, bleed, cropMarks }) {
  const trim = { width: round1(page.width / ppi * 25.4), height: round1(page.height / ppi * 25.4) }
  const bleedMm = bleed ? BLEED_MM : 0, margin = cropMarks ? bleedMm + MARK_OFFSET_MM + MARK_LENGTH_MM : bleedMm
  const sheet = { width: round1(trim.width + 2 * margin), height: round1(trim.height + 2 * margin) }
  const scale = PRINT_PPI / ppi, bleedPx = bleed ? bleedMm / 25.4 * ppi : 0
  const wanted = { width: Math.ceil((page.width + 2 * bleedPx) * scale), height: Math.ceil((page.height + 2 * bleedPx) * scale) }
  const { printPixels, side } = STUDIO_EXPORT_LIMITS
  const outOfRange = [trim.width, trim.height].some(value => value < MIN_TRIM_MM || value > MAX_TRIM_MM)
    ? `La medida de corte debe estar entre ${MIN_TRIM_MM} y ${MAX_TRIM_MM} mm por lado (ahora ${mm(trim.width)} × ${mm(trim.height)}). Cambia las medidas o la resolución del diseño.` : null
  const tooBig = wanted.width * wanted.height > printPixels || wanted.width > side || wanted.height > side
    ? `A ${PRINT_PPI} ppp este PDF necesitaría ${pixels(wanted)} (${megapixels(wanted)}); el máximo es ${printPixels / 1e6} MP. Reduce las medidas del diseño o elige una resolución del diseño mayor (la medida impresa será menor).` : null
  const { size, error } = tooBig || outOfRange ? {} : attempt(page, scale, bleedPx)
  return { kind: 'print', trim, bleedMm, sheet, ppi: PRINT_PPI, size, error: outOfRange ?? tooBig ?? error ?? null }
}

export function planExport(page, options) {
  return options.type === 'pdf'
    ? planPrintExport(page, { ppi: options.ppi, bleed: options.bleed, cropMarks: options.cropMarks })
    : planScreenExport(page, options)
}
