// "Sugerir etiquetas" for certificate .pptx files. Text lives in text boxes
// (<p:sp> shapes, <a:p> paragraphs, <a:t> runs) on ppt/slides/slideN.xml.
// Same vocabulary as Word (lms-cert-docx-suggest.js), applied to:
//  1. Line-only paragraphs ("________") with a caption right below: a known
//     label puts its tag on the line; a signature caption adds a {{%firma}}
//     text box right above the line.
//  2. Paragraphs: [NOMBRE] / «Curso» / <<Fecha>> placeholders, underscore
//     blanks after a label, "Folio:" labels with nothing after them, and
//     sample words ("NOMBRE DEL ALUMNO", "Nombre del participante").
// Image tags need their own text box (pptx image module), so a bracketed
// image placeholder sharing its box with other text is reported, not placed.
// A missing {{%qr}} gets its own box in the bottom-right corner of slide 1.
import PizZip from 'pizzip'
import { normalizeLabel } from '../../services/document-templates/docx-autotag.js'
import { EMU_PER_PT, textBox } from '../../services/document-templates/minimal-pptx.js'
import { renumberShapeIds, slideNames, slideText } from '../../services/document-templates/pptx-template.js'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import {
  BLANK, BRACKETS, CERT_LABELS, IMPORTANT, SIGNATURE, labelBefore, paragraphText, placeholderTag, plain, replaceTextRange,
} from './lms-cert-docx-suggest.js'

const SAMPLES = new Map(Object.entries({
  alumno: ['nombre del alumno', 'nombre de la alumna', 'nombre del participante', 'nombre de la participante', 'nombre del estudiante',
    'nombre del trabajador', 'nombre del colaborador', 'nombre del empleado', 'nombre completo', 'nombre y apellidos', 'nombre y apellido',
    'nombre apellido', 'nombre de la persona', 'nombre del asistente'],
  curso: ['nombre del curso', 'titulo del curso', 'nombre de la capacitacion', 'nombre del taller', 'nombre del diplomado', 'nombre del programa'],
  instructor: ['nombre del instructor', 'nombre de la instructora', 'nombre del capacitador', 'nombre del facilitador', 'nombre del ponente'],
  empresa: ['nombre de la empresa', 'razon social'],
  fecha: ['dd mm aaaa', 'dd mm yyyy', 'dd de mes de aaaa', 'dia mes ano', 'fecha de emision'],
}).flatMap(([tag, list]) => list.map((text) => [text, tag])))

const ROLE = /^(director|directora|instructor|instructora|responsable|coordinador|coordinadora|capacitador|capacitadora)\b/
const SHAPE = /<p:sp>[\s\S]*?<\/p:sp>/g
const PARA = /<a:p(?=[\s>])[\s\S]*?<\/a:p>/g
const IMAGE_TAGS = new Set(['%qr', '%firma', '%logo'])
const tagText = (tag) => `{{${tag}}}`
const isUpper = (text) => /[A-ZÁÉÍÓÚÑ]/.test(text) && text === text.toUpperCase()

// Tag for a whole paragraph that is sample text ("NOMBRE DEL ALUMNO").
export function sampleTag(text) {
  const raw = plain(String(text ?? '')).trim()
  const key = normalizeLabel(raw)
  if (!key || /\{\{/.test(raw)) return null
  if (SAMPLES.has(key)) return SAMPLES.get(key)
  return isUpper(raw) && key.split(' ').length <= 5 ? CERT_LABELS.get(key) ?? null : null
}

function shapeBox(shape) {
  const off = shape.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/)
  const ext = shape.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/)
  return off && ext ? { x: Number(off[1]), y: Number(off[2]), cx: Number(ext[1]), cy: Number(ext[2]) } : null
}

function paragraphsOf(xml) {
  const list = []
  for (const s of xml.matchAll(SHAPE)) {
    const shape = { start: s.index, xml: s[0], box: shapeBox(s[0]), text: slideText(s[0]).trim() }
    for (const p of s[0].matchAll(PARA)) {
      const start = s.index + p.index
      list.push({ shape, start, end: start + p[0].length, xml: p[0], text: paragraphText(p[0], 'a') })
    }
  }
  return list
}

