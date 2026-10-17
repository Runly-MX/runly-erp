// Certificates on an uploaded PDF: the field layout contract and the
// "Detectar campos" matcher. Pure functions, no I/O.
//
// Coordinates are PDF points from the TOP-LEFT corner of the first page
// (x right, y down), the same frame the editor draws in; the renderer flips y.
// layout = { page: { width, height }, fields: [{ key, x, y, w, h, fontSize,
// color, align, bold, background }] }. background (hex or null) paints a box
// under the text, used to cover sample text such as "NOMBRE DEL ALUMNO".
import { normalizeLabel } from '../../services/document-templates/docx-autotag.js'
import { LmsError } from './lms-error.js'
import { CERT_DOCX_IMAGE_TAGS, CERT_DOCX_SCALAR_TAGS } from './lms-cert-docx.js'
import { CERT_LABELS, SIGNATURE, labelBefore, placeholderTag } from './lms-cert-docx-suggest.js'
import { sampleTag } from './lms-cert-pptx-suggest.js'

export const CERT_FIELD_KEYS = [...CERT_DOCX_SCALAR_TAGS, ...CERT_DOCX_IMAGE_TAGS]
export const IMAGE_FIELDS = new Set(CERT_DOCX_IMAGE_TAGS)
export const FIELD_LABELS = {
  alumno: 'Alumno', curso: 'Curso', fecha: 'Fecha', horas: 'Horas', folio: 'Folio', empresa: 'Empresa',
  instructor: 'Instructor', calificacion: 'Calificación', qr: 'Código QR', firma: 'Firma', logo: 'Logotipo',
}
const ALIGNS = new Set(['left', 'center', 'right'])
const HEX = /^#[0-9a-f]{6}$/i
const MIN_SIZE = 4
const EDGE = 0.5 // tolerance (points) for fields touching the page edge
const IMPORTANT = ['alumno', 'curso', 'fecha', 'folio']

const round = (value) => Math.round(value * 100) / 100
const bad = (message) => new LmsError(message, 400)

export const emptyLayout = (page = null) => ({ page, fields: [] })

// Stored JSON -> { page, fields } (never throws; unknown data is dropped).
export function readLayout(value) {
  const page = value?.page && Number(value.page.width) > 0 && Number(value.page.height) > 0
    ? { width: Number(value.page.width), height: Number(value.page.height) } : null
  return { page, fields: Array.isArray(value?.fields) ? value.fields : [] }
}

function number(value, label, what) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) throw bad(`${label}: ${what} no es un número válido.`)
  return n
}

// Validates fields against the page; returns the normalized layout. Throws LmsError 400.
export function normalizeCertLayout(input, page) {
  if (!(page?.width > 0 && page?.height > 0)) throw bad('La plantilla no tiene el tamaño de página; vuelve a subir el PDF.')
  const list = Array.isArray(input) ? input : input?.fields
  if (!Array.isArray(list)) throw bad('Envía la lista de campos.')
  if (list.length > CERT_FIELD_KEYS.length) throw bad(`Máximo ${CERT_FIELD_KEYS.length} campos.`)
  const seen = new Set()
  const fields = list.map((raw) => {
    const key = String(raw?.key ?? '')
    if (!CERT_FIELD_KEYS.includes(key)) throw bad(`Campo desconocido: «${key || 'sin clave'}».`)
    if (seen.has(key)) throw bad(`El campo ${FIELD_LABELS[key]} está repetido.`)
    seen.add(key)
    const label = FIELD_LABELS[key]
    const x = number(raw.x, label, 'la posición horizontal')
    const y = number(raw.y, label, 'la posición vertical')
    const w = number(raw.w, label, 'el ancho')
    const h = number(raw.h, label, 'el alto')
    if (w < MIN_SIZE || h < MIN_SIZE) throw bad(`${label}: el campo es demasiado pequeño.`)
    if (x < -EDGE || y < -EDGE || x + w > page.width + EDGE || y + h > page.height + EDGE) throw bad(`${label}: el campo queda fuera de la página.`)
    const field = { key, x: round(Math.max(0, x)), y: round(Math.max(0, y)), w: round(w), h: round(h) }
    if (IMAGE_FIELDS.has(key)) return field
    const fontSize = raw.fontSize === undefined || raw.fontSize === null ? 14 : number(raw.fontSize, label, 'el tamaño de letra')
    if (fontSize < 4 || fontSize > 144) throw bad(`${label}: el tamaño de letra debe estar entre 4 y 144 puntos.`)
    const color = raw.color ? String(raw.color).toLowerCase() : '#111827'
    if (!HEX.test(color)) throw bad(`${label}: el color debe ser hexadecimal, por ejemplo #111827.`)
    const align = raw.align ? String(raw.align) : 'left'
    if (!ALIGNS.has(align)) throw bad(`${label}: alineación inválida.`)
    const background = raw.background ? String(raw.background).toLowerCase() : null
    if (background && !HEX.test(background)) throw bad(`${label}: el color de fondo debe ser hexadecimal.`)
    return { ...field, fontSize: round(fontSize), color, align, bold: raw.bold === true, background }
  })
  return { page: { width: page.width, height: page.height }, fields }
}

