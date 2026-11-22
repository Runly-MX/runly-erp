// Server-side check of an uploaded file against what was authorized: real type
// from its bytes (never the extension or the browser MIME alone), exact size and
// SHA-256. Pure and generic (runly.lms deliveries now; Formularios later).
import crypto from 'node:crypto'

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const startsWith = (buf, bytes, offset = 0) => buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b)
// OOXML packages name their parts in the ZIP; the part tells Excel from Word from PowerPoint.
const zipHas = (buf, name) => buf.includes(Buffer.from(name, 'latin1'))

// Signatures of binary formats a text file must never start with (a renamed PDF,
// Office file, image or program is not a CSV even if its first bytes are ASCII).
const BINARY_SIGNATURES = [ZIP_MAGIC, OLE_MAGIC, [0x25, 0x50, 0x44, 0x46], [0x89, 0x50, 0x4e, 0x47], [0xff, 0xd8, 0xff], [0x4d, 0x5a], [0x7f, 0x45, 0x4c, 0x46]]

function looksLikeText(buf) {
  const sample = buf.subarray(0, 64 * 1024)
  if (!sample.length || sample.includes(0)) return false
  if (BINARY_SIGNATURES.some((sig) => startsWith(sample, sig))) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, sample.length - 4)); return true } catch { return false }
}

// key -> { label, ext, mime, test(buf) }. Order matters for detection (OOXML before plain ZIP).
export const FILE_TYPES = {
  xlsx: { label: 'Excel', ext: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', test: (b) => startsWith(b, ZIP_MAGIC) && zipHas(b, 'xl/') },
  docx: { label: 'Word', ext: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', test: (b) => startsWith(b, ZIP_MAGIC) && zipHas(b, 'word/') },
  pptx: { label: 'PowerPoint', ext: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', test: (b) => startsWith(b, ZIP_MAGIC) && zipHas(b, 'ppt/') },
  xls: { label: 'Excel 97-2003', ext: ['xls'], mime: 'application/vnd.ms-excel', test: (b) => startsWith(b, OLE_MAGIC) },
  doc: { label: 'Word 97-2003', ext: ['doc'], mime: 'application/msword', test: (b) => startsWith(b, OLE_MAGIC) },
  ppt: { label: 'PowerPoint 97-2003', ext: ['ppt'], mime: 'application/vnd.ms-powerpoint', test: (b) => startsWith(b, OLE_MAGIC) },
  pdf: { label: 'PDF', ext: ['pdf'], mime: 'application/pdf', test: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  csv: { label: 'CSV', ext: ['csv'], mime: 'text/csv', test: looksLikeText },
  txt: { label: 'Texto', ext: ['txt'], mime: 'text/plain', test: looksLikeText },
  png: { label: 'PNG', ext: ['png'], mime: 'image/png', test: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { label: 'JPG', ext: ['jpg', 'jpeg'], mime: 'image/jpeg', test: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  zip: { label: 'ZIP', ext: ['zip'], mime: 'application/zip', test: (b) => startsWith(b, ZIP_MAGIC) },
}
export const FILE_TYPE_KEYS = Object.keys(FILE_TYPES)

export const extensionOf = (name) => {
  const match = /\.([a-z0-9]{1,8})$/i.exec(String(name ?? '').trim())
  return match ? match[1].toLowerCase() : ''
}

// The type a file name claims (by extension), or null when unknown.
export function typeForName(name) {
  const ext = extensionOf(name)
  return FILE_TYPE_KEYS.find((key) => FILE_TYPES[key].ext.includes(ext)) ?? null
}

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
export const SHA256_RE = /^[0-9a-f]{64}$/

// Checks the stored bytes against the authorization: { fileName, sizeBytes, sha256? } and the
// accepted type keys. Returns { ok: true, type, mime, size, sha256 } or { ok: false, code, message }.
export function verifyFileContent(buf, { fileName, sizeBytes, sha256 = null }, accepted = FILE_TYPE_KEYS) {
  const claimed = typeForName(fileName)
  if (!claimed || !accepted.includes(claimed)) return { ok: false, code: 'TYPE_NOT_ALLOWED', message: 'Ese tipo de archivo no se admite en esta actividad.' }
  if (buf.length !== Number(sizeBytes)) return { ok: false, code: 'SIZE_MISMATCH', message: 'El archivo recibido no coincide con el que se autorizó (tamaño distinto). Vuelve a subirlo.' }
  if (!FILE_TYPES[claimed].test(buf)) return { ok: false, code: 'CONTENT_MISMATCH', message: `El contenido no corresponde a un archivo ${FILE_TYPES[claimed].label}.` }
  const digest = sha256Hex(buf)
  if (sha256 && digest !== String(sha256).toLowerCase()) return { ok: false, code: 'HASH_MISMATCH', message: 'El archivo se dañó durante la subida (la huella no coincide). Vuelve a subirlo.' }
  return { ok: true, type: claimed, mime: FILE_TYPES[claimed].mime, size: buf.length, sha256: digest }
}
