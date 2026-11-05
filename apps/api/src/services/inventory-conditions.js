// inventory-conditions.js — an item carries any number of conditions (inv_item_condition),
// e.g. Nuevo + Sin usar; each one matches its own filter.
import { InventoryServiceError } from './inventory-guards.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Prisma include for an item's conditions, catalog order.
export const CONDITIONS_INCLUDE = {
  conditions: { select: { condition: { select: { id: true, name: true, color: true } } }, orderBy: { condition: { sortOrder: 'asc' } } },
};

export function conditionsOf(item) {
  return (item?.conditions ?? []).map((row) => row?.condition ?? row).filter((c) => c?.id);
}

// "Nuevo, Sin usar" (null when none): what lists, exports, PDFs and labels show.
export function conditionNameOf(item) {
  const names = conditionsOf(item).map((c) => c.name).filter(Boolean);
  return names.length ? names.join(', ') : null;
}

// Flat fields every item response exposes.
export function conditionFields(item) {
  const conditions = conditionsOf(item);
  return { conditions, conditionIds: conditions.map((c) => c.id), conditionName: conditionNameOf(item) };
}

// Write input: conditionIds (array or CSV) or the legacy single conditionId. undefined = untouched.
export function conditionIdsInput(data = {}) {
  let raw;
  if (data.conditionIds !== undefined) raw = data.conditionIds;
  else if (data.conditionId !== undefined) raw = data.conditionId;
  else return undefined;
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  return [...new Set(list.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

// Filter input (?conditionId=a,b): items holding ANY of these conditions.
export function conditionFilterIds(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  return [...new Set(list.map((v) => String(v).trim()).filter((v) => UUID.test(v)))];
}

// Every id must be a condition of this company.
export async function assertConditionsInCompany(db, ids, companyId) {
  if (!ids?.length) return;
  if (ids.some((id) => !UUID.test(id))) throw new InventoryServiceError('La condicion no es válida.', 400);
  const count = await db.invCondition.count({ where: { id: { in: ids }, companyId } });
  if (count !== ids.length) throw new InventoryServiceError('La condicion no pertenece a la empresa actual.', 400);
}

// Nested write for invItem.create / invItem.update data.
export function conditionsWrite(ids, { replace = false } = {}) {
  const create = ids.map((conditionId) => ({ conditionId }));
  return replace ? { deleteMany: {}, create } : { create };
}