// ---- "Detectar campos" ------------------------------------------------------
// items: pdfjs-like text items of page 1 as { str, x, y, w, h } (top-left
// points, h = font size). Lines are rebuilt from items on the same baseline.
export function groupLines(items) {
  const sorted = items.filter((i) => String(i?.str ?? '').length && i.h > 0)
    .map((i) => ({ ...i, base: i.y + i.h })).sort((a, b) => a.base - b.base || a.x - b.x)
  const lines = []
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.base - item.base) <= Math.max(2, 0.3 * Math.min(l.h, item.h)))
    if (line) { line.items.push(item); line.h = Math.max(line.h, item.h) } else lines.push({ base: item.base, h: item.h, items: [item] })
  }
  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x)
    let text = ''
    const spans = []
    for (const item of line.items) {
      const prev = spans[spans.length - 1]
      if (prev && item.x - (prev.x + prev.w) > 0.15 * line.h && !/\s$/.test(text) && !/^\s/.test(item.str)) text += ' '
      spans.push({ from: text.length, to: text.length + item.str.length, x: item.x, w: item.w })
      text += item.str
    }
    const x = line.items[0].x
    const last = line.items[line.items.length - 1]
    return { text, spans, x, w: last.x + last.w - x, y: line.base - line.h, h: line.h, base: line.base }
  }).sort((a, b) => a.base - b.base || a.x - b.x)
}

// x of a character index inside a line (interpolated within its item).
export function xAt(line, index) {
  const span = line.spans.find((s) => index >= s.from && index < s.to) ?? (index >= line.text.length ? line.spans[line.spans.length - 1] : null)
  if (!span) return line.x
  const len = Math.max(1, span.to - span.from)
  return span.x + span.w * (Math.min(index, span.to) - span.from) / len
}

const PLACEHOLDER = /\[\s*([^[\]{}]{2,60}?)\s*\]|«\s*([^«»{}]{2,60}?)\s*»|<<\s*([^<>{}]{2,60}?)\s*>>|\{\{\s*(%?[a-z]+)\s*\}\}/g
const ROLE = /^(director|directora|instructor|instructora|responsable|coordinador|coordinadora)\b/
const keyOf = (tag) => (tag ? tag.replace(/^%/, '') : null)

function textField(key, { x, y, w, h, fontSize, align = 'left', background = null }) {
  return { key, x, y, w, h, fontSize: Math.round(Math.min(72, Math.max(8, fontSize)) * 2) / 2, color: '#111827', align, bold: key === 'alumno', background }
}

function imageField(key, cx, cy, size) {
  const [w, h] = key === 'qr' ? [size, size] : [Math.max(size * 2, 120), Math.max(size * 0.8, 48)]
  return { key, x: cx - w / 2, y: cy - h / 2, w, h }
}

// A whole-line value: centered lines span the printable width.
function lineField(key, line, page, background) {
  if (IMAGE_FIELDS.has(key)) return imageField(key, line.x + line.w / 2, line.y + line.h / 2, Math.max(72, line.h * 3))
  const centered = Math.abs(line.x + line.w / 2 - page.width / 2) < page.width * 0.08
  const pad = line.h * 0.25
  const x = centered ? page.width * 0.1 : line.x
  const w = centered ? page.width * 0.8 : Math.max(line.w, Math.min(260, page.width - line.x - 36))
  return textField(key, { x, y: line.y - pad, w, h: line.h + pad * 2, fontSize: line.h, align: centered ? 'center' : 'left', background })
}

// A value written on an underscore line [x0, x1] whose baseline is `base`.
function onLine(key, x0, x1, base, size) {
  const fontSize = Math.min(28, Math.max(9, size))
  return textField(key, { x: x0, y: base - fontSize * 1.4 - 1, w: Math.max(x1 - x0, 40), h: fontSize * 1.4, fontSize, align: 'center' })
}

