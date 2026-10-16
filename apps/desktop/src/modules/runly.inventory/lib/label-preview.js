// Instant client-side label preview: the same pure geometry and SVG the API
// uses (@runly/core/labels), computed in the browser on every draft change, no
// network. The server render stays for downloads/printing (ZPL, PDF, PNG).
import QRCode from 'qrcode'
import {
  computeGeometry, createPlaceholderQrUrl, normalizeLayout, qrContent, renderLabelSvg, selectLines,
} from '@runly/core/labels'
import { draftToLayout } from './label-layout.js'

// Boolean module matrix from the qrcode package (synchronous).
export function qrMatrix(content, errorCorrection = 'M') {
  const { modules } = QRCode.create(content, { errorCorrectionLevel: errorCorrection })
  const count = modules.size
  return { count, isDark: (row, col) => modules.data[row * count + col] === 1 }
}

// { draft, item, companyName, qrUrl, origin } -> { svg, overflow, error }.
// qrUrl: the item's real public link when already fetched; otherwise a
// placeholder link built from the folio (same size and look).
export function buildLabelPreview({ draft, item, companyName = '', qrUrl = null, origin = '' }) {
  if (!item) return { svg: null, overflow: 0, error: null }
  try {
    const layout = normalizeLayout(draftToLayout(draft))
    const lines = selectLines(layout, item, { companyName })
    const resolve = qrUrl ? () => qrUrl : createPlaceholderQrUrl(origin)
    const content = layout.layout === 'text-only' ? null : qrContent(item, layout.qrOptions, resolve)
    const geometry = computeGeometry(layout, lines, content || null, { qrMatrix })
    return { svg: renderLabelSvg(geometry, layout.dpi, { fluid: true }), overflow: geometry.overflow, error: null }
  } catch (err) {
    return { svg: null, overflow: 0, error: err?.message ?? 'No se pudo generar la vista previa' }
  }
}
