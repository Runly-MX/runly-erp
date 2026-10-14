// Tiny but structurally valid dummy files (JPEG/PNG/PDF/XML/OOXML-like) padded
// to a target size, so MIME sniffing and size accounting behave like real data.
// Content is filler only; nothing here resembles real documents.
import { crc32 } from 'node:zlib'

// 1x1 white baseline JPEG.
const JPEG_1PX = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////' +
  '2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QA' +
  'FAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwD' +
  'AQACEQMRAD8AP//Z', 'base64')
// 1x1 transparent PNG.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const filler = (n, seed = 0) => {
  const buf = Buffer.alloc(Math.max(0, n))
  let x = (seed * 2654435761) >>> 0 || 1
  for (let i = 0; i < buf.length; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; buf[i] = 0x20 + ((x >>> 0) % 90) }
  return buf
}

export function makeJpeg(size, seed) {
  // Pad with COM (0xFFFE) segments right after SOI; each holds up to 65533 bytes.
  const parts = [JPEG_1PX.subarray(0, 2)]
  let remaining = size - JPEG_1PX.length
  while (remaining > 4) {
    const body = Math.min(65533, remaining - 4)
    const head = Buffer.from([0xff, 0xfe, ((body + 2) >> 8) & 0xff, (body + 2) & 0xff])
    parts.push(head, filler(body, seed + remaining))
    remaining -= body + 4
  }
  parts.push(JPEG_1PX.subarray(2))
  return Buffer.concat(parts)
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

export function makePng(size, seed) {
  // Private ancillary chunk "pdDg" before IEND carries the padding.
  const iendAt = PNG_1PX.length - 12
  const pad = Math.max(0, size - PNG_1PX.length - 12)
  if (!pad) return PNG_1PX
  return Buffer.concat([PNG_1PX.subarray(0, iendAt), pngChunk('pdDg', filler(pad, seed)), PNG_1PX.subarray(iendAt)])
}

export function makePdf(size, seed, label = 'Documento de prueba') {
  const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const text = `BT /F1 18 Tf 72 720 Td (${label.replace(/[()\\]/g, '')}) Tj ET`
  objects[3] = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  let body = header
  const fixedLen = Buffer.byteLength(header, 'latin1') + objects.reduce((n, o, i) => n + `${i + 1} 0 obj\n${o}\nendobj\n`.length, 0) + 200
  const padLen = Math.max(0, size - fixedLen)
  // Padding lives in comment lines between the header and the first object.
  const lines = filler(padLen, seed).toString('latin1').replace(/(.{1,78})/g, '%$1\n')
  body += padLen ? `${lines.slice(0, padLen - 1)}\n` : ''
  const offsets = []
  for (const [i, o] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  }
  const xrefAt = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

export function makeCfdiXml(size, seed, fiscalUuid) {
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" ' +
    'Version="4.0" Serie="DEMO" Folio="0" Total="0.00" Moneda="MXN">\n' +
    '  <cfdi:Emisor Rfc="XAXX010101000" Nombre="PROVEEDOR FICTICIO DEMO"/>\n' +
    '  <cfdi:Receptor Rfc="XAXX010101000" Nombre="RECEPTOR FICTICIO DEMO"/>\n' +
    `  <cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${fiscalUuid}"/></cfdi:Complemento>\n`
  const tail = '</cfdi:Comprobante>\n'
  const padLen = Math.max(0, size - head.length - tail.length - 9)
  const pad = padLen ? `<!-- ${filler(padLen, seed).toString('latin1').replace(/-/g, '_')} -->\n` : ''
  return Buffer.from(head + pad + tail, 'utf8')
}

export function makeZipLike(size, seed) {
  // Local file header magic only: enough for extension/MIME sniffing, not a real archive.
  const magic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])
  return Buffer.concat([magic, filler(Math.max(0, size - magic.length), seed)])
}

export function makeBlob(kind, size, seed, extra) {
  switch (kind) {
    case 'jpg': return makeJpeg(size, seed)
    case 'png': return makePng(size, seed)
    case 'pdf': return makePdf(size, seed)
    case 'xml': return makeCfdiXml(size, seed, extra ?? '00000000-0000-4000-8000-000000000000')
    case 'xlsx': case 'docx': return makeZipLike(size, seed)
    default: return filler(size, seed)
  }
}

// data:image/png;base64,... signature of roughly `size` bytes (before base64).
export function makeSignatureDataUrl(size, seed) {
  return `data:image/png;base64,${makePng(size, seed).toString('base64')}`
}
