import { code128Text } from './studio-codes.js'

// Hybrid ZPL II for Zebra printers: the label is rasterized at the printer's
// dots per inch into one ^GFA graphic (Zebra ASCII compression), and QR /
// Code 128 elements are emitted as native ^BQ / ^BC so they scan crisply.
export const ZPL_DPI = [203, 300, 600]
const REPEAT_LOW = 'GHIJKLMNOPQRSTUVWXY', REPEAT_HIGH = 'ghijklmnopqrstuvwxyz'

// ^ and ~ start ZPL commands and control characters never belong in a field.
const safe = text => String(text).replace(/[\^~\\]/g, ' ').replace(/[\u0000-\u001f]/g, ' ')

function repeat(count, char) {
  if (count === 1) return char
  let prefix = ''
  for (; count > 400; count -= 400) prefix += 'z'
  if (count >= 20) { prefix += REPEAT_HIGH[Math.floor(count / 20) - 1]; count %= 20 }
  if (count > 0) prefix += REPEAT_LOW[count - 1]
  return prefix + char
}

// One hex row -> compressed: ':' repeats the previous row, ',' / '!' fill the rest with 0 / F.
function compressRow(hex, previous) {
  if (hex === previous) return ':'
  const zeros = hex.match(/0+$/)?.[0].length ?? 0, ones = hex.match(/F+$/)?.[0].length ?? 0
  const tail = zeros > 1 ? ',' : ones > 1 ? '!' : '', body = hex.slice(0, hex.length - (zeros > 1 ? zeros : ones > 1 ? ones : 0))
  let out = ''
  for (let i = 0; i < body.length;) {
    let end = i
    while (end < body.length && body[end] === body[i]) end++
    out += repeat(end - i, body[i]); i = end
  }
  return out + tail
}

// pixels: RGBA bytes. A pixel prints when it is opaque and dark.
export function graphicField(pixels, width, height) {
  const bytesPerRow = Math.ceil(width / 8), rows = []
  let previous = null
  for (let y = 0; y < height; y++) {
    let hex = ''
    for (let byte = 0; byte < bytesPerRow; byte++) {
      let value = 0
      for (let bit = 0; bit < 8; bit++) {
        const x = byte * 8 + bit, i = (y * width + x) * 4
        // shortcut: fixed threshold, no dithering; photos print as hard black/white, add dithering if users print photos.
        if (x < width && pixels[i + 3] >= 128 && 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2] < 128) value |= 0x80 >> bit
      }
      hex += value.toString(16).toUpperCase().padStart(2, '0')
    }
    rows.push(compressRow(hex, previous)); previous = hex
  }
  const total = bytesPerRow * height
  return `^GFA,${total},${total},${bytesPerRow},${rows.join('')}`
}

// Codes that can print natively: visible, not rotated and at least one dot per module.
// Returns { commands, ids } in dots; `ids` are hidden from the raster.
export function nativeCodes(objects, scale) {
  const commands = [], ids = new Set()
  for (const object of objects) {
    if (!object.code?.value || object.hidden || Math.abs(object.rotation) > 0.5) continue
    const { kind, value } = object.code, g = object.geometry, w = object.width * scale, h = object.height * scale
    const module = Math.floor(Math.min(w / g.width, kind === 'qr' ? h / g.height : Infinity))
    if (module < 1 || (kind === 'qr' && module > 10)) continue
    const quiet = kind === 'qr' ? 4 : 10
    const x = Math.round(object.x * scale + (w - g.width * module) / 2 + quiet * module)
    const y = Math.round(object.y * scale + (kind === 'qr' ? (h - g.height * module) / 2 + quiet * module : 0))
    commands.push(kind === 'qr'
      ? `^FO${x},${y}^BQN,2,${module}^FDMA,${safe(value)}^FS`
      // >: forces Code 128 subset B (same symbols as the design); a literal '>' is '><'.
      : `^FO${x},${y}^BY${module},2^BCN,${Math.max(1, Math.round(h))},N,N,N^FD>:${safe(code128Text(value)).replace(/>/g, '><')}^FS`)
    ids.add(object.id)
  }
  return { commands, ids }
}

export function zplLabel({ width, height, graphic, codes = [] }) {
  return ['^XA', '^CI28', `^PW${width}`, `^LL${height}`, '^LH0,0', `^FO0,0${graphic}^FS`, ...codes, '^PQ1,0,1,N', '^XZ'].join('\n')
}
