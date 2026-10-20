// Serial number and asset number rules: neither may repeat among ACTIVE
// items (enabled = true) of a company; logically deleted items never conflict.
// The match ignores case and surrounding spaces. Empty values never conflict.
import { InventoryServiceError } from './inventory-guards.js';
import { canViewItem } from './inventory-scope.js';

export const cleanIdentifier = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

const SELECT = { id: true, name: true, assetTag: true, serialNumber: true, areaId: true, createdById: true, assignedToId: true };

// Duplicates stay company-wide, but an item outside the caller's areas is reported
// without its data: `{ restricted: true }`.
const present = (item, scope) => {
  if (!item) return null;
  const { areaId, createdById, assignedToId, ...rest } = item;
  return scope && !canViewItem(scope, item) ? { restricted: true } : rest;
};

// -> { assetTag: item|null, serialNumber: item|null } with the active item that already uses each value.
export async function findActiveDuplicates(db, companyId, { assetTag = null, serialNumber = null, excludeId = null, scope = null } = {}) {
  const base = { companyId, enabled: true, ...(excludeId ? { id: { not: excludeId } } : {}) };
  const find = (field, value) => (value
    ? db.invItem.findFirst({ where: { ...base, [field]: { equals: value, mode: 'insensitive' } }, select: SELECT, orderBy: { createdAt: 'asc' } })
    : null);
  const [byTag, bySerial] = await Promise.all([find('assetTag', cleanIdentifier(assetTag)), find('serialNumber', cleanIdentifier(serialNumber))]);
  return { assetTag: present(byTag, scope), serialNumber: present(bySerial, scope) };
}

// Throws a 409 carrying the existing item so the UI can link to it.
export async function assertNoActiveDuplicates(db, companyId, identifiers) {
  const found = await findActiveDuplicates(db, companyId, identifiers);
  if (found.serialNumber) {
    throw new InventoryServiceError(`Ya existe un inventario activo con el número de serie ${cleanIdentifier(identifiers.serialNumber)}.`, 409, 'SERIAL_EXISTS', { item: found.serialNumber });
  }
  if (found.assetTag) {
    throw new InventoryServiceError(`Ya existe un inventario activo con el número de activo ${cleanIdentifier(identifiers.assetTag)}.`, 409, 'ASSET_TAG_EXISTS', { item: found.assetTag });
  }
}
