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

// Missing composition keys mean "as before composition existed" (API LEGACY_COMPOSITION).
const DEFAULT_TEXT = { showFieldNames: false, fontMm: null, align: 'left', valign: 'spread', marginMm: 1.5, gapMm: 1.5 }

export const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: 'Izquierda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Derecha' },
]
export const TEXT_VALIGN_OPTIONS = [
  { value: 'top', label: 'Arriba' },
  { value: 'middle', label: 'Centro' },
  { value: 'bottom', label: 'Abajo' },
  { value: 'spread', label: 'Repartir' },
]
export const QR_SCALE = { min: 50, max: 100, step: 5 }
export const SPACING_MM = { min: 0, max: 10, step: 0.5 }

// QR position choices per layout (qr-left has no right edge option).
export function qrAlignOptions(layout) {
  if (layout === 'qr-left') return [{ value: 'left', label: 'Al borde' }, { value: 'center', label: 'Centrado' }]
  if (layout === 'qr-top') return [{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }]
  return []
}
export const effectiveQrAlign = (draft) => draft.qrOptions?.align ?? (draft.layout === 'qr-left' ? 'left' : 'center')

// Recommended composition per layout (mirrors the API recommendedComposition):
// centred content for qr-top and text-only, left-aligned text beside a left QR.
export function recommendedComposition(layout) {
  const centred = layout === 'qr-top' || layout === 'text-only'
  return { align: centred ? 'center' : 'left', valign: 'middle', qrAlign: layout === 'qr-left' ? 'left' : 'center' }
}

// Changing the layout applies that layout's recommended alignment.
export function applyLayout(draft, layout) {
  const rec = recommendedComposition(layout)
  return {
    ...draft,
    layout,
    textOptions: { ...draft.textOptions, align: rec.align, valign: rec.valign },
    qrOptions: { ...draft.qrOptions, align: rec.qrAlign },
  }
}

// Quick presets for the Composición section.
export const COMPOSITION_PRESETS = [
  { value: 'center', label: 'Centrado', text: { align: 'center', valign: 'middle' }, qrAlign: 'center' },
  { value: 'left', label: 'A la izquierda', text: { align: 'left', valign: 'middle' }, qrAlign: 'left' },
]
export function applyCompositionPreset(draft, value) {
  const preset = COMPOSITION_PRESETS.find((p) => p.value === value)
  if (!preset) return draft
  return { ...draft, textOptions: { ...draft.textOptions, ...preset.text }, qrOptions: { ...draft.qrOptions, align: preset.qrAlign } }
}
export function activeCompositionPreset(draft) {
  return COMPOSITION_PRESETS.find((p) => p.text.align === draft.textOptions?.align && p.text.valign === draft.textOptions?.valign
    && (draft.layout === 'text-only' || p.qrAlign === effectiveQrAlign(draft)))?.value ?? null
}

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

const DEFAULT_QR = { errorCorrection: 'M', quietZoneMm: 1, contentMode: 'url', scalePct: null, align: null }

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
    qrOptions: {
      ...draft.qrOptions,
      quietZoneMm: Number(draft.qrOptions.quietZoneMm),
      scalePct: draft.qrOptions.scalePct == null || draft.qrOptions.scalePct === '' ? null : Number(draft.qrOptions.scalePct),
      align: draft.qrOptions.align ?? null,
    },
    textOptions: {
      showFieldNames: Boolean(draft.textOptions?.showFieldNames),
      fontMm: draft.textOptions?.fontMm == null || draft.textOptions.fontMm === '' ? null : Number(draft.textOptions.fontMm),
      align: draft.textOptions?.align ?? DEFAULT_TEXT.align,
      valign: draft.textOptions?.valign ?? DEFAULT_TEXT.valign,
      marginMm: Number(draft.textOptions?.marginMm ?? DEFAULT_TEXT.marginMm),
      gapMm: Number(draft.textOptions?.gapMm ?? DEFAULT_TEXT.gapMm),
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
