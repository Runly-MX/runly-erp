// layout.js — label layout model: presets, validation, field selection and
// quantity expansion. Pure (no I/O); shared by the ZPL, PDF and PNG renderers.
import { InventoryServiceError } from '../inventory-guards.js';

export const LAYOUTS = ['qr-left', 'qr-top', 'qr-only', 'text-only'];
export const LABEL_FIELDS = ['folio', 'name', 'serial', 'model', 'location', 'company', 'assetTag', 'brand', 'category', 'assignee'];
// Printed name of each field when textOptions.showFieldNames is on.
export const FIELD_NAMES = {
  folio: 'Folio', name: 'Nombre', serial: 'Serie', model: 'Modelo', location: 'Ubicación', company: 'Empresa',
  assetTag: 'Activo', brand: 'Marca', category: 'Tipo', assignee: 'Asignado a',
};
// US Letter in millimetres (sheet output).
export const LETTER = { widthMm: 215.9, heightMm: 279.4 };
export const FORMATS = ['zpl', 'pdf', 'png'];
export const TRANSPORTS = ['browser', 'network', 'bluetooth', 'file'];
export const ERROR_CORRECTION = ['L', 'M', 'Q', 'H'];
export const CONTENT_MODES = ['url', 'embedded'];
export const TEXT_ALIGNS = ['left', 'center', 'right'];
// 'spread' distributes the lines over the whole text area (pre-composition behaviour).
export const TEXT_VALIGNS = ['top', 'middle', 'bottom', 'spread'];
export const QR_ALIGNS = ['left', 'center', 'right'];
export const QR_SCALE = { min: 50, max: 100 };
export const SPACING_MM = { min: 0, max: 10 };
// Composition that reproduces the output of templates saved before the options existed.
export const LEGACY_COMPOSITION = { align: 'left', valign: 'spread', marginMm: 1.5, gapMm: 1.5 };
export const MAX_QUANTITY = 500;
export const MAX_LABELS_PER_RENDER = 1000;

export const PRESETS = {
  '50x25': { widthMm: 50, heightMm: 25 },
  '50x30': { widthMm: 50, heightMm: 30 },
  '60x40': { widthMm: 60, heightMm: 40 },
  '75x50': { widthMm: 75, heightMm: 50 },
  '100x50': { widthMm: 100, heightMm: 50 },
};

// Templates created lazily for every company (see inventory-label-service).
export const DEFAULT_TEMPLATES = [
  { name: 'Estándar', ...PRESETS['60x40'], dpi: 203, layout: 'qr-left', fields: ['folio', 'name', 'serial', 'location'], isDefault: true },
  { name: 'Compacta', ...PRESETS['50x25'], dpi: 203, layout: 'qr-left', fields: ['folio', 'name'], isDefault: false },
  { name: 'Solo código', ...PRESETS['50x25'], dpi: 203, layout: 'qr-left', fields: ['folio'], isDefault: false },
];

const fail = (message) => new InventoryServiceError(message, 400);
const num = (value, label, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw fail(`${label} debe estar entre ${min} y ${max}.`);
  return n;
};

const blank = (value) => value === null || value === undefined || value === '';
const oneOf = (value, list, message) => {
  if (!list.includes(value)) throw fail(message);
  return value;
};
// Finite numbers out of range are clamped (composition controls); garbage fails.
const clampNum = (value, label, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw fail(`${label} no es un número válido.`);
  return Math.max(min, Math.min(max, n));
};

export function normalizeQrOptions(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const errorCorrection = String(input.errorCorrection ?? 'M').toUpperCase();
  if (!ERROR_CORRECTION.includes(errorCorrection)) throw fail('Nivel de corrección de errores no válido.');
  const contentMode = input.contentMode ?? 'url';
  if (!CONTENT_MODES.includes(contentMode)) throw fail('Contenido del QR no válido.');
  const scalePct = blank(input.scalePct) || input.scalePct === 'auto' ? null : Math.round(clampNum(input.scalePct, 'El tamaño del QR', QR_SCALE.min, QR_SCALE.max));
  const align = blank(input.align) ? null : oneOf(input.align, QR_ALIGNS, 'Alineación del QR no válida.');
  return {
    errorCorrection,
    contentMode,
    quietZoneMm: num(input.quietZoneMm ?? 1, 'La zona silenciosa', 0, 10),
    scalePct,
    align,
  };
}

// { showFieldNames, fontMm (null = automatic), align, valign, marginMm, gapMm }.
// Missing composition keys keep the pre-composition output (left, spread, 1.5 mm)
// so templates saved before these options render exactly as they did.
export function normalizeTextOptions(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const fontMm = blank(input.fontMm) ? null : num(input.fontMm, 'El tamaño del texto', 1.5, 10);
  return {
    showFieldNames: Boolean(input.showFieldNames),
    fontMm,
    align: blank(input.align) ? LEGACY_COMPOSITION.align : oneOf(input.align, TEXT_ALIGNS, 'Alineación del texto no válida.'),
    valign: blank(input.valign) ? LEGACY_COMPOSITION.valign : oneOf(input.valign, TEXT_VALIGNS, 'Alineación vertical del texto no válida.'),
    marginMm: blank(input.marginMm) ? LEGACY_COMPOSITION.marginMm : clampNum(input.marginMm, 'El margen interior', SPACING_MM.min, SPACING_MM.max),
    gapMm: blank(input.gapMm) ? LEGACY_COMPOSITION.gapMm : clampNum(input.gapMm, 'La separación entre QR y texto', SPACING_MM.min, SPACING_MM.max),
  };
}

