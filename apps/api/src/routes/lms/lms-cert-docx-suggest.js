// "Sugerir etiquetas" for certificate .docx files. Two passes:
//  1. The custody autotag engine with a certificate vocabulary: label cells
//     ("Nombre" | empty cell), "Folio: ______" lines and "Firma" cells.
//  2. Certificate wording inside paragraphs: [NOMBRE], «Curso», <<Fecha>>
//     placeholders and long underscore lines after a label ("Se otorga a
//     ________ por concluir el curso ________").
// The result is a copy for the author to review; what could not be placed is
// reported (missing tags and unrecognized blanks).
import PizZip from 'pizzip'
import { normalizeLabel, suggestDocxTagsWithLabels } from '../../services/document-templates/docx-autotag.js'

const GROUPS = {
  alumno: [
    'nombre', 'nombre completo', 'nombre del alumno', 'nombre de la alumna', 'nombre del participante', 'nombre de la participante',
    'nombre del estudiante', 'nombre del trabajador', 'nombre del colaborador', 'nombre del empleado', 'alumno', 'alumna',
    'participante', 'estudiante', 'trabajador', 'colaborador', 'empleado', 'otorga a', 'se otorga a', 'otorgado a', 'otorgada a',
    'a nombre de', 'se otorga el presente a', 'se otorga la presente a', 'otorga el presente certificado a',
    'otorga el presente reconocimiento a', 'otorga el presente diploma a', 'otorga la presente constancia a',
    'certifica que', 'hace constar que', 'otorgan a', 'otorga la presente a', 'otorga el presente a',
  ],
  curso: [
    'curso', 'nombre del curso', 'el curso', 'capacitacion', 'nombre de la capacitacion', 'la capacitacion', 'curso de capacitacion',
    'taller', 'el taller', 'diplomado', 'el diplomado', 'programa', 'tema', 'modulo', 'concluyo el curso', 'curso denominado',
    'por haber concluido el curso', 'por haber acreditado el curso', 'por haber aprobado el curso', 'por haber completado el curso',
    'por su participacion en el curso', 'por haber asistido al curso', 'asistio al curso', 'acredito el curso',
  ],
  fecha: [
    'fecha', 'fecha de emision', 'fecha de expedicion', 'fecha de conclusion', 'fecha de termino', 'fecha de finalizacion',
    'fecha del curso', 'expedido el', 'expedida el', 'emitido el', 'el dia', 'concluido el', 'lugar y fecha',
  ],
  folio: [
    'folio', 'no de folio', 'numero de folio', 'folio no', 'no de certificado', 'numero de certificado', 'certificado no',
    'no de registro', 'numero de registro', 'registro', 'clave', 'no de constancia',
  ],
  horas: [
    'horas', 'duracion', 'duracion del curso', 'horas de capacitacion', 'numero de horas', 'total de horas', 'no de horas',
    'con una duracion de', 'duracion de', 'con duracion de', 'horas totales', 'carga horaria',
  ],
  instructor: [
    'instructor', 'instructora', 'nombre del instructor', 'nombre de la instructora', 'capacitador', 'capacitadora',
    'facilitador', 'facilitadora', 'ponente', 'impartido por', 'expositor', 'docente', 'profesor', 'profesora', 'tutor',
  ],
  calificacion: ['calificacion', 'calificacion final', 'calificacion obtenida', 'puntuacion', 'promedio', 'promedio final', 'resultado'],
  empresa: ['empresa', 'nombre de la empresa', 'razon social', 'institucion', 'organizacion', 'centro de trabajo', 'dependencia'],
}

export const CERT_LABELS = new Map(Object.entries(GROUPS).flatMap(([tag, labels]) => labels.map((label) => [label, tag])))

// Placeholder keywords for [..] / «..» contents, checked in order.
const KEYWORDS = [
  [/\b(qr|codigo)\b/, '%qr'], [/\b(logo|logotipo)\b/, '%logo'], [/\bfirma\b/, '%firma'],
  [/\b(instructor|instructora|capacitador|facilitador|ponente|docente|profesor)\b/, 'instructor'],
  [/\b(curso|capacitacion|taller|diplomado|programa)\b/, 'curso'],
  [/\bfecha\b/, 'fecha'], [/\bfolio\b/, 'folio'], [/\b(horas|duracion)\b/, 'horas'],
  [/\b(calificacion|puntuacion|promedio)\b/, 'calificacion'], [/\b(empresa|razon social|institucion)\b/, 'empresa'],
  [/\b(nombre|alumno|alumna|participante|estudiante|trabajador|colaborador)\b/, 'alumno'],
]

