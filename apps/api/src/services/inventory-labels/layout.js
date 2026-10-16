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

export function normalizeQrOptions(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const errorCorrection = String(input.errorCorrection ?? 'M').toUpperCase();
  if (!ERROR_CORRECTION.includes(errorCorrection)) throw fail('Nivel de corrección de errores no válido.');
  const contentMode = input.contentMode ?? 'url';
  if (!CONTENT_MODES.includes(contentMode)) throw fail('Contenido del QR no válido.');
  return {
    errorCorrection,
    contentMode,
    quietZoneMm: num(input.quietZoneMm ?? 1, 'La zona silenciosa', 0, 10),
  };
}

// { showFieldNames, fontMm (null = automatic) }.
export function normalizeTextOptions(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const fontMm = input.fontMm === null || input.fontMm === undefined || input.fontMm === '' ? null : num(input.fontMm, 'El tamaño del texto', 1.5, 10);
  return { showFieldNames: Boolean(input.showFieldNames), fontMm };
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
  return { widthMm, heightMm, dpi, layout, fields, qrOptions: normalizeQrOptions(raw.qrOptions), textOptions: normalizeTextOptions(raw.textOptions) };
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
