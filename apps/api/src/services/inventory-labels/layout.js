// layout.js — label layout model: presets, validation, field selection and
// quantity expansion. Pure (no I/O); shared by the ZPL, PDF and PNG renderers.
import { InventoryServiceError } from '../inventory-guards.js';

export const LAYOUTS = ['qr-left', 'qr-top', 'text-only'];
export const LABEL_FIELDS = ['folio', 'name', 'serial', 'model', 'location', 'company', 'assetTag'];
export const FORMATS = ['zpl', 'pdf', 'png'];
export const TRANSPORTS = ['browser', 'network', 'bluetooth', 'file'];
export const ERROR_CORRECTION = ['L', 'M', 'Q', 'H'];
export const CONTENT_MODES = ['url', 'embedded'];
export const MAX_QUANTITY = 500;
export const MAX_LABELS_PER_RENDER = 1000;

export const PRESETS = {
  '50x25': { widthMm: 50, heightMm: 25 },
  '60x40': { widthMm: 60, heightMm: 40 },
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
  return { widthMm, heightMm, dpi, layout, fields, qrOptions: normalizeQrOptions(raw.qrOptions) };
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
  };
}

// Ordered, non-empty [{ key, text }] lines for one item.
export function selectLines(layout, item, ctx) {
  const values = fieldValues(item, ctx);
  return layout.fields.map((key) => ({ key, text: String(values[key] ?? '').trim() })).filter((line) => line.text);
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