export const SIGNATURE = /^(firma|nombre y firma|firma del instructor|firma de la instructora|firma autorizada|firma de quien otorga|firma del director|firma del responsable)\b/
const GRANT = /\b(otorga|otorgan|otorgado|otorgada|confiere|entrega|reconoce)\b(?: [a-z]+){0,4} a$/
export const IMPORTANT = ['alumno', 'curso', 'fecha', 'folio', '%qr']
const MAX_LABEL_WORDS = 7

export function placeholderTag(content) {
  const key = normalizeLabel(content)
  if (!/[a-z]/.test(key)) return null
  return CERT_LABELS.get(key) ?? KEYWORDS.find(([pattern]) => pattern.test(key))?.[1] ?? null
}

// Tag for the label text right before a blank ("... por concluir el curso").
export function labelBefore(prefix) {
  const words = normalizeLabel(prefix).split(' ').filter(Boolean)
  for (let n = Math.min(MAX_LABEL_WORDS, words.length); n >= 1; n -= 1) {
    const tag = CERT_LABELS.get(words.slice(-n).join(' '))
    if (tag) return tag
  }
  return GRANT.test(words.slice(-6).join(' ')) ? 'alumno' : null
}

// Text runs: <w:t> in Word, <a:t> in PowerPoint.
const T_NODES = {
  w: /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g,
  a: /(<a:t(?:\s[^>]*)?>)([^<]*)(<\/a:t>)/g,
}
const PARAGRAPH = /<w:p(?=[\s>])[\s\S]*?<\/w:p>/g

function textNodes(p, ns = 'w') {
  const nodes = []
  let offset = 0
  for (const m of p.matchAll(T_NODES[ns])) {
    const contentStart = m.index + m[1].length
    nodes.push({ contentStart, contentEnd: contentStart + m[2].length, text: m[2], from: offset, to: offset + m[2].length })
    offset += m[2].length
  }
  return nodes
}

