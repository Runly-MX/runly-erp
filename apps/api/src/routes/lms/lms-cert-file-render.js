// Renders a certificate from an uploaded template file:
//  - docx / pptx: filled with docxtemplater and converted by Office (Collabora);
//  - pdf: fields drawn on the first page with pdf-lib (no Office needed).
// Returns null when the built-in design must be used instead: no file, Office
// not configured, conversion failed, or a revoked Word/PowerPoint certificate
// (only the built-in design and the PDF renderer can stamp "REVOCADO").
import { isPdfImage } from './lms-cert-pdf.js'
import { buildCertDocxData, qrPng, renderCertificateDocx } from './lms-cert-docx.js'
import { renderCertificatePptx } from './lms-cert-pptx.js'
import { renderCertificateOnPdf } from './lms-cert-pdf-template.js'
import { readLayout } from './lms-cert-pdf-layout.js'

const OFFICE_RENDERERS = { docx: renderCertificateDocx, pptx: renderCertificatePptx }

// Keys (tag names without %) a template uses.
export function templateKeys(template) {
  if (template?.source === 'pdf') return new Set(readLayout(template.layout).fields.map((f) => f.key))
  return new Set((Array.isArray(template?.placeholders) ? template.placeholders : []).map((tag) => tag.replace(/^%+/, '')))
}

// store: createLmsCertFiles(); instructorName(template, certificate) and
// gradeFor(certificate) resolve the optional values.
export function createCertFileRenderer({ store, convertPdf, env, instructorName, gradeFor }) {
  async function render(companyId, certificate, template, verifyUrl, { brand, logoBuffer, signatureBuffer }) {
    const source = template?.source
    if (!template?.fileAssetId || !(source === 'pdf' || OFFICE_RENDERERS[source])) return null
    if (source !== 'pdf' && certificate.revokedAt) return null
    try {
      const asset = await store.findAsset(companyId, template.fileAssetId)
      if (!asset) return null
      const keys = templateKeys(template)
      const [buffer, qr, instructor, calificacion] = await Promise.all([
        store.read(asset),
        verifyUrl && keys.has('qr') ? qrPng(verifyUrl) : null,
        keys.has('instructor') ? instructorName(template, certificate) : '',
        keys.has('calificacion') ? gradeFor(certificate).catch(() => '') : '',
      ])
      const images = { qr, firma: isPdfImage(signatureBuffer) ? signatureBuffer : null, logo: isPdfImage(logoBuffer) ? logoBuffer : null }
      const data = buildCertDocxData({ certificate, companyName: brand.name, instructor, calificacion, images })
      if (source === 'pdf') {
        return await renderCertificateOnPdf({
          buffer, layout: template.layout, data, images, revoked: Boolean(certificate.revokedAt),
          title: `Certificado ${certificate.folio}`, issuedAt: certificate.issuedAt,
        })
      }
      return await convertPdf(OFFICE_RENDERERS[source](buffer, data, images), `certificado-${certificate.folio}.${source}`, { env })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error(`[runly.lms] ${source} certificate render failed`, error?.message)
      return null
    }
  }
  return { render }
}
