// Certificates from an uploaded Word file (spec 2026-10-16 §15): tag contract,
// upload validation, the sample .docx, fill data, image sizing and rendering.
// Same engine as inventory custody documents (services/document-templates).
import PizZip from 'pizzip'
import QRCode from 'qrcode'
import { inspectDocx, renderDocx } from '../../services/document-templates/docx-template.js'
import { buildMinimalDocx, paragraph } from '../../services/document-templates/minimal-docx.js'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import { readOfficeConfig } from '../../services/office/config.js'
import { formatHours, formatIssueDate } from './lms-cert-core.js'
import { GUEST_CERT_TAGS, isGuestCertTag } from './lms-intake-core.js'

// The guest tags print share-link intake answers ('' for everyone else); any
// other answer is {{campo_<key>}} (isGuestCertTag).
export const CERT_DOCX_SCALAR_TAGS = ['alumno', 'curso', 'fecha', 'horas', 'folio', 'empresa', 'instructor', 'calificacion', ...GUEST_CERT_TAGS]
export const CERT_DOCX_IMAGE_TAGS = ['qr', 'firma', 'logo']
export const CERT_DOCX_MAX_BYTES = 10 * 1024 * 1024
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export const CERT_NO_TAGS_WARNING = 'La plantilla no contiene etiquetas {{…}}; el certificado se generará sin datos.'
export const CERT_NO_QR_WARNING = 'La plantilla no incluye {{%qr}}; el certificado no tendrá el código QR de verificación.'

// Placeholder reference for the UI.
export const CERT_DOCX_PLACEHOLDERS = {
  scalars: CERT_DOCX_SCALAR_TAGS,
  images: CERT_DOCX_IMAGE_TAGS,
}

// Tags a certificate template uses that the contract does not know.
export function unknownCertTags(tags = []) {
  return tags.filter((tag) => {
    if (tag.startsWith('#') || tag.startsWith('^')) return true
    if (tag.startsWith('%')) return !CERT_DOCX_IMAGE_TAGS.includes(tag.slice(1))
    return !CERT_DOCX_SCALAR_TAGS.includes(tag) && !isGuestCertTag(tag)
  })
}

export function certTemplateWarnings(tags = []) {
  const warnings = unknownCertTags(tags).map((tag) => `Etiqueta desconocida: {{${tag}}}`)
  if (!tags.length) warnings.push(CERT_NO_TAGS_WARNING)
  else if (!tags.includes('%qr')) warnings.push(CERT_NO_QR_WARNING)
  return warnings
}

// Validates an uploaded .docx (compile + tag scan). Throws TemplateError.
export function inspectCertDocx(buffer, fileName = 'plantilla.docx') {
  if (!/\.docx$/i.test(String(fileName ?? ''))) throw new TemplateError('La plantilla debe ser un archivo de Word (.docx).')
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TemplateError('Adjunta un archivo de Word (.docx).')
  if (buffer.length > CERT_DOCX_MAX_BYTES) throw new TemplateError('La plantilla supera 10 MB.')
  const { tags } = inspectDocx(buffer)
  return { tags, warnings: certTemplateWarnings(tags) }
}

export function isOfficeAvailable(env = process.env) {
  try {
    const config = readOfficeConfig(env)
    return Boolean(config?.enabled && config.internalUrl)
  } catch {
    return false
  }
}

// ---- sample ---------------------------------------------------------------
const LANDSCAPE = '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>'
  + '<w:pgMar w:top="1080" w:right="1260" w:bottom="1080" w:left="1260" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>'

