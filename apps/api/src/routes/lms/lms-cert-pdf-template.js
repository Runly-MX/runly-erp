// Certificates on an uploaded PDF (no Office needed): the first page is the
// background and each layout field is drawn on top. The generic engine lives
// in services/document-templates/pdf-template.js; this file adds the
// "REVOCADO" stamp and the certificate image fields.
import { degrees, rgb } from 'pdf-lib'
import { PDF_MIME, encodableText, fillPdf, inspectPdf } from '../../services/document-templates/pdf-template.js'
import { IMAGE_FIELDS } from './lms-cert-pdf-layout.js'

export { PDF_MIME, encodableText }
const STAMP = 'REVOCADO'

// Validates an uploaded PDF and returns its first page size (points).
export const inspectCertPdf = (buffer, fileName = 'plantilla.pdf') => inspectPdf(buffer, fileName)

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
export function renderCertificateOnPdf({ buffer, layout, data = {}, images = {}, revoked = false, title = 'Certificado', issuedAt = null }) {
  return fillPdf({
    buffer, layout, data, images, imageKeys: IMAGE_FIELDS, title, issuedAt,
    decorate: revoked ? ({ page, fonts, box }) => drawStamp(page, fonts.bold, box) : null,
  })
}
