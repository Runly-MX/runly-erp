// inventory-guest-items.js - what an external supplier (guest) may do with items. Spec
// 2026-10-20-inventory-areas-scoping, phase 3. NOTHING here forks the query logic: reads and writes go
// through the regular inventory service with the guest variant of the scope (`inventoryScope.resolveGuest`),
// so area visibility and write rules are the same as for company users. What is specific to guests:
//   - a strict allowlist of writable fields (no prices, vendor, invoice, license, admin status, custody),
//   - an allowlisted response shape (the stored row has fields a supplier must not see),
//   - audit entries tagged with the guest as the actor (guests are not user profiles).
import { z } from 'zod';
import { createInventoryService } from './inventory-service.js';
import { createActivityBridge } from './activity-bridge.js';
import { createActivityService } from './activity-service.js';
import { InventoryServiceError } from './inventory-guards.js';
import { canViewItem, canWriteArea, guestCan } from './inventory-scope.js';
import { createInventoryModelService } from './inventory-model-service.js';
import { createInventoryGuestCatalog, customFieldRow } from './inventory-guest-catalog.js';
import { findActiveDuplicates } from './inventory-identifiers.js';
import { loadGuestBranding } from './inventory-guest-branding.js';
import { MAX_FILE_SIZE_BYTES, buildModuleObjectKey, isAllowedMimeType } from './files-service.js';

const uuid = z.string().uuid();
const text = (max) => z.string().trim().max(max).nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}/).max(30).nullable();

const FIELDS = {
  name: z.string().trim().max(255),
  description: text(2000),
  categoryId: uuid.nullable(),
  brandId: uuid.nullable(),
  locationId: uuid.nullable(),
  conditionId: uuid.nullable(),
  modelId: uuid.nullable(),
  model: text(255),
  folio: text(50),
  partNumber: text(255),
  serialNumber: text(255),
  assetTag: text(100),
  status: z.enum(['available', 'maintenance']),
  warrantyExpiry: dateOnly,
  warrantyNotes: text(2000),
  notes: text(2000),
  customValues: z.array(z.object({ fieldId: uuid, value: z.string().max(2000).nullable() }).strict()).max(50),
};
export const GUEST_WRITABLE_FIELDS = Object.keys(FIELDS);
// Creating requires the target area; moving an item between areas is not available to suppliers.
const createSchema = z.object({ ...FIELDS, areaId: uuid }).partial().required({ areaId: true }).strict();
const patchSchema = z.object(FIELDS).partial().strict();

