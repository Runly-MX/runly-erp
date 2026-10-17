// Pure geometry for the PDF certificate field editor (API lms-cert-pdf-layout.js).
// Fields are PDF points from the top-left corner of the page; the editor
// multiplies by `scale` (rendered px per point) to draw them.

export const FIELD_KEYS = ['alumno', 'curso', 'fecha', 'horas', 'folio', 'empresa', 'instructor', 'calificacion', 'empresa_alumno', 'numero_empleado', 'puesto', 'qr', 'firma', 'logo']
// campo_<key>: a custom intake answer of share-link guests (API isCertFieldKey).
export const CUSTOM_FIELD_RE = /^campo_[a-z][a-z0-9_]{0,23}$/
export const IMAGE_FIELDS = new Set(['qr', 'firma', 'logo'])
export const FIELD_LABELS = {
  alumno: 'Alumno', curso: 'Curso', fecha: 'Fecha', horas: 'Horas', folio: 'Folio', empresa: 'Empresa',
  instructor: 'Instructor', calificacion: 'Calificación', qr: 'Código QR', firma: 'Firma', logo: 'Logotipo',
  empresa_alumno: 'Empresa del alumno', numero_empleado: 'Número de empleado', puesto: 'Puesto',
}
// Sample values drawn inside the boxes (same as the API preview).
export const FIELD_SAMPLES = {
  alumno: 'Nombre del alumno', curso: 'Nombre del curso', fecha: '16 de octubre de 2026', horas: '2', folio: '2026-000000',
  empresa: 'Empresa', instructor: 'Nombre del instructor', calificacion: '95',
  empresa_alumno: 'Empresa del alumno', numero_empleado: '000123', puesto: 'Puesto del alumno',
}
export const ALIGN_OPTIONS = [{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]
export const MIN_FIELD = 8

const round = (value) => Math.round(value * 10) / 10
const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max))

export const fieldLabel = (key) => FIELD_LABELS[key] ?? (CUSTOM_FIELD_RE.test(key) ? `Campo ${key.slice(6)}` : key)

// "Planta" / "planta" / "campo_planta" -> "campo_planta", or null.
export function customFieldKey(text) {
  const slug = String(text ?? '').trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/^campo_/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
  const key = `campo_${slug}`
  return CUSTOM_FIELD_RE.test(key) ? key : null
}

export const isImageField = (key) => IMAGE_FIELDS.has(key)

// Keeps a field inside the page and above the minimum size.
export function clampField(field, page) {
  const w = clamp(field.w, MIN_FIELD, page.width)
  const h = clamp(field.h, MIN_FIELD, page.height)
  return { ...field, x: round(clamp(field.x, 0, page.width - w)), y: round(clamp(field.y, 0, page.height - h)), w: round(w), h: round(h) }
}

// A new field centered on the page with a size that fits its kind.
export function defaultField(key, page) {
  const size = Math.min(page.width, page.height)
  if (key === 'qr') return clampField({ key, x: page.width - size * 0.13 - 36, y: page.height - size * 0.13 - 36, w: size * 0.13, h: size * 0.13 }, page)
  if (isImageField(key)) return clampField({ key, x: page.width / 2 - 80, y: page.height / 2 - 30, w: 160, h: 60 }, page)
  const big = key === 'alumno' || key === 'curso'
  const w = big ? page.width * 0.7 : 220
  const fontSize = key === 'alumno' ? 28 : key === 'curso' ? 20 : 12
  return clampField({
    key, x: (page.width - w) / 2, y: page.height / 2 - fontSize, w, h: fontSize * 1.6,
    fontSize, color: '#111827', align: big ? 'center' : 'left', bold: key === 'alumno', background: null,
  }, page)
}

// Moves by (dx, dy) points, staying inside the page.
export const moveField = (field, dx, dy, page) => clampField({ ...field, x: field.x + dx, y: field.y + dy }, page)

// Resizes from a handle (n, s, e, w or a corner such as 'se') by (dx, dy) points.
export function resizeField(field, handle, dx, dy, page) {
  let { x, y, w, h } = field
  if (handle.includes('e')) w = clamp(w + dx, MIN_FIELD, page.width - x)
  if (handle.includes('s')) h = clamp(h + dy, MIN_FIELD, page.height - y)
  if (handle.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN_FIELD); w += x - nx; x = nx }
  if (handle.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN_FIELD); h += y - ny; y = ny }
  return clampField({ ...field, x, y, w, h }, page)
}

// Arrow-key nudge: 1 point, 10 with Shift. null for other keys.
export function nudge(key, shift = false) {
  const step = shift ? 10 : 1
  return { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key] ?? null
}

// Replaces (or adds) one field, keeping FIELD_KEYS order.
export function upsertField(fields, field) {
  const next = fields.filter((f) => f.key !== field.key).concat(field)
  return next.sort((a, b) => FIELD_KEYS.indexOf(a.key) - FIELD_KEYS.indexOf(b.key))
}

// Payload for PUT /layout (only the stored properties).
export function layoutPayload(fields) {
  return {
    fields: fields.map((f) => (isImageField(f.key)
      ? { key: f.key, x: f.x, y: f.y, w: f.w, h: f.h }
      : { key: f.key, x: f.x, y: f.y, w: f.w, h: f.h, fontSize: f.fontSize, color: f.color, align: f.align, bold: Boolean(f.bold), background: f.background ?? null })),
  }
}

export const sameLayout = (a = [], b = []) => JSON.stringify(layoutPayload(a)) === JSON.stringify(layoutPayload(b))