function clampField(field, page) {
  const w = Math.min(field.w, page.width), h = Math.min(field.h, page.height)
  const x = Math.min(Math.max(0, field.x), page.width - w), y = Math.min(Math.max(0, field.y), page.height - h)
  return { ...field, x: round(x), y: round(y), w: round(w), h: round(h) }
}

export function suggestLayoutFromItems(items, page) {
  const lines = groupLines(items ?? [])
  const found = []
  const add = (field, label) => { if (field) found.push({ field, label: String(label).trim().slice(0, 80) }) }
  lines.forEach((line, i) => {
    const { text } = line
    let used = false
    for (const m of text.matchAll(PLACEHOLDER)) {
      const key = m[4] ? keyOf(m[4]) : keyOf(placeholderTag(m[1] ?? m[2] ?? m[3]))
      if (!key || !CERT_FIELD_KEYS.includes(key)) continue
      used = true
      if (m[0].length >= text.trim().length - 1) { add(lineField(key, line, page, '#ffffff'), m[0]); continue }
      const x0 = xAt(line, m.index), x1 = xAt(line, m.index + m[0].length)
      add(IMAGE_FIELDS.has(key)
        ? imageField(key, (x0 + x1) / 2, line.y + line.h / 2, Math.max(72, line.h * 3))
        : textField(key, { x: x0, y: line.y - line.h * 0.2, w: Math.max(x1 - x0, Math.min(220, page.width - x0 - 36)), h: line.h * 1.4, fontSize: line.h, background: '#ffffff' }), m[0])
    }
    if (used) return
    const sample = keyOf(sampleTag(text))
    if (sample) { add(lineField(sample, line, page, '#ffffff'), text); return }
    const blanks = [...text.matchAll(/_{4,}/g)]
    if (blanks.length && !text.replace(/[_\s]/g, '')) {
      const x0 = xAt(line, blanks[0].index), x1 = xAt(line, blanks[blanks.length - 1].index + blanks[blanks.length - 1][0].length)
      const below = lines.slice(i + 1).find((l) => l.base - line.base < line.h * 3.5 && l.x < x1 && l.x + l.w > x0 && l.text.trim())
      const caption = below ? normalizeLabel(below.text) : ''
      if (SIGNATURE.test(caption) || ROLE.test(caption)) {
        add({ key: 'firma', x: (x0 + x1) / 2 - 80, y: line.base - 64, w: 160, h: 60 }, below.text)
      } else if (CERT_LABELS.get(caption)) add(onLine(CERT_LABELS.get(caption), x0, x1, line.base, below.h * 1.2), below.text)
      return
    }
    let previous = 0
    for (const m of blanks) {
      const key = labelBefore(text.slice(previous, m.index))
      previous = m.index + m[0].length
      if (key) add(onLine(key, xAt(line, m.index), xAt(line, m.index + m[0].length), line.base, line.h), text.slice(0, m.index).trim().split(/\s+/).slice(-4).join(' '))
    }
    if (blanks.length) return
    const label = /^(.{2,40}?):\s*$/.exec(text.trim())
    const key = label ? CERT_LABELS.get(normalizeLabel(label[1])) : null
    if (key) {
      const x = line.x + line.w + 4
      add(textField(key, { x, y: line.y - line.h * 0.2, w: Math.min(240, page.width - x - 24), h: line.h * 1.4, fontSize: line.h }), label[1])
    }
  })
  // One field per key: the largest text wins for names, otherwise the first.
  const byKey = new Map()
  for (const entry of found) {
    const current = byKey.get(entry.field.key)
    if (!current || (['alumno', 'curso'].includes(entry.field.key) && (entry.field.fontSize ?? 0) > (current.field.fontSize ?? 0))) byKey.set(entry.field.key, entry)
  }
  const defaulted = []
  if (!byKey.has('qr')) {
    const size = Math.round(Math.min(page.width, page.height) * 0.13)
    byKey.set('qr', { field: { key: 'qr', x: page.width - size - 36, y: page.height - size - 36, w: size, h: size }, label: null })
    defaulted.push('qr')
  }
  const fields = CERT_FIELD_KEYS.filter((key) => byKey.has(key)).map((key) => clampField(byKey.get(key).field, page))
  return {
    page,
    fields,
    matched: CERT_FIELD_KEYS.filter((key) => byKey.get(key)?.label).map((key) => ({ key, label: byKey.get(key).label })),
    defaulted,
    missing: IMPORTANT.filter((key) => !byKey.has(key)),
  }
}
