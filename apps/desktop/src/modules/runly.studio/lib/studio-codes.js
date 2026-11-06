import QRCode from 'qrcode'

// QR and Code 128 as Studio vector geometry (path data in module units), so the
// existing vector renderer, thumbnails and sync draw them unchanged.
export const CODE_LABELS = { qr: 'Código QR', code128: 'Código de barras' }
export const CODE_MAX = { qr: 300, code128: 60 }
const QUIET = { qr: 4, code128: 10 }, RUNS_PER_PATH = 150

// Code 128 widths (bar, space, bar, space, bar, space) for symbols 0-106; 106 is the stop.
const PATTERNS = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112').split(' ')

// Printable ASCII only (code set B); anything else becomes '?'.
export const code128Text = value => String(value ?? '').replace(/[^\x20-\x7e]/g, '?')

export function code128Symbols(value) {
  const data = [...code128Text(value)].map(char => char.charCodeAt(0) - 32)
  const checksum = data.reduce((sum, code, i) => sum + code * (i + 1), 104) % 103
  return [104, ...data, checksum, 106]
}

const paths = runs => {
  const out = []
  for (let i = 0; i < runs.length; i += RUNS_PER_PATH) out.push({ d: runs.slice(i, i + RUNS_PER_PATH).join(''), fill: 'color', stroke: 'none', strokeWidth: 0, cap: 'butt', join: 'miter' })
  return out
}

function qrGeometry(value) {
  const { modules } = QRCode.create(value || ' ', { errorCorrectionLevel: 'M' }), size = modules.size, q = QUIET.qr, runs = []
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!modules.data[y * size + x]) continue
    let end = x
    while (end + 1 < size && modules.data[y * size + end + 1]) end++
    runs.push(`M${x + q} ${y + q}h${end - x + 1}v1h-${end - x + 1}z`)
    x = end
  }
  return { width: size + 2 * q, height: size + 2 * q, paths: paths(runs) }
}

function barcodeGeometry(value) {
  const q = QUIET.code128, widths = code128Symbols(value || ' ').flatMap(symbol => [...PATTERNS[symbol]].map(Number))
  const total = widths.reduce((sum, w) => sum + w, 0) + 2 * q, height = Math.max(20, Math.round(total * 0.3)), runs = []
  let x = q
  widths.forEach((w, i) => { if (i % 2 === 0) runs.push(`M${x} 0h${w}v${height}h-${w}z`); x += w })
  return { width: total, height, paths: paths(runs) }
}

export function codeGeometry(kind, value) {
  if (!CODE_LABELS[kind]) throw Error('Tipo de código no admitido.')
  if (String(value ?? '').length > CODE_MAX[kind]) throw Error(`El contenido del ${CODE_LABELS[kind].toLowerCase()} admite hasta ${CODE_MAX[kind]} caracteres.`)
  return kind === 'qr' ? qrGeometry(String(value ?? '')) : barcodeGeometry(value)
}

// A new code object for editor.add('vector', ...), sized for a 300 ppp label.
export function codeObject(kind, value) {
  const geometry = codeGeometry(kind, value), width = kind === 'qr' ? 240 : 480
  return { svgName: CODE_LABELS[kind], code: { kind, value }, geometry, width, height: Math.round(width * geometry.height / geometry.width), fill: '#000000' }
}
