// Certificate PDF: letter landscape, accent border, optional logo and signature
// (PNG/JPEG only), body with placeholders, folio and a verification QR.
// Deterministic for a given certificate: nothing time-based beyond issuedAt.
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { DEFAULT_CERT_BODY, DEFAULT_CERT_TITLE, formatHours, formatIssueDate, renderTemplateText } from './lms-cert-core.js'

const W = 792
const H = 612
const DEFAULT_ACCENT = '#7c3aed'

export function isPdfImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  return png || jpeg
}

const hex = (value) => (/^#[0-9a-f]{6}$/i.test(String(value ?? '')) ? value : null)

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

function drawImage(doc, buffer, x, y, fit) {
  if (!isPdfImage(buffer)) return false
  try {
    doc.image(buffer, x, y, { fit, align: 'center', valign: 'center' })
    return true
  } catch {
    return false
  }
}

function drawQr(doc, text, x, y, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const count = qr.modules.size
  const cell = size / count
  doc.save().fillColor('#000000')
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      // Slight overlap avoids hairline gaps between modules in some viewers.
      if (qr.modules.get(row, col)) doc.rect(x + col * cell, y + row * cell, cell + 0.2, cell + 0.2).fill()
    }
  }
  doc.restore()
}

// certificate: { folio, learnerName, courseTitle, hours, issuedAt, revokedAt }.
// template: stored template or null (defaults). verifyUrl: absolute URL or null (no QR).
export function renderCertificatePdf({ certificate, template = null, brand = null, companyName = null, verifyUrl = null, logoBuffer = null, signatureBuffer = null }) {
  const accent = hex(template?.accentColor) ?? hex(brand?.primaryColor) ?? DEFAULT_ACCENT
  const issuedAt = new Date(certificate.issuedAt)
  const title = template?.title || DEFAULT_CERT_TITLE
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margin: 0,
    info: { Title: `${title} ${certificate.folio}`, Author: companyName ?? 'Runly', CreationDate: issuedAt, ModDate: issuedAt },
  })
  const done = collect(doc)
  const fecha = formatIssueDate(issuedAt)
  const horas = formatHours(Number(certificate.hours) || 0)
  const vars = { alumno: certificate.learnerName, curso: certificate.courseTitle, fecha, horas, folio: certificate.folio, empresa: companyName ?? '' }

  // Frame
  doc.lineWidth(6).strokeColor(accent).rect(24, 24, W - 48, H - 48).stroke()
  doc.lineWidth(0.8).strokeColor(accent).rect(36, 36, W - 72, H - 72).stroke()

  let y = 60
  if (template?.showLogo !== false && drawImage(doc, logoBuffer, W / 2 - 90, y, [180, 60])) y += 72
  else if (companyName) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#374151').text(companyName, 60, y + 20, { width: W - 120, align: 'center' })
    y += 52
  }

  doc.font('Helvetica-Bold').fontSize(30).fillColor(accent).text(title, 60, y + 8, { width: W - 120, align: 'center' })
  y = doc.y + 14
  doc.font('Helvetica').fontSize(12).fillColor('#6b7280').text('Otorgado a', 60, y, { width: W - 120, align: 'center' })
  doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(certificate.learnerName, 60, doc.y + 6, { width: W - 120, align: 'center' })
  y = doc.y + 6
  doc.moveTo(W / 2 - 160, y).lineTo(W / 2 + 160, y).lineWidth(1).strokeColor(accent).stroke()

  const body = renderTemplateText(template ? template.body ?? '' : DEFAULT_CERT_BODY, vars)
  doc.font('Helvetica').fontSize(13).fillColor('#1f2937').text(body, 110, y + 18, { width: W - 220, align: 'center', lineGap: 3, height: 120, ellipsis: true })
  doc.font('Helvetica').fontSize(11).fillColor('#4b5563')
    .text(`Duración: ${horas} ${horas === '1' ? 'hora' : 'horas'}   |   Fecha: ${fecha}`, 60, Math.max(doc.y + 18, 360), { width: W - 120, align: 'center' })

  // Signer block (bottom center-left)
  const signX = 120
  const lineY = 500
  if (template?.signerName || template?.signerTitle || signatureBuffer) {
    drawImage(doc, signatureBuffer, signX + 20, lineY - 58, [180, 54])
    doc.moveTo(signX, lineY).lineTo(signX + 220, lineY).lineWidth(0.8).strokeColor('#374151').stroke()
    if (template?.signerName) doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(template.signerName, signX, lineY + 6, { width: 220, align: 'center' })
    if (template?.signerTitle) doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(template.signerTitle, signX, doc.y + 2, { width: 220, align: 'center' })
  }

  // Folio and QR (bottom right)
  const qrSize = 78
  const qrX = W - 60 - qrSize
  const qrY = H - 60 - qrSize - 14
  if (verifyUrl) {
    drawQr(doc, verifyUrl, qrX, qrY, qrSize)
    doc.font('Helvetica').fontSize(7).fillColor('#6b7280').text('Escanea para verificar', qrX - 20, qrY + qrSize + 4, { width: qrSize + 20, align: 'right' })
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151').text(`Folio ${certificate.folio}`, qrX - 160, qrY + qrSize - 12, { width: 150, align: 'right' })

  if (certificate.revokedAt) {
    doc.save()
    doc.rotate(-28, { origin: [W / 2, H / 2] })
    doc.fillOpacity(0.3).fillColor('#dc2626').font('Helvetica-Bold').fontSize(110).text('REVOCADO', 0, H / 2 - 60, { width: W, align: 'center', lineBreak: false })
    doc.restore()
  }

  doc.end()
  return done
}
