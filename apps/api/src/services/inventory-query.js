import { z } from 'zod';
import { getConfiguredTimeZone } from '@runly/core';
import { scopeWhere } from './inventory-scope.js';

export function inventoryDayStart(value, dayOffset = 0, timeZone = getConfiguredTimeZone()) {
  const [year, month, day] = value.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day + dayOffset);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    if (local === target) break;
    instant += target - local;
  }
  return new Date(instant);
}

export const AREA_NONE = '__none__';

export const inventoryFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  categoryId: z.uuid().optional(), brandId: z.uuid().optional(), locationId: z.uuid().optional(), assignedToId: z.uuid().optional(),
  status: z.enum(['available', 'assigned', 'maintenance']).optional(),
  adminStatus: z.enum(['registration_pending', 'registered', 'deregistration_proposed', 'deregistered']).optional(),
  conditionId: z.uuid().optional(),
  model: z.string().max(255).optional(), folio: z.string().max(100).optional(), assetTag: z.string().max(100).optional(),
  serialNumber: z.string().max(255).optional(), partNumber: z.string().max(255).optional(), modelId: z.uuid().optional(),
  missingSerial: z.boolean().optional(), createdFrom: z.iso.date().optional(), createdTo: z.iso.date().optional(),
  unassigned: z.boolean().optional(),
  purchaseFrom: z.iso.date().optional(), purchaseTo: z.iso.date().optional(),
  labeled: z.enum(['true', 'false']).optional(),
  // Area filter: an area id, or '__none__' for General (no area).
  areaId: z.union([z.uuid(), z.literal(AREA_NONE)]).optional(),
}).strict();

const EXACT_TEXT_FILTERS = ['model', 'folio', 'assetTag', 'serialNumber', 'partNumber'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_STATUS_SET = new Set(['registration_pending', 'registered', 'deregistration_proposed', 'deregistered']);

// `scope` (see inventory-scope.js) restricts the result to the caller's areas; null = unrestricted.
export function buildInventoryWhere(companyId, filters = {}, scope = null) {
  if (!companyId) throw new Error('Empresa requerida.');
  const where = { companyId, enabled: true };
  const q = String(filters.search ?? '').trim();
  // searchIds (from inventory-search-service) replaces the 3-column contains.
  if (Array.isArray(filters.searchIds)) where.id = { in: filters.searchIds };
  else if (q) where.OR =['name', 'assetTag', 'serialNumber'].map(field => ({ [field]: { contains: q, mode: 'insensitive' } }));
  for (const field of ['categoryId', 'brandId', 'locationId', 'conditionId', 'assignedToId', 'status', 'modelId']) if (filters[field]) where[field] = filters[field];
  if (filters.unassigned) where.assignedToId = null;
  if (filters.areaId) where.areaId = filters.areaId === AREA_NONE ? null : filters.areaId;
  // Exact (case-insensitive) match on free-text columns, e.g. from the detail view magnifier.
  for (const field of EXACT_TEXT_FILTERS) { const v = String(filters[field] ?? '').trim(); if (v) where[field] = { equals: v, mode: 'insensitive' }; }
  // adminStatus: one value, a CSV/array of values, or 'all' (no filter).
  const adminStatuses = (Array.isArray(filters.adminStatus) ? filters.adminStatus : String(filters.adminStatus ?? '').split(','))
    .map((v) => String(v).trim()).filter((v) => ADMIN_STATUS_SET.has(v));
  if (adminStatuses.length) where.adminStatus = adminStatuses.length === 1 ? adminStatuses[0] : { in: adminStatuses };
  if (filters.missingSerial) where.AND = [{ OR: [{ serialNumber: null }, { serialNumber: '' }] }];
  // labeled=false -> never printed; labeled=true -> printed at least once (inv_label_print).
  const labeled = filters.labeled === true || filters.labeled === 'true' ? true : (filters.labeled === false || filters.labeled === 'false' ? false : null);
  if (labeled !== null) where.labelPrints = labeled ? { some: {} } : { none: {} };
  const createdFrom = ISO_DAY.test(String(filters.createdFrom ?? '')) ? filters.createdFrom : null;
  const createdTo = ISO_DAY.test(String(filters.createdTo ?? '')) ? filters.createdTo : null;
  if (createdFrom || createdTo) where.createdAt = {
    ...(createdFrom ? { gte: inventoryDayStart(createdFrom) } : {}),
    ...(createdTo ? { lt: inventoryDayStart(createdTo, 1) } : {}),
  };
  // purchase_date is a DATE column: compare calendar days directly (UTC midnight).
  const day = (value) => (ISO_DAY.test(String(value ?? '')) ? new Date(`${value}T00:00:00Z`) : null);
  const purchaseFrom = day(filters.purchaseFrom);
  const purchaseTo = day(filters.purchaseTo);
  if (purchaseFrom || purchaseTo) where.purchaseDate = {
    ...(purchaseFrom ? { gte: purchaseFrom } : {}),
    ...(purchaseTo ? { lte: purchaseTo } : {}),
  };
  const areaFilter = scopeWhere(scope);
  if (areaFilter) where.AND = [...(where.AND ?? []), areaFilter];
  return where;
}