function withLandscape(buffer) {
  const zip = new PizZip(buffer)
  const xml = zip.file('word/document.xml').asText().replace('<w:sectPr/>', LANDSCAPE)
  zip.file('word/document.xml', xml)
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Ready-to-edit landscape certificate with every tag.
export function buildSampleCertificateDocx() {
  const center = { align: 'center' }
  const body = [
    paragraph('{{%logo}}', center),
    paragraph('{{empresa}}', { bold: true, size: 28, align: 'center' }),
    paragraph('Certificado de finalización', { bold: true, size: 56, align: 'center' }),
    paragraph('Se otorga el presente certificado a', { size: 24, align: 'center' }),
    paragraph('{{alumno}}', { bold: true, size: 48, align: 'center' }),
    paragraph('por haber concluido satisfactoriamente el curso', { size: 24, align: 'center' }),
    paragraph('{{curso}}', { bold: true, size: 32, align: 'center' }),
    paragraph('Duración: {{horas}} horas    Calificación: {{calificacion}}    Fecha: {{fecha}}', { size: 22, align: 'center' }),
    paragraph(''),
    paragraph('{{%firma}}', center),
    paragraph('______________________________', center),
    paragraph('{{instructor}}', { bold: true, size: 22, align: 'center' }),
    paragraph('Instructor', { size: 20, align: 'center' }),
    paragraph(''),
    paragraph('{{%qr}}', { align: 'right' }),
    paragraph('Folio {{folio}}', { size: 18, align: 'right' }),
  ].join('')
  return withLandscape(buildMinimalDocx(body))
}

// ---- data -----------------------------------------------------------------
const text = (value) => (value === null || value === undefined ? '' : String(value))

// certificate: { folio, learnerName, courseTitle, hours, issuedAt }.
// Image tags take the image key when the image exists, '' otherwise.
// guestVars: guestCertVars(learner.guest_profile) (empresa_alumno, campo_*...).
export function buildCertDocxData({ certificate, companyName = '', instructor = '', calificacion = '', images = {}, guestVars = {} }) {
  return {
    ...Object.fromEntries(Object.entries(guestVars ?? {}).map(([key, value]) => [key, text(value)])),
    alumno: text(certificate.learnerName),
    curso: text(certificate.courseTitle),
    fecha: certificate.issuedAt ? formatIssueDate(certificate.issuedAt) : '',
    horas: formatHours(Number(certificate.hours) || 0),
    folio: text(certificate.folio),
    empresa: text(companyName),
    instructor: text(instructor),
    calificacion: text(calificacion),
    qr: images.qr ? 'qr' : '',
    firma: images.firma ? 'firma' : '',
    logo: images.logo ? 'logo' : '',
  }
}

// Average of the best graded score per quiz and assignment lesson (0-100), '' when none.
export function averageGrade(quizScores = [], assignmentGrades = []) {
  const best = new Map()
  for (const row of [...quizScores, ...assignmentGrades]) {
    const value = Number(row.score)
    if (!Number.isFinite(value)) continue
    const key = row.lessonId
    best.set(key, Math.max(best.get(key) ?? -Infinity, value))
  }
  if (!best.size) return ''
  const avg = [...best.values()].reduce((sum, value) => sum + value, 0) / best.size
  return String(Math.round(avg))
}

// ---- images ---------------------------------------------------------------
// Pixel size of a PNG or JPEG; null when unknown.
export function imageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
      }
      offset += 2 + length
    }
  }
  return null
}

const BOXES = { qr: [110, 110], firma: [200, 80], logo: [200, 80] }

// Fits each image inside its box keeping the aspect ratio.
export function imageSizer(images) {
  return (key) => {
    const box = BOXES[key] ?? [200, 80]
    const dims = imageDimensions(images[key])
    if (!dims?.width || !dims?.height) return box
    const scale = Math.min(box[0] / dims.width, box[1] / dims.height)
    return [Math.max(1, Math.round(dims.width * scale)), Math.max(1, Math.round(dims.height * scale))]
  }
}

export const qrPng = (url) => QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 330 })

// Fills the template; images is { qr, firma, logo } (PNG/JPEG buffers or null).
// Throws TemplateError when the stored template no longer compiles.
export function renderCertificateDocx(buffer, data, images = {}) {
  const present = Object.fromEntries(Object.entries(images).filter(([, value]) => Buffer.isBuffer(value) && value.length))
  return renderDocx(buffer, data, { images: present, imageSize: imageSizer(present) })
}