// Zod -> InventoryServiceError: a field outside the allowlist is a distinct, explicit answer.
function parseBody(schema, body) {
  const result = schema.safeParse(body && typeof body === 'object' ? body : {});
  if (result.success) return result.data;
  const forbidden = result.error.issues.find((i) => i.code === 'unrecognized_keys');
  if (forbidden) {
    throw new InventoryServiceError(`No puedes modificar estos campos: ${forbidden.keys.join(', ')}.`, 400, 'FIELD_NOT_ALLOWED', { fields: forbidden.keys });
  }
  throw new InventoryServiceError('Datos invalidos.', 400, 'INVALID_BODY', { issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
}

// Response allowlist for an item row (list rows and detail rows).
export function serializeGuestItem(item, { coverUrl = null } = {}) {
  return {
    id: item.id,
    folio: item.folio ?? null,
    name: item.name,
    description: item.description ?? null,
    assetTag: item.assetTag ?? null,
    serialNumber: item.serialNumber ?? null,
    modelId: item.modelId ?? null,
    model: item.model ?? null,
    partNumber: item.partNumber ?? null,
    status: item.status,
    notes: item.notes ?? null,
    warrantyExpiry: item.warrantyExpiry ?? null,
    warrantyNotes: item.warrantyNotes ?? null,
    areaId: item.areaId ?? null,
    categoryId: item.categoryId ?? null,
    categoryName: item.category?.name ?? item.categoryName ?? null,
    category: item.category ? { id: item.category.id, name: item.category.name, icon: item.category.icon ?? null, color: item.category.color ?? null } : null,
    brandId: item.brandId ?? null,
    brandName: item.brand?.name ?? item.brandName ?? null,
    locationId: item.locationId ?? null,
    locationName: item.location?.name ?? item.locationName ?? null,
    conditionId: item.conditionId ?? null,
    conditionName: item.condition?.name ?? item.conditionName ?? null,
    coverUrl,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    ...(item.customValues
      ? { customValues: item.customValues.map((cv) => ({ fieldId: cv.fieldId, label: cv.field?.label ?? null, fieldType: cv.field?.fieldType ?? null, options: cv.field?.options ?? null, value: cv.value ?? null })) }
      : {}),
  };
}

const ACTION_VERBS = { 'inventory.item.created': 'dio de alta el activo', 'inventory.item.updated': 'actualizó el activo' };

// Wraps the activity bridge so every audit row the item service writes carries the guest as the actor.
export function createGuestAuditBridge({ bridge, guest }) {
  const label = `${guest.name || guest.email} (proveedor)`;
  const actor = { kind: 'guest', id: guest.id, name: guest.name ?? null, email: guest.email };
  return {
    ...bridge,
    logAndPublish: ({ auditEntry, hint, companyId }) => bridge.logAndPublish({
      auditEntry: { ...auditEntry, actorId: null, metadata: { ...(auditEntry.metadata ?? {}), actor } },
      hint: { ...(hint ?? {}), summary: hint?.summary ?? `${label} ${ACTION_VERBS[auditEntry.action] ?? 'realizó'} ${hint?.label ?? ''}`.trim() },
      companyId,
    }),
  };
}

export function createInventoryGuestItems({
  prisma, inventoryScope, supabaseAdmin = null, signFile = null, bridge = null,
  makeInventoryService = (activityBridge) => createInventoryService({ prisma, activityBridge }),
}) {
  const baseBridge = bridge ?? createActivityBridge({ prisma, activityService: createActivityService({ prisma }) });
  const sign = (fileId, variant) => (signFile && fileId ? signFile(fileId, variant).catch(() => null) : null);
  const notFound = () => new InventoryServiceError('Item no encontrado.', 404);
  const readOnly = () => new InventoryServiceError('Tu acceso a esta área es de solo lectura.', 403, 'READ_ONLY');

  const contextOf = async (auth) => {
    const scope = await inventoryScope.resolveGuest({ companyId: auth.companyId, guestId: auth.guest.id });
    const inventory = makeInventoryService(createGuestAuditBridge({ bridge: baseBridge, guest: auth.guest }));
    return { scope, inventory, companyId: auth.companyId };
  };

  // Item the guest may see (404 otherwise, never revealing other areas) and whether it may write it.
  async function loadItem(ctx, id) {
    const item = await prisma.invItem.findFirst({ where: { id, companyId: ctx.companyId, enabled: true }, select: { id: true, areaId: true, createdById: true, assignedToId: true } });
    if (!item || !canViewItem(ctx.scope, item)) throw notFound();
    return { item, canWrite: canWriteArea(ctx.scope, item.areaId) };
  }
  async function loadWritable(ctx, id) {
    const found = await loadItem(ctx, id);
    if (!found.canWrite) throw readOnly();
    return found.item;
  }

  async function me(auth) {
    const { scope } = await contextOf(auth);
    const [company, areas] = await Promise.all([
      loadGuestBranding({ prisma, companyId: auth.companyId, signFile }),
      prisma.invArea.findMany({ where: { companyId: auth.companyId, enabled: true, id: { in: [...scope.roles.keys()] } }, select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      guest: { id: auth.guest.id, name: auth.guest.name ?? null, email: auth.guest.email },
      company,
      // Effective capabilities: `canCreateModels` also covers creating brands/types/locations/conditions.
      capabilities: { canCreateModels: guestCan(scope, 'createModels'), canImport: guestCan(scope, 'import') },
      areas: areas.map((a) => ({
        id: a.id, name: a.name, parentId: a.parentId, role: scope.roles.get(a.id), canWrite: canWriteArea(scope, a.id),
        canCreateModels: guestCan(scope, 'createModels', a.id), canImport: guestCan(scope, 'import', a.id),
      })),
    };
  }

  async function listItems(auth, query = {}) {
    const ctx = await contextOf(auth);
    const q = (key) => (typeof query[key] === 'string' && query[key] ? query[key] : undefined);
    const result = await ctx.inventory.listItems({
      companyId: ctx.companyId, scope: ctx.scope,
      search: q('search'), categoryId: q('categoryId'), brandId: q('brandId'), locationId: q('locationId'), conditionId: q('conditionId'),
      status: q('status'), areaId: q('areaId'), sortBy: q('sortBy'), sortDir: q('sortDir'),
      page: Number(query.page) || 1, limit: Math.min(Number(query.pageSize ?? query.limit) || 25, 100),
    });
    const data = await Promise.all(result.data.map(async (item) => serializeGuestItem(item, { coverUrl: await sign(item.coverImageFileId, 'card') })));
    return { data, pagination: { page: result.page, pageSize: result.limit, total: result.total } };
  }

  async function getItem(auth, id) {
    const ctx = await contextOf(auth);
    const found = await loadItem(ctx, id);
    const item = await ctx.inventory.getItem(id, ctx.companyId, ctx.scope);
    return { ...serializeGuestItem(item, { coverUrl: await sign(item.coverImageFileId, 'preview') }), canWrite: found.canWrite };
  }

  async function createItem(auth, body) {
    const ctx = await contextOf(auth);
    const data = parseBody(createSchema, body);
    if (!canWriteArea(ctx.scope, data.areaId)) {
      throw new InventoryServiceError('Elige un área donde puedas registrar items.', 403, 'AREA_NOT_WRITABLE');
    }
    const withModel = await createInventoryModelService({ prisma }).applyModelDefaults(data, ctx.companyId);
    const created = await ctx.inventory.createItem(withModel, ctx.companyId, null, { scope: ctx.scope });
    return serializeGuestItem(created);
  }

  async function updateItem(auth, id, body) {
    const ctx = await contextOf(auth);
    await loadWritable(ctx, id);
    const data = parseBody(patchSchema, body);
    const withModel = await createInventoryModelService({ prisma }).applyModelDefaults(data, ctx.companyId);
    const updated = await ctx.inventory.updateItem(id, withModel, ctx.companyId, { scope: ctx.scope });
    return serializeGuestItem(updated);
  }

  // Live duplicate check for the form: an item outside the guest's areas comes back as { restricted: true }.
  async function checkIdentifiers(auth, query = {}) {
    const ctx = await contextOf(auth);
    const str = (k) => (typeof query[k] === 'string' && query[k] ? query[k].slice(0, 255) : null);
    const excludeId = uuid.safeParse(query.excludeId).success ? query.excludeId : null;
    return findActiveDuplicates(prisma, ctx.companyId, { assetTag: str('assetTag'), serialNumber: str('serialNumber'), excludeId, scope: ctx.scope });
  }

  // ---- files ----------------------------------------------------------------------------------
  async function listFiles(auth, itemId) {
    const ctx = await contextOf(auth);
    const { canWrite } = await loadItem(ctx, itemId);
    const rows = await ctx.inventory.listItemFiles(itemId, ctx.companyId);
    const files = await Promise.all(rows.map(async (row) => {
      const meta = await prisma.fileAsset.findUnique({ where: { id: row.fileAssetId }, select: { metadata: true } }).catch(() => null);
      const own = meta?.metadata?.guestId === auth.guest.id;
      return {
        id: row.id,
        fileAssetId: row.fileAssetId,
        label: row.label ?? null,
        isCover: Boolean(row.isCover),
        name: row.fileAsset?.originalName ?? null,
        mimeType: row.fileAsset?.mimeType ?? null,
        sizeBytes: row.fileAsset?.sizeBytes ?? null,
        url: await sign(row.fileAssetId, 'full'),
        thumbUrl: String(row.fileAsset?.mimeType ?? '').startsWith('image/') ? await sign(row.fileAssetId, 'card') : null,
        canDelete: canWrite && own,
      };
    }));
    return files;
  }

  async function uploadFile(auth, itemId, file, label = null) {
    const ctx = await contextOf(auth);
    await loadWritable(ctx, itemId);
    if (!file || typeof file.arrayBuffer !== 'function' || !(file.size > 0)) throw new InventoryServiceError('Selecciona un archivo válido.', 400);
    if (file.size > MAX_FILE_SIZE_BYTES) throw new InventoryServiceError('El archivo supera el límite de 10 MB.', 400);
    if (!isAllowedMimeType(file.type, file.name)) throw new InventoryServiceError('Tipo de archivo no permitido. Usa imagen, PDF, texto u oficina.', 400);
    if (!supabaseAdmin) throw new InventoryServiceError('La subida de archivos no está disponible.', 503);
    const mimeType = file.type || 'application/octet-stream';
    const objectKey = buildModuleObjectKey({ moduleKey: 'runly.inventory', entityType: 'InvItem', entityId: ctx.companyId, fileName: file.name, mimeType });
    const { error } = await supabaseAdmin.storage.from('runly-files').upload(objectKey, await file.arrayBuffer(), { contentType: mimeType, upsert: false });
    if (error) throw new InventoryServiceError('No se pudo subir el archivo.', 500);
    const asset = await prisma.fileAsset.create({
      data: {
        bucket: 'runly-files', objectKey, originalName: file.name, mimeType, sizeBytes: file.size, visibility: 'PRIVATE',
        moduleKey: 'runly.inventory', entityType: 'InvItem', entityId: ctx.companyId, accessScope: 'COMPANY', uploadedById: null,
        metadata: { companyId: ctx.companyId, sourceEntityId: itemId, guestId: auth.guest.id },
      },
    });
    let record;
    try {
      record = await ctx.inventory.addItemFile(itemId, asset.id, ctx.companyId, label);
    } catch (err) {
      await prisma.fileAsset.update({ where: { id: asset.id }, data: { enabled: false } }).catch(() => null);
      throw err;
    }
    await audit(auth, itemId, 'inventory.item.file.add', 'adjuntó un archivo', file.name);
    return { id: record.id, fileAssetId: asset.id, name: file.name, mimeType, sizeBytes: file.size };
  }

  // A supplier removes only the files it uploaded itself.
  async function deleteFile(auth, itemId, docId) {
    const ctx = await contextOf(auth);
    await loadWritable(ctx, itemId);
    const doc = await prisma.invItemFile.findFirst({ where: { id: docId, itemId }, include: { fileAsset: { select: { id: true, originalName: true, metadata: true } } } });
    if (!doc) throw new InventoryServiceError('Archivo no encontrado.', 404);
    if (doc.fileAsset?.metadata?.guestId !== auth.guest.id) {
      throw new InventoryServiceError('Solo puedes eliminar los archivos que subiste tú.', 403, 'NOT_YOUR_FILE');
    }
    await ctx.inventory.removeItemFile(itemId, docId, ctx.companyId);
    await prisma.fileAsset.update({ where: { id: doc.fileAsset.id }, data: { enabled: false } }).catch(() => null);
    await audit(auth, itemId, 'inventory.item.file.remove', 'eliminó un archivo', doc.fileAsset.originalName);
    return { success: true };
  }

  // Audit row for file events (the item service only audits item fields).
  async function auditEntity(auth, { entityType, entityId, action, verb, detail = null, link = null }) {
    const who = `${auth.guest.name || auth.guest.email} (proveedor)`;
    await createGuestAuditBridge({ bridge: baseBridge, guest: auth.guest }).logAndPublish({
      auditEntry: { companyId: auth.companyId, actorId: null, moduleKey: 'runly.inventory', entityType, entityId, action, after: { detail } },
      hint: { type: action, severity: 'info', summary: `${who} ${verb}${detail ? `: ${detail}` : ''}`, ...(link ? { link } : {}) },
      companyId: auth.companyId,
    }).catch(() => null);
  }
  const audit = (auth, itemId, action, verb, detail) => auditEntity(auth, { entityType: 'InvItem', entityId: itemId, action, verb, detail, link: `/app/m/runly.inventory/inventory/${itemId}` });
  const catalog = createInventoryGuestCatalog({ prisma, contextOf, audit: auditEntity });

  // ---- history (read-only) --------------------------------------------------------------------
  const ACTION_LABELS = {
    'inventory.item.created': 'Alta del activo', 'inventory.item.updated': 'Actualización', 'inventory.item.file.add': 'Archivo adjuntado',
    'inventory.item.file.remove': 'Archivo eliminado', 'inventory.item.assigned': 'Asignación', 'inventory.item.returned': 'Devolución',
  };
  async function history(auth, itemId) {
    const ctx = await contextOf(auth);
    await loadItem(ctx, itemId);
    const [audits, adminEvents] = await Promise.all([
      prisma.auditLog.findMany({ where: { companyId: auth.companyId, entityType: 'InvItem', entityId: itemId, moduleKey: 'runly.inventory' }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.invItemAdminEvent.findMany({ where: { itemId, companyId: auth.companyId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    // before/after snapshots (prices, vendor...) and the names of company users stay private.
    const events = [
      ...audits.map((row) => ({
        id: row.id, kind: 'activity', action: row.action, label: ACTION_LABELS[row.action] ?? 'Cambio', at: row.createdAt,
        actor: row.metadata?.actor?.kind === 'guest' ? { kind: 'guest', name: row.metadata.actor.name ?? row.metadata.actor.email ?? null, self: row.metadata.actor.id === auth.guest.id } : { kind: 'team', name: null, self: false },
      })),
      ...adminEvents.map((row) => ({ id: row.id, kind: 'admin', action: row.action, label: 'Movimiento administrativo', at: row.createdAt, actor: { kind: 'team', name: null, self: false } })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at));
    return events;
  }

  // ---- catalogs for pickers (names only) ------------------------------------------------------
  async function catalogs(auth) {
    const { inventory, companyId } = await contextOf(auth);
    const [categories, brands, locations, conditions, customFields] = await Promise.all([
      inventory.listCategories(companyId), inventory.listBrands(companyId), inventory.listLocations(companyId),
      inventory.listConditions(companyId), inventory.listCustomFields(companyId, 'all'),
    ]);
    return {
      categories: categories.map((r) => ({ id: r.id, name: r.name, icon: r.icon ?? null, color: r.color ?? null })),
      brands: brands.map((r) => ({ id: r.id, name: r.name })),
      locations: locations.map((r) => ({ id: r.id, name: r.name })),
      conditions: conditions.map((r) => ({ id: r.id, name: r.name, color: r.color ?? null })),
      customFields: customFields.map(customFieldRow),
    };
  }

  return { me, listItems, getItem, createItem, updateItem, listFiles, uploadFile, deleteFile, history, catalogs, checkIdentifiers, ...catalog, contextOf, bridge: baseBridge };
}
