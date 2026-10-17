// Certificates from an uploaded PowerPoint file: same tag contract and data as
// Word (lms-cert-docx.js), on the pptx engine (services/document-templates).
// Image tags replace the whole text box that holds them, so {{%qr}},
// {{%firma}} and {{%logo}} must each sit alone in their own text box; the
// image is fitted inside that box.
import { inspectPptx, renderPptx } from '../../services/document-templates/pptx-template.js'
import { EMU_PER_PT, SLIDE_16_9, buildMinimalPptx, frame, textBox } from '../../services/document-templates/minimal-pptx.js'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import { CERT_DOCX_MAX_BYTES, certTemplateWarnings, imageDimensions } from './lms-cert-docx.js'

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

// Validates an uploaded .pptx (compile + tag scan). Throws TemplateError.
export function inspectCertPptx(buffer, fileName = 'plantilla.pptx') {
  if (!/\.pptx$/i.test(String(fileName ?? ''))) throw new TemplateError('La plantilla debe ser una presentación de PowerPoint (.pptx).')
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TemplateError('Adjunta una presentación de PowerPoint (.pptx).')
  if (buffer.length > CERT_DOCX_MAX_BYTES) throw new TemplateError('La plantilla supera 10 MB.')
  const { tags } = inspectPptx(buffer)
  return { tags, warnings: certTemplateWarnings(tags) }
}

// ---- sample ---------------------------------------------------------------
const pt = (value) => Math.round(value * EMU_PER_PT)
const box = (x, y, w, h) => ({ x: pt(x), y: pt(y), cx: pt(w), cy: pt(h) })

// One landscape 16:9 slide (960 x 540 pt) with every tag.
export function buildSampleCertificatePptx() {
  const shapes = [
    frame({ ...box(18, 18, 924, 504), color: '4F46E5', width: 4 }),
    textBox('{{%logo}}', { ...box(400, 34, 160, 56), name: 'Logotipo' }),
    textBox('{{empresa}}', { ...box(80, 96, 800, 24), size: 14, bold: true, color: '374151' }),
    textBox('Certificado de finalización', { ...box(80, 126, 800, 52), size: 36, bold: true, color: '4F46E5' }),
    textBox('Se otorga el presente certificado a', { ...box(80, 184, 800, 22), size: 14, color: '4B5563' }),
    textBox('{{alumno}}', { ...box(80, 210, 800, 50), size: 32, bold: true }),
    textBox('por haber concluido satisfactoriamente el curso', { ...box(80, 264, 800, 22), size: 14, color: '4B5563' }),
    textBox('{{curso}}', { ...box(80, 288, 800, 36), size: 22, bold: true }),
    textBox('Duración: {{horas}} horas    Calificación: {{calificacion}}    Fecha: {{fecha}}', { ...box(80, 330, 800, 22), size: 12, color: '4B5563' }),
    textBox('{{%firma}}', { ...box(150, 372, 180, 58), name: 'Firma' }),
    textBox('______________________________', { ...box(120, 428, 240, 16), size: 12, color: '374151' }),
    textBox('{{instructor}}', { ...box(120, 448, 240, 20), size: 12, bold: true }),
    textBox('Instructor', { ...box(120, 468, 240, 18), size: 10, color: '6B7280' }),
    textBox('{{%qr}}', { ...box(820, 372, 96, 96), name: 'QR' }),
    textBox('Folio {{folio}}', { ...box(560, 474, 356, 18), size: 10, align: 'r', color: '374151' }),
  ]
  return buildMinimalPptx(shapes.join(''), SLIDE_16_9)
}

// ---- render ---------------------------------------------------------------
const DEFAULT_BOXES = { qr: [110, 110], firma: [200, 80], logo: [200, 80] }

// Fits each image inside its text box (pixels) keeping the aspect ratio.
export function pptxImageSizer(images) {
  return (key, tagName, textBoxSize) => {
    const area = textBoxSize ?? DEFAULT_BOXES[key] ?? [200, 80]
    const dims = imageDimensions(images[key])
    if (!dims?.width || !dims?.height) return area
    const scale = Math.min(area[0] / dims.width, area[1] / dims.height)
    return [Math.max(1, Math.round(dims.width * scale)), Math.max(1, Math.round(dims.height * scale))]
  }
}

// Fills the template; images is { qr, firma, logo } (PNG/JPEG buffers or null).
export function renderCertificatePptx(buffer, data, images = {}) {
  const present = Object.fromEntries(Object.entries(images).filter(([, value]) => Buffer.isBuffer(value) && value.length))
  return renderPptx(buffer, data, { images: present, imageSize: pptxImageSizer(present) })
}