// Recommended composition for a layout, applied to NEW templates only.
export function recommendedComposition(layout) {
  const centred = layout === 'qr-top' || layout === 'text-only';
  return { align: centred ? 'center' : 'left', valign: 'middle', qrAlign: layout === 'qr-left' ? 'left' : 'center' };
}

// Fills composition keys a new template did not set with the layout's
// recommendation (existing templates keep the legacy defaults instead).
export function withNewTemplateDefaults(input = {}) {
  const rec = recommendedComposition(input.layout ?? 'qr-left');
  const text = input.textOptions && typeof input.textOptions === 'object' ? input.textOptions : {};
  const qr = input.qrOptions && typeof input.qrOptions === 'object' ? input.qrOptions : {};
  return {
    ...input,
    textOptions: { ...text, align: blank(text.align) ? rec.align : text.align, valign: blank(text.valign) ? rec.valign : text.valign },
    qrOptions: { ...qr, align: blank(qr.align) ? rec.qrAlign : qr.align },
  };
}

// Letter sheet grid for PDF output; null means one label per page (roll).
// The grid is centred horizontally and starts at the top margin.
export function normalizeSheet(raw, { widthMm, heightMm }) {
  if (!raw || typeof raw !== 'object') return null;
  const columns = Math.round(num(raw.columns, 'Las columnas', 1, 20));
  const rows = Math.round(num(raw.rows, 'Las filas', 1, 40));
  const gapMm = num(raw.gapMm ?? 0, 'La separación', 0, 30);
  const marginMm = num(raw.marginMm ?? 0, 'El margen', 0, 50);
  const usedW = columns * widthMm + (columns - 1) * gapMm + 2 * marginMm;
  const usedH = rows * heightMm + (rows - 1) * gapMm + 2 * marginMm;
  if (usedW > LETTER.widthMm + 0.01) throw fail('Las etiquetas no caben a lo ancho de la hoja carta.');
  if (usedH > LETTER.heightMm + 0.01) throw fail('Las etiquetas no caben a lo alto de la hoja carta.');
  return { columns, rows, gapMm, marginMm, guides: Boolean(raw.guides) };
}

// Validates and completes a template-shaped object ({ widthMm, heightMm, ... }).
export function normalizeLayout(raw = {}) {
  const preset = raw.preset && PRESETS[raw.preset] ? PRESETS[raw.preset] : {};
  const widthMm = num(raw.widthMm ?? preset.widthMm, 'El ancho', 10, 300);
  const heightMm = num(raw.heightMm ?? preset.heightMm, 'El alto', 10, 300);
  const dpi = Math.round(num(raw.dpi ?? 203, 'La resolución', 72, 1200));
  const layout = raw.layout ?? 'qr-left';
  if (!LAYOUTS.includes(layout)) throw fail('Distribución de etiqueta no válida.');
  const fieldsIn = Array.isArray(raw.fields) ? raw.fields : ['folio', 'name'];
  const fields = [];
  for (const field of fieldsIn) {
    if (!LABEL_FIELDS.includes(field)) throw fail(`Campo de etiqueta no válido: ${field}.`);
    if (!fields.includes(field)) fields.push(field);
  }
  if (!fields.length && layout === 'text-only') throw fail('Selecciona al menos un campo.');
  const qrOptions = normalizeQrOptions(raw.qrOptions);
  // qr-left places the code at the left edge or centred in its column (no right).
  if (layout === 'qr-left' && qrOptions.align === 'right') qrOptions.align = 'center';
  return { widthMm, heightMm, dpi, layout, fields, qrOptions, textOptions: normalizeTextOptions(raw.textOptions) };
}

// Printed text of each field for one item; empty values are dropped by the caller.
export function fieldValues(item, { companyName = '' } = {}) {
  return {
    folio: item.folio ?? '',
    name: item.name ?? '',
    serial: item.serialNumber ? `S/N ${item.serialNumber}` : '',
    model: item.model ?? item.modelName ?? '',
    location: item.locationName ?? item.location?.name ?? '',
    company: companyName,
    assetTag: item.assetTag ? `Act. ${item.assetTag}` : '',
    brand: item.brandName ?? item.brand?.name ?? '',
    category: item.categoryName ?? item.category?.name ?? '',
    assignee: item.assigneeName ?? '',
  };
}

const RAW_KEYS = { serial: 'serialNumber', assetTag: 'assetTag' };

// Ordered, non-empty [{ key, text }] lines for one item.
// With textOptions.showFieldNames each line reads "Serie: ABC" instead of "S/N ABC".
// qr-only labels print no text.
export function selectLines(layout, item, ctx) {
  if (layout.layout === 'qr-only') return [];
  const values = fieldValues(item, ctx);
  const named = Boolean(layout.textOptions?.showFieldNames);
  return layout.fields.map((key) => {
    const value = named && RAW_KEYS[key] ? (item[RAW_KEYS[key]] ?? '') : values[key];
    const text = String(value ?? '').trim();
    return { key, text: text && named ? `${FIELD_NAMES[key]}: ${text}` : text };
  }).filter((line) => line.text);
}

export const clampQuantity = (value) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(Number(value) || 1)));

// [{ itemId, quantity }] -> [{ item, quantity }] in queue order; unknown items are skipped.
export function queueEntries(rows, items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return rows
    .filter((row) => byId.has(row.itemId))
    .map((row) => ({ item: byId.get(row.itemId), quantity: clampQuantity(row.quantity) }));
}

// One entry per physical label, preserving order.
export function expandQueue(rows, items) {
  const labels = queueEntries(rows, items).flatMap(({ item, quantity }) => Array.from({ length: quantity }, () => item));
  if (labels.length > MAX_LABELS_PER_RENDER) throw fail(`Máximo ${MAX_LABELS_PER_RENDER} etiquetas por impresión.`);
  return labels;
}
