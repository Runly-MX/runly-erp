// Shared by "Registro con IA" and "Importar": when incoming data matches an
// ACTIVE item (same serial or asset number), the match is suggested as an
// update. This builds the field-by-field diff and the patch to send to
// inventoryService.updateItem. Empty incoming values never blank an existing
// value, and identifiers are never part of the patch.

// kind: text | ref | date | number. `rel` is the included relation holding the display name.
export const UPDATABLE_FIELDS = [
  { key: 'name', label: 'Nombre', kind: 'text' },
  { key: 'model', label: 'Modelo', kind: 'text' },
  { key: 'partNumber', label: 'Número de parte', kind: 'text' },
  { key: 'categoryId', label: 'Tipo', kind: 'ref', rel: 'category' },
  { key: 'brandId', label: 'Marca', kind: 'ref', rel: 'brand' },
  { key: 'locationId', label: 'Ubicación', kind: 'ref', rel: 'location' },
  { key: 'conditionId', label: 'Condición', kind: 'ref', rel: 'condition' },
  { key: 'description', label: 'Descripción', kind: 'text' },
  { key: 'notes', label: 'Notas', kind: 'text' },
  { key: 'vendorName', label: 'Proveedor', kind: 'text' },
  { key: 'invoiceNumber', label: 'Número de factura', kind: 'text' },
  { key: 'purchaseDate', label: 'Fecha de compra', kind: 'date' },
  { key: 'purchasePrice', label: 'Precio de compra', kind: 'number' },
  { key: 'warrantyExpiry', label: 'Vencimiento de garantía', kind: 'date' },
  { key: 'warrantyNotes', label: 'Notas de garantía', kind: 'text' },
];

// Include for prisma.invItem.findFirst so the diff can show current labels.
export const EXISTING_ITEM_INCLUDE = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  location: { select: { name: true } },
  condition: { select: { name: true } },
};

const isEmpty = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || Number.isNaN(value);
// Prisma @db.Date values are UTC midnight, so read the UTC parts (not a local conversion).
const isoDate = (value) => (value instanceof Date
  ? `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
  : String(value ?? '').slice(0, 10));

function currentOf(field, existing) {
  const raw = existing[field.key];
  if (isEmpty(raw)) return { value: null, label: null };
  if (field.kind === 'ref') return { value: raw, label: existing[field.rel]?.name ?? null };
  if (field.kind === 'date') return { value: isoDate(raw), label: isoDate(raw) };
  if (field.kind === 'number') return { value: Number(raw), label: String(Number(raw)) };
  return { value: String(raw).trim(), label: String(raw).trim() };
}

// incoming: { [fieldKey]: value | { value, label } }. Returns { changes, patch }.
export function diffItemFields(existing, incoming = {}) {
  const changes = [];
  const patch = {};
  for (const field of UPDATABLE_FIELDS) {
    const entry = incoming[field.key];
    const given = entry !== null && typeof entry === 'object' && !(entry instanceof Date) && 'value' in entry ? entry : { value: entry };
    if (isEmpty(given.value)) continue;
    const next = field.kind === 'date' ? isoDate(given.value) : field.kind === 'number' ? Number(given.value) : field.kind === 'ref' ? given.value : String(given.value).trim();
    const current = currentOf(field, existing);
    if (current.value === next) continue;
    changes.push({ field: field.key, label: field.label, current: current.label, incoming: given.label ?? String(next) });
    patch[field.key] = next;
  }
  return { changes, patch };
}
