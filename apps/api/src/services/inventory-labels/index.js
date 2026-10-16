// inventory-labels/index.js — renders a queue of items with a layout to ZPL,
// PDF or PNG. Pure: items come already loaded, QR URLs through an injected
// resolver (see qr-content.js for the Phase 3 hand-off).
import { InventoryServiceError } from '../inventory-guards.js';
import { MAX_LABELS_PER_RENDER, normalizeSheet, queueEntries, selectLines } from './layout.js';
import { qrContent } from './qr-content.js';
import { computeGeometry } from './geometry.js';
import { renderLabelZpl } from './zpl.js';
import { renderPdf } from './pdf.js';
import { renderPng } from './png.js';

export * from './layout.js';
export { createPlaceholderQrUrl, embeddedQrText } from './qr-content.js';

export function buildLabel(layout, item, { companyName, resolveItemQrUrl }) {
  const lines = selectLines(layout, item, { companyName });
  const content = layout.layout === 'text-only' ? null : qrContent(item, layout.qrOptions, resolveItemQrUrl);
  const geometry = computeGeometry(layout, lines, content);
  if (geometry.qr) geometry.qr.content = content;
  return geometry;
}

// rows: [{ itemId, quantity }]; sheet: optional letter grid (PDF only).
// Returns { contentType, body, labelCount, extension, overflow } where overflow
// counts truncated/squeezed text lines across the distinct items.
export async function renderLabels({ layout, format, rows, items, companyName = '', resolveItemQrUrl, sheet = null }) {
  const entries = queueEntries(rows, items);
  if (!entries.length) throw new InventoryServiceError('No hay equipos para imprimir.', 400);
  const ctx = { companyName, resolveItemQrUrl };
  const built = entries.map((entry) => ({ ...entry, geometry: buildLabel(layout, entry.item, ctx) }));
  const labelCount = built.reduce((sum, entry) => sum + entry.quantity, 0);
  if (labelCount > MAX_LABELS_PER_RENDER) throw new InventoryServiceError(`Máximo ${MAX_LABELS_PER_RENDER} etiquetas por impresión.`, 400);
  const overflow = (format === 'png' ? built.slice(0, 1) : built).reduce((sum, entry) => sum + (entry.geometry.overflow ?? 0), 0);

  if (format === 'zpl') {
    const body = built.map((entry) => renderLabelZpl(entry.geometry, layout.dpi, entry.quantity, layout.qrOptions.errorCorrection)).join('\n');
    return { format, contentType: 'text/plain; charset=utf-8', extension: 'zpl', body, labelCount, overflow };
  }
  if (format === 'pdf') {
    const geometries = built.flatMap((entry) => Array.from({ length: entry.quantity }, () => entry.geometry));
    const grid = normalizeSheet(sheet, layout);
    return { format, contentType: 'application/pdf', extension: 'pdf', body: await renderPdf(geometries, 'Etiquetas', grid), labelCount, overflow };
  }
  if (format === 'png') {
    // Preview of the first label only.
    return { format, contentType: 'image/png', extension: 'png', body: await renderPng(built[0].geometry, layout.dpi), labelCount, overflow };
  }
  throw new InventoryServiceError('Formato de etiqueta no válido.', 400);
}
