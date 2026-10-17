// Certificates on an uploaded PDF (no Office needed): the first page is the
// background and each layout field is drawn on top with pdf-lib.
//
// Text uses the standard Helvetica fonts, whose WinAnsi encoding covers
// Spanish (á é í ó ú ü ñ ¿ ¡). Characters outside WinAnsi lose their accent
// (NFD) or become "?" so a name never breaks the PDF.
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import { CERT_DOCX_MAX_BYTES } from './lms-cert-docx.js'
import { IMAGE_FIELDS, readLayout } from './lms-cert-pdf-layout.js'

export const PDF_MIME = 'application/pdf'
const STAMP = 'REVOCADO'

async function loadPdf(buffer) {
  try {
    return await PDFDocument.load(buffer, { updateMetadata: false })
  } catch (error) {
    if (/encrypt/i.test(String(error?.message ?? error?.name))) throw new TemplateError('El PDF está protegido con contraseña; súbelo sin protección.')
    throw new TemplateError('El archivo no es un PDF válido.')
  }
}

// Validates an uploaded PDF and returns its first page size (points).
export async function inspectCertPdf(buffer, fileName = 'plantilla.pdf') {
  if (!/\.pdf$/i.test(String(fileName ?? ''))) throw new TemplateError('La plantilla debe ser un archivo PDF.')
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TemplateError('Adjunta un archivo PDF.')
  if (buffer.length > CERT_DOCX_MAX_BYTES) throw new TemplateError('La plantilla supera 10 MB.')
  if (!buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new TemplateError('El archivo no es un PDF válido.')
  const doc = await loadPdf(buffer)
  let count, first, box
  try {
    count = doc.getPageCount()
    first = count ? doc.getPage(0) : null
    box = first?.getMediaBox()
  } catch {
    throw new TemplateError('El archivo no es un PDF válido.')
  }
  if (!count || !box) throw new TemplateError('El PDF no tiene páginas.')
  const warnings = []
  if (count > 1) warnings.push(`El PDF tiene ${count} páginas; solo se usa la primera.`)
  if (first.getRotation().angle % 360) warnings.push('La primera página está girada; las posiciones de los campos pueden no coincidir. Exporta el PDF sin rotación.')
  return { page: { width: Math.round(box.width * 100) / 100, height: Math.round(box.height * 100) / 100 }, pageCount: count, warnings }
}

const hexColor = (value, fallback = [0.07, 0.09, 0.15]) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(value ?? ''))
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(...fallback)
}

// Replaces characters the font cannot encode (WinAnsi for standard fonts).
export function encodableText(font, text) {
  const ok = (ch) => { try { font.encodeText(ch); return true } catch { return false } }
  let out = ''
  for (const ch of String(text ?? '').replace(/[\r\n\t]+/g, ' ')) {
    if (ok(ch)) { out += ch; continue }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += base && [...base].every(ok) ? base : '?'
  }
  return out
}

const isPng = (b) => b[0] === 0x89 && b[1] === 0x50
const isJpeg = (b) => b[0] === 0xff && b[1] === 0xd8

async function drawImage(doc, page, buffer, rect) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || !(isPng(buffer) || isJpeg(buffer))) return false
  try {
    const image = isPng(buffer) ? await doc.embedPng(buffer) : await doc.embedJpg(buffer)
    const scale = Math.min(rect.w / image.width, rect.h / image.height)
    const width = image.width * scale, height = image.height * scale
    page.drawImage(image, { x: rect.x + (rect.w - width) / 2, y: rect.y + (rect.h - height) / 2, width, height })
    return true
  } catch {
    return false
  }
}

function drawField(page, field, value, fonts, rect) {
  if (field.background) page.drawRectangle({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, color: hexColor(field.background) })
  const font = field.bold ? fonts.bold : fonts.regular
  const text = encodableText(font, value).trim()
  if (!text) return
  // Shrink to fit the box width (single line), never above the box height.
  let size = Math.min(Number(field.fontSize) || 14, rect.h / 1.05)
  while (size > 4 && font.widthOfTextAtSize(text, size) > rect.w) size = Math.max(4, size * 0.95)
  const width = font.widthOfTextAtSize(text, size)
  const x = field.align === 'center' ? rect.x + (rect.w - width) / 2 : field.align === 'right' ? rect.x + rect.w - width : rect.x
  // Vertically centered on the cap height (~0.7 em for Helvetica).
  const y = rect.y + rect.h / 2 - size * 0.35
  page.drawText(text, { x, y, size, font, color: hexColor(field.color) })
}

function drawStamp(page, font, box) {
  const size = box.width * 0.14
  const width = font.widthOfTextAtSize(STAMP, size)
  const angle = (28 * Math.PI) / 180
  const dx = width / 2, dy = size * 0.35
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  page.drawText(STAMP, {
    x: cx - (dx * Math.cos(angle) - dy * Math.sin(angle)), y: cy - (dx * Math.sin(angle) + dy * Math.cos(angle)),
    size, font, color: rgb(0.86, 0.15, 0.15), opacity: 0.3, rotate: degrees(28),
  })
}

// buffer: the template PDF. layout: stored layout. data: buildCertDocxData()
// values (scalars). images: { qr, firma, logo } PNG/JPEG buffers or null.
export async function renderCertificateOnPdf({ buffer, layout, data = {}, images = {}, revoked = false, title = 'Certificado', issuedAt = null }) {
  const source = await loadPdf(buffer)
  const doc = await PDFDocument.create({ updateMetadata: false })
  const [page] = await doc.copyPages(source, [0])
  doc.addPage(page)
  const when = issuedAt ? new Date(issuedAt) : new Date(0)
  doc.setTitle(String(title)); doc.setProducer('Runly'); doc.setCreator('Runly'); doc.setCreationDate(when); doc.setModificationDate(when)
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) }
  const box = page.getMediaBox()
  const { page: size, fields } = readLayout(layout)
  // Layout points map 1:1 onto the media box (top-left origin in the layout).
  const sx = size ? box.width / size.width : 1, sy = size ? box.height / size.height : 1
  for (const field of fields) {
    const rect = { x: box.x + field.x * sx, y: box.y + box.height - (field.y + field.h) * sy, w: field.w * sx, h: field.h * sy }
    if (IMAGE_FIELDS.has(field.key)) await drawImage(doc, page, images[field.key], rect)
    else drawField(page, field, data[field.key] ?? '', fonts, rect)
  }
  if (revoked) drawStamp(page, fonts.bold, box)
  return Buffer.from(await doc.save())
}