// Plans the edits of one paragraph; returns the rewritten XML or null.
function rewriteParagraph(par, applied, unplaced) {
  const { text } = par
  if (!text.trim() || /\{\{/.test(text)) return null
  const edits = []
  const alone = (m) => par.shape.text === plain(m[0]).trim()
  for (const m of text.matchAll(BRACKETS)) {
    const content = m[1] ?? m[2] ?? m[3]
    const tag = placeholderTag(content)
    if (tag && IMAGE_TAGS.has(tag) && !alone(m)) unplaced.push(`${plain(m[0])} comparte su cuadro de texto; las imágenes necesitan un cuadro propio`)
    else if (tag) {
      edits.push({ start: m.index, end: m.index + m[0].length, tag })
      applied.push({ tag, label: plain(m[0]) })
    } else if (/[a-zA-Z]{2}/.test(content)) unplaced.push(plain(m[0]))
  }
  if (!edits.length) {
    const sample = sampleTag(text)
    if (sample) {
      const lead = text.length - text.trimStart().length
      edits.push({ start: lead, end: text.trimEnd().length, tag: sample })
      applied.push({ tag: sample, label: plain(text).trim() })
    }
  }
  if (!edits.length && text.replace(/[_\s]/g, '')) {
    let previousEnd = 0
    for (const m of text.matchAll(BLANK)) {
      const before = text.slice(previousEnd, m.index)
      const tag = labelBefore(plain(before)) ?? (/^\s*(horas|hrs|h)\b/i.test(text.slice(m.index + m[0].length)) ? 'horas' : null)
      previousEnd = m.index + m[0].length
      if (tag) {
        edits.push({ start: m.index, end: m.index + m[0].length, tag })
        applied.push({ tag, label: plain(before).replace(/[:\s]+$/, '').split(/\s+/).slice(-4).join(' ') || 'Línea' })
      } else unplaced.push(`Línea en blanco después de «${plain(before).trim().split(/\s+/).slice(-4).join(' ') || 'inicio del párrafo'}»`)
    }
  }
  // "Folio:" with nothing after it.
  const trimmed = text.trimEnd()
  if (!edits.length && trimmed.endsWith(':')) {
    const tag = CERT_LABELS.get(normalizeLabel(plain(trimmed)))
    if (tag) {
      edits.push({ start: trimmed.length - 1, end: trimmed.length, tag, keep: ': ' })
      applied.push({ tag, label: plain(trimmed).replace(/:$/, '') })
    }
  }
  if (!edits.length) return null
  return edits.sort((a, b) => b.start - a.start)
    .reduce((xml, e) => replaceTextRange(xml, e.start, e.end, `${e.keep ?? ''}${tagText(e.tag)}`, 'a'), par.xml)
}

function signatureShape(lineBox) {
  const height = 56 * EMU_PER_PT
  const y = Math.max(0, lineBox.y - height)
  return textBox('{{%firma}}', { x: lineBox.x, y, cx: lineBox.cx, cy: Math.min(height, lineBox.y - y) || height, name: 'Firma' })
}

function slideSize(zip) {
  const m = zip.file('ppt/presentation.xml')?.asText().match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"/)
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : { cx: 12192000, cy: 6858000 }
}

function rewriteSlide(xml, applied, unplaced) {
  const pars = paragraphsOf(xml)
  const edits = []
  const consumed = new Set()
  pars.forEach((par, i) => {
    if (!/_{4,}/.test(par.text) || par.text.replace(/[_\s]/g, '')) return
    const below = pars.slice(i + 1).find((next) => next.text.trim())
    const caption = below ? normalizeLabel(plain(below.text)) : ''
    if (!caption) return
    const placedSignature = applied.some((a) => a.tag === '%firma')
    if (SIGNATURE.test(caption) || (!placedSignature && ROLE.test(caption))) {
      if (placedSignature || !par.shape.box) return
      edits.push({ start: par.shape.start, end: par.shape.start, xml: signatureShape(par.shape.box) })
      applied.push({ tag: '%firma', label: plain(below.text).trim() })
      consumed.add(below.start)
      return
    }
    const tag = CERT_LABELS.get(caption)
    if (!tag) return
    const m = par.text.match(/_{4,}/)
    edits.push({ start: par.start, end: par.end, xml: replaceTextRange(par.xml, m.index, m.index + m[0].length, tagText(tag), 'a') })
    applied.push({ tag, label: plain(below.text).trim() })
    consumed.add(par.start).add(below.start)
  })
  for (const par of pars) {
    if (consumed.has(par.start)) continue
    const next = rewriteParagraph(par, applied, unplaced)
    if (next) edits.push({ start: par.start, end: par.end, xml: next })
  }
  return edits.sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((out, e) => out.slice(0, e.start) + e.xml + out.slice(e.end), xml)
}

export function suggestCertificatePptxTags(buffer) {
  let zip
  try { zip = new PizZip(buffer) } catch { throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.') }
  const names = slideNames(zip)
  if (!names.length) throw new TemplateError('El archivo no es una presentación de PowerPoint (.pptx) válida.')
  if (names.some((name) => /\{\{[^}]+\}\}/.test(slideText(zip.file(name).asText())))) {
    throw new TemplateError('Esta plantilla ya tiene etiquetas; edítala en PowerPoint si necesitas cambiarlas.')
  }
  const applied = []
  const unplaced = []
  for (const name of names) zip.file(name, rewriteSlide(zip.file(name).asText(), applied, unplaced))
  if (!applied.some((a) => a.tag === '%qr')) {
    const { cx, cy } = slideSize(zip)
    const side = Math.round(Math.min(cx, cy) * 0.16)
    const margin = Math.round(Math.min(cx, cy) * 0.05)
    const qr = textBox('{{%qr}}', { x: cx - side - margin, y: cy - side - margin, cx: side, cy: side, name: 'QR' })
    zip.file(names[0], zip.file(names[0]).asText().replace('</p:spTree>', `${qr}</p:spTree>`))
    applied.push({ tag: '%qr', label: 'Esquina inferior derecha (nuevo cuadro)' })
  }
  for (const name of names) zip.file(name, renumberShapeIds(zip.file(name).asText()))
  const placed = new Set(applied.map((a) => a.tag))
  return {
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    applied,
    missing: IMPORTANT.filter((tag) => !placed.has(tag)),
    unplaced: [...new Set(unplaced)],
  }
}
