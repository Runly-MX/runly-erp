// inventory-guest-catalog.js - model catalog and catalog entries for the supplier portal (spec
// 2026-10-20-inventory-areas-scoping, supplier portal parity). Nothing here forks the main logic: models go
// through inventory-model-service and brands/types/locations/conditions through the inventory service, always
// with the guest's company. Creating needs the `createModels` capability of an area the guest can write.
import { InventoryServiceError } from './inventory-guards.js';
import { createInventoryModelService } from './inventory-model-service.js';
import { guestCan, scopeWhere } from './inventory-scope.js';

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : undefined);

// kind -> how to create/list it through the inventory service, plus the fields a guest may send.
const ENTRIES = {
  brands: { list: 'listBrands', create: 'createBrand', noun: 'La marca', entity: 'InvBrand', pick: (b) => ({ name: text(b.name, 100) }) },
  types: { list: 'listCategories', create: 'createCategory', noun: 'El tipo', entity: 'InvCategory', pick: (b) => ({ name: text(b.name, 100), icon: text(b.icon, 50), color: text(b.color, 20) }) },
  locations: { list: 'listLocations', create: 'createLocation', noun: 'La ubicación', entity: 'InvLocation', pick: (b) => ({ name: text(b.name, 100) }) },
  conditions: { list: 'listConditions', create: 'createCondition', noun: 'La condición', entity: 'InvCondition', pick: (b) => ({ name: text(b.name, 100), color: text(b.color, 20) }) },
};
export const GUEST_ENTRY_KINDS = Object.keys(ENTRIES);

const modelRow = (m) => ({
  id: m.id, name: m.name, code: m.code ?? null, typeId: m.typeId, brandId: m.brandId, year: m.year ?? null, description: m.description ?? null,
  typeName: m.typeName ?? null, typeIcon: m.typeIcon ?? null, typeColor: m.typeColor ?? null, brandName: m.brandName ?? null, itemCount: m.itemCount ?? 0,
});
export const customFieldRow = (f) => ({
  id: f.id, label: f.label, fieldKey: f.fieldKey, fieldType: f.fieldType, options: f.options ?? null, required: Boolean(f.required),
  sortOrder: f.sortOrder ?? 0, categoryId: f.categoryId ?? null, onDemand: Boolean(f.onDemand),
});

export function createInventoryGuestCatalog({ prisma, contextOf, audit }) {
  const denied = () => new InventoryServiceError('No tienes permiso para crear en el catálogo.', 403, 'CAPABILITY_REQUIRED');

  async function listModels(auth, query = {}) {
    const { companyId } = await contextOf(auth);
    const str = (k) => (typeof query[k] === 'string' && query[k] ? query[k] : undefined);
    const rows = await createInventoryModelService({ prisma }).list({ companyId, search: str('search'), typeId: str('typeId'), brandId: str('brandId') });
    return rows.map(modelRow);
  }

  async function createModel(auth, body) {
    const ctx = await contextOf(auth);
    if (!guestCan(ctx.scope, 'createModels')) throw denied();
    const created = await createInventoryModelService({ prisma }).create(body && typeof body === 'object' ? body : {}, ctx.companyId);
    await audit(auth, { entityType: 'InvModel', entityId: created.id, action: 'inventory.model.created', verb: 'creó el modelo', detail: created.name });
    return modelRow(created);
  }

  async function listTypes(auth) {
    const { inventory, companyId } = await contextOf(auth);
    const rows = await inventory.listCategories(companyId);
    return rows.map((r) => ({ id: r.id, value: r.id, name: r.name, icon: r.icon ?? null, color: r.color ?? null }));
  }

  // Brand / type / location / condition typed in the item form. An existing name (any case) is reused,
  // so "+ Crear «X»" is idempotent; nothing else of the catalog row is writable.
  async function createEntry(auth, kind, body) {
    const def = ENTRIES[kind];
    if (!def) throw new InventoryServiceError('No encontrado.', 404);
    const ctx = await contextOf(auth);
    if (!guestCan(ctx.scope, 'createModels')) throw denied();
    const data = Object.fromEntries(Object.entries(def.pick(body && typeof body === 'object' ? body : {})).filter(([, v]) => v !== undefined));
    if (!data.name) throw new InventoryServiceError('Escribe un nombre.', 400);
    const existing = (await ctx.inventory[def.list](ctx.companyId)).find((r) => String(r.name).trim().toLocaleLowerCase('es') === data.name.toLocaleLowerCase('es'));
    if (existing) return { id: existing.id, name: existing.name, reused: true };
    const created = await ctx.inventory[def.create](data, ctx.companyId);
    await audit(auth, { entityType: def.entity, entityId: created.id, action: `inventory.${kind}.created`, verb: 'creó en el catálogo', detail: created.name });
    return { id: created.id, name: created.name, reused: false };
  }

  // Same filter semantics as GET /inventory/custom-fields (no categoryId = type-less fields only; 'all' = every field).
  async function listCustomFields(auth, categoryId) {
    const { inventory, companyId } = await contextOf(auth);
    return (await inventory.listCustomFields(companyId, categoryId || undefined)).map(customFieldRow);
  }

  // Suggestions for a custom field, drawn only from the items the guest can see.
  async function customFieldValues(auth, fieldId, search = '') {
    const ctx = await contextOf(auth);
    const field = await prisma.invCustomField.findFirst({ where: { id: fieldId, companyId: ctx.companyId, enabled: true }, select: { id: true } });
    if (!field) throw new InventoryServiceError('Campo no encontrado.', 404);
    const term = String(search ?? '').trim();
    const rows = await prisma.invCustomFieldValue.groupBy({
      by: ['value'],
      where: { fieldId, item: { enabled: true, companyId: ctx.companyId, ...(scopeWhere(ctx.scope) ?? {}) }, value: { not: null, ...(term ? { contains: term, mode: 'insensitive' } : {}) } },
      _count: { _all: true },
      orderBy: { _count: { value: 'desc' } },
      take: 30,
    });
    return rows.map((r) => r.value).filter((v) => v && String(v).trim() !== '');
  }

  return { listModels, createModel, listTypes, createEntry, listCustomFields, customFieldValues };
}