// Replaces text range [start, end) of a paragraph's concatenated text, even
// when Word split it across runs: the first run gets the tag, the rest lose
// their share of the range.
export function replaceTextRange(p, start, end, replacement, ns = 'w') {
  const nodes = textNodes(p, ns).filter((n) => n.to > start && n.from < end)
  let out = p
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const n = nodes[i]
    const keepBefore = n.text.slice(0, Math.max(0, start - n.from))
    const keepAfter = n.text.slice(Math.min(n.text.length, end - n.from))
    const next = i === 0 ? `${keepBefore}${replacement}${keepAfter}` : keepAfter
    out = out.slice(0, n.contentStart) + next + out.slice(n.contentEnd)
  }
  // Leading/trailing spaces around the tag must survive (Word only; <a:t> keeps them).
  if (ns !== 'w') return out
  return out.replace(/<w:t>(?=[^<]*\{\{)/g, '<w:t xml:space="preserve">')
}

export const BRACKETS = /\[\s*([^[\]{}]{2,60}?)\s*\]|«\s*([^«»{}]{2,60}?)\s*»|&lt;&lt;\s*((?:(?!&gt;)[^{}<]){2,60}?)\s*&gt;&gt;/g
export const BLANK = /_{4,}/g
const tagText = (tag) => `{{${tag}}}`
export const paragraphText = (p, ns = 'w') => textNodes(p, ns).map((n) => n.text).join('')
export const plain = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function rewriteParagraph(p, applied, unplaced) {
  const text = paragraphText(p)
  if (!text.trim() || /\{\{/.test(text)) return p
  const edits = []
  for (const m of text.matchAll(BRACKETS)) {
    const content = m[1] ?? m[2] ?? m[3]
    const tag = placeholderTag(content)
    if (tag) {
      edits.push({ start: m.index, end: m.index + m[0].length, tag })
      applied.push({ tag, label: plain(m[0]) })
    } else if (/[a-zA-Z]{2}/.test(content)) unplaced.push(plain(m[0]))
  }
  // A paragraph that is only a line is a signature/fill line (handled with its neighbours).
  if (text.replace(/[_\s]/g, '')) {
    let previousEnd = 0
    for (const m of text.matchAll(BLANK)) {
      if (edits.some((e) => m.index >= e.start && m.index < e.end)) continue
      const before = text.slice(previousEnd, m.index)
      const after = text.slice(m.index + m[0].length)
      const tag = labelBefore(plain(before)) ?? (/^\s*(horas|hrs|h)\b/i.test(after) ? 'horas' : null)
      previousEnd = m.index + m[0].length
      if (tag) {
        edits.push({ start: m.index, end: m.index + m[0].length, tag })
        applied.push({ tag, label: plain(before).replace(/[:\s]+$/, '').split(/\s+/).slice(-4).join(' ') || 'Línea' })
      } else {
        unplaced.push(`Línea en blanco después de «${plain(before).trim().split(/\s+/).slice(-4).join(' ') || 'inicio del párrafo'}»`)
      }
    }
  }
  return edits.sort((a, b) => b.start - a.start).reduce((xml, e) => replaceTextRange(xml, e.start, e.end, tagText(e.tag)), p)
}

const signatureParagraph = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">{{%firma}}</w:t></w:r></w:p>'

// Line-only paragraphs: a label or signature caption right below decides.
function rewriteLines(xml, applied) {
  const pars = [...xml.matchAll(PARAGRAPH)].map((m) => ({ start: m.index, end: m.index + m[0].length, xml: m[0] }))
  const placedSignature = applied.some((a) => a.tag === '%firma')
  const edits = []
  pars.forEach((par, i) => {
    const text = paragraphText(par.xml)
    if (!/_{4,}/.test(text) || text.replace(/[_\s]/g, '')) return
    const below = pars.slice(i + 1).find((next) => paragraphText(next.xml).trim())
    const caption = below ? normalizeLabel(plain(paragraphText(below.xml))) : ''
    if (!caption) return
    if (SIGNATURE.test(caption) || (!placedSignature && /^(director|directora|instructor|instructora|responsable|coordinador|coordinadora)\b/.test(caption))) {
      if (edits.some((e) => e.signature)) return
      edits.push({ signature: true, at: par.start, insert: signatureParagraph })
      applied.push({ tag: '%firma', label: plain(paragraphText(below.xml)).trim() })
      return
    }
    const tag = CERT_LABELS.get(caption)
    if (!tag) return
    const m = text.match(/_{4,}/)
    edits.push({ at: par.start, end: par.end, replace: replaceTextRange(par.xml, m.index, m.index + m[0].length, tagText(tag)) })
    applied.push({ tag, label: plain(paragraphText(below.xml)).trim() })
  })
  return edits.sort((a, b) => b.at - a.at).reduce((out, e) => (e.signature
    ? out.slice(0, e.at) + e.insert + out.slice(e.at)
    : out.slice(0, e.at) + e.replace + out.slice(e.end)), xml)
}

export function suggestCertificateTags(buffer) {
  const first = suggestDocxTagsWithLabels(buffer, {
    labels: CERT_LABELS,
    // The engine writes {{%<tag>}} next to signature captions.
    signatures: [{ pattern: SIGNATURE, tag: 'firma' }],
  })
  const applied = first.applied.map((a) => ({ ...a, tag: a.tag === 'firma' ? '%firma' : a.tag }))
  const unplaced = []
  const zip = new PizZip(first.buffer)
  let xml = zip.file('word/document.xml').asText()
  xml = rewriteLines(xml, applied)
  xml = xml.replace(PARAGRAPH, (p) => rewriteParagraph(p, applied, unplaced))
  zip.file('word/document.xml', xml)
  const placed = new Set(applied.map((a) => a.tag))
  return {
    buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    applied,
    missing: IMPORTANT.filter((tag) => !placed.has(tag)),
    unplaced: [...new Set(unplaced)],
  }
}
