// Template editor model for the Etiquetas screen. Values mirror the API layout
// model (apps/api/src/services/inventory-labels/layout.js); the API validates.
// Common thermal rolls; hint names typical printers/media for each size.
export const SIZE_PRESETS = [
  { value: '50x25', label: '50 × 25 mm', hint: 'Rollo 2 × 1 in · Zebra ZD220/ZD420', widthMm: 50, heightMm: 25 },
  { value: '50x30', label: '50 × 30 mm', hint: 'Rollo Zebra/Brother para activos', widthMm: 50, heightMm: 30 },
  { value: '60x40', label: '60 × 40 mm', hint: 'Estándar de inventario', widthMm: 60, heightMm: 40 },
  { value: '75x50', label: '75 × 50 mm', hint: 'Rollo 3 × 2 in · Zebra ZD421', widthMm: 75, heightMm: 50 },
  { value: '100x50', label: '100 × 50 mm', hint: 'Rollo 4 × 2 in · Zebra ZT/ZD', widthMm: 100, heightMm: 50 },
  { value: 'custom', label: 'Personalizado', hint: 'Ancho y alto a la medida' },
]

export const LAYOUT_OPTIONS = [
  { value: 'qr-left', label: 'QR a la izquierda', description: 'Código y texto lado a lado' },
  { value: 'qr-top', label: 'QR arriba', description: 'Código centrado, texto debajo' },
  { value: 'qr-only', label: 'Solo QR', description: 'Código grande, sin texto' },
  { value: 'text-only', label: 'Solo texto', description: 'Sin código QR' },
]

export const FIELD_OPTIONS = [
  { value: 'folio', label: 'Folio' },
  { value: 'name', label: 'Nombre' },
  { value: 'serial', label: 'Número de serie' },
  { value: 'model', label: 'Modelo' },
  { value: 'location', label: 'Ubicación' },
  { value: 'company', label: 'Empresa' },
  { value: 'assetTag', label: 'Número de activo' },
  { value: 'category', label: 'Tipo' },
  { value: 'brand', label: 'Marca' },
  { value: 'assignee', label: 'Asignado a' },
]

// Text size: automatic fits each line; a fixed size is capped by the line height.
export const FONT_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  { value: '2', label: '2 mm' },
  { value: '2.5', label: '2.5 mm' },
  { value: '3', label: '3 mm' },
  { value: '3.5', label: '3.5 mm' },
  { value: '4', label: '4 mm' },
  { value: '5', label: '5 mm' },
]

const DEFAULT_TEXT = { showFieldNames: false, fontMm: null }

export const ERROR_CORRECTION_OPTIONS = [
  { value: 'L', label: 'Baja (L, 7 %)' },
  { value: 'M', label: 'Media (M, 15 %)' },
  { value: 'Q', label: 'Alta (Q, 25 %)' },
  { value: 'H', label: 'Máxima (H, 30 %)' },
]

export const CONTENT_MODE_OPTIONS = [
  { value: 'url', label: 'Enlace al activo' },
  { value: 'embedded', label: 'Datos incluidos (folio, serie, modelo)' },
]

export const DPI_OPTIONS = [
  { value: '203', label: '203 dpi' },
  { value: '300', label: '300 dpi' },
  { value: '600', label: '600 dpi' },
]

const DEFAULT_QR = { errorCorrection: 'M', quietZoneMm: 1, contentMode: 'url' }

export function presetFor(widthMm, heightMm) {
  return SIZE_PRESETS.find((p) => p.widthMm === Number(widthMm) && p.heightMm === Number(heightMm))?.value ?? 'custom'
}

// Saved template (API row) -> editable draft.
export function templateToDraft(template) {
  const t = template ?? {}
  return {
    name: t.name ?? '',
    widthMm: Number(t.widthMm ?? 60),
    heightMm: Number(t.heightMm ?? 40),
    dpi: Number(t.dpi ?? 203),
    layout: t.layout ?? 'qr-left',
    fields: Array.isArray(t.fields) ? [...t.fields] : ['folio', 'name'],
    qrOptions: { ...DEFAULT_QR, ...(t.qrOptions ?? {}) },
    textOptions: { ...DEFAULT_TEXT, ...(t.textOptions ?? {}) },
  }
}

// Draft -> body for POST/PUT /inventory/label-templates and the render `layout` override.
export function draftToLayout(draft) {
  return {
    widthMm: Number(draft.widthMm),
    heightMm: Number(draft.heightMm),
    dpi: Number(draft.dpi),
    layout: draft.layout,
    fields: [...draft.fields],
    qrOptions: { ...draft.qrOptions, quietZoneMm: Number(draft.qrOptions.quietZoneMm) },
    textOptions: {
      showFieldNames: Boolean(draft.textOptions?.showFieldNames),
      fontMm: draft.textOptions?.fontMm == null || draft.textOptions.fontMm === '' ? null : Number(draft.textOptions.fontMm),
    },
  }
}

export function isDraftDirty(draft, template) {
  if (!template) return true
  return JSON.stringify(draftToLayout(draft)) !== JSON.stringify(draftToLayout(templateToDraft(template)))
}

// Client-side checks so the preview does not hammer the API with invalid sizes.
export function draftError(draft) {
  const w = Number(draft.widthMm)
  const h = Number(draft.heightMm)
  if (!Number.isFinite(w) || w < 10 || w > 300) return 'El ancho debe estar entre 10 y 300 mm.'
  if (!Number.isFinite(h) || h < 10 || h > 300) return 'El alto debe estar entre 10 y 300 mm.'
  if (draft.layout === 'text-only' && !draft.fields.length) return 'Selecciona al menos un campo.'
  return null
}

// Toggles a field keeping the canonical order for newly enabled ones at the end.
export function toggleField(fields, key) {
  return fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key]
}

export function moveField(fields, key, delta) {
  const from = fields.indexOf(key)
  const to = from + delta
  if (from < 0 || to < 0 || to >= fields.length) return fields
  const next = [...fields]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}
