import sharp from 'sharp'
import { PDFDocument, cmyk, rgb } from 'pdf-lib'
import { StudioError } from '../../../../shared/studio/document.js'
import {STUDIO_EXPORT_LIMITS} from '../../../../shared/studio/export-limits.js'

// Print-ready PDF from a high-resolution render made by the editor. The
// browser only produces RGB pixels; here they become a CMYK JPEG (libvips,
// generic CMYK conversion) or stay RGB, framed with optional bleed and crop
// marks, with TrimBox/BleedBox for the printer. No document data is read.
const MM = 72 / 25.4
const MARK_OFFSET = 2, MARK_LENGTH = 5 // mm, outside the bleed area
let processing=false
const number = (value, min, max, label) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new StudioError(`${label} no válido.`)
  return parsed
}

export async function buildPrintPdf(input) {
  if(processing)throw new StudioError('Hay otra exportación PDF en curso. Reintenta al terminar.',429)
  processing=true
  try{return await renderPrintPdf(input)}finally{processing=false}
}
async function renderPrintPdf({ image, widthMm, heightMm, bleedMm = 0, cropMarks = false, profile = 'cmyk', title = 'Diseño' }) {
  const width = number(widthMm, 10, 2000, 'Ancho'), height = number(heightMm, 10, 2000, 'Alto'), bleed = number(bleedMm, 0, 10, 'Sangrado')
  if (!['rgb', 'cmyk'].includes(profile)) throw new StudioError('Perfil de color no válido.')
  if(!Buffer.isBuffer(image)||image.length>64*1024*1024)throw new StudioError('La imagen supera 64 MiB.',413)
  if(typeof cropMarks!=='boolean')throw new StudioError('Marcas de corte no válidas.')
  const expected={width:Math.ceil((width+2*bleed)/25.4*300),height:Math.ceil((height+2*bleed)/25.4*300)}
  if(expected.width>STUDIO_EXPORT_LIMITS.side||expected.height>STUDIO_EXPORT_LIMITS.side||expected.width*expected.height>STUDIO_EXPORT_LIMITS.printPixels)throw new StudioError('El PDF supera 32 megapíxeles o 16384 px por lado a 300 ppp.',413)
  let metadata
  try { metadata = await sharp(image, { limitInputPixels: STUDIO_EXPORT_LIMITS.printPixels }).metadata() } catch { throw new StudioError('La imagen de exportación no es válida.') }
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new StudioError('La imagen de exportación debe ser PNG.')
  if((metadata.pages??1)!==1||(metadata.orientation??1)!==1||metadata.width>16384||metadata.height>16384||metadata.width*metadata.height>STUDIO_EXPORT_LIMITS.printPixels)throw new StudioError('PNG multipágina, orientación o dimensiones no admitidas.')
  if(Math.abs(metadata.width-expected.width)>1||Math.abs(metadata.height-expected.height)>1)throw new StudioError('El render no corresponde a las medidas físicas y 300 ppp solicitados.')
  const flat = sharp(image, { limitInputPixels: STUDIO_EXPORT_LIMITS.printPixels }).flatten({ background: '#ffffff' })
  const bytes = profile === 'cmyk'
    ? await flat.toColourspace('cmyk').jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
    : await flat.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
  const margin = cropMarks ? bleed + MARK_OFFSET + MARK_LENGTH : bleed
  const pdf = await PDFDocument.create()
  pdf.setTitle(String(title).slice(0, 160)); pdf.setCreator('Runly Studio'); pdf.setProducer('Runly Studio')
  const page = pdf.addPage([(width + 2 * margin) * MM, (height + 2 * margin) * MM])
  const art = await pdf.embedJpg(bytes)
  // The render already covers the bleed: it is drawn over trim + bleed.
  page.drawImage(art, { x: (margin - bleed) * MM, y: (margin - bleed) * MM, width: (width + 2 * bleed) * MM, height: (height + 2 * bleed) * MM })
  page.setTrimBox(margin * MM, margin * MM, width * MM, height * MM)
  page.setBleedBox((margin - bleed) * MM, (margin - bleed) * MM, (width + 2 * bleed) * MM, (height + 2 * bleed) * MM)
  if (cropMarks) {
    // Registration colour so marks print on every plate.
    const color = profile === 'cmyk' ? cmyk(1, 1, 1, 1) : rgb(0, 0, 0), thickness = 0.25
    const trim = { left: margin, right: margin + width, bottom: margin, top: margin + height }
    const from = bleed + MARK_OFFSET, to = from + MARK_LENGTH
    for (const x of [trim.left, trim.right]) for (const [y, sign] of [[trim.bottom, -1], [trim.top, 1]]) {
      page.drawLine({ start: { x: x * MM, y: (y + sign * from) * MM }, end: { x: x * MM, y: (y + sign * to) * MM }, thickness, color })
    }
    for (const y of [trim.bottom, trim.top]) for (const [x, sign] of [[trim.left, -1], [trim.right, 1]]) {
      page.drawLine({ start: { x: (x + sign * from) * MM, y: y * MM }, end: { x: (x + sign * to) * MM, y: y * MM }, thickness, color })
    }
  }
  const output=Buffer.from(await pdf.save())
  if(output.length>64*1024*1024)throw new StudioError('El PDF supera 64 MiB.',413)
  return output
}
