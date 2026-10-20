// inventory-guest-import.js - Excel/CSV item import for supplier guests. It reuses the main import service
// (same parsing, preview and commit, same response shapes) in its `guest` mode: no commercial/admin columns,
// no bajas, every created row lands in an area the guest can write, and catalog entries are created only
// with the `createModels` capability. Requires the `import` capability of that area.
import { InventoryServiceError } from './inventory-guards.js';
import { createInventoryItemImportService, parseItemFile, suggestItemMapping, GUEST_BLOCKED_IMPORT_FIELDS } from './inventory-item-import-service.js';
import { canWriteArea, guestCan } from './inventory-scope.js';
import { createGuestAuditBridge } from './inventory-guest-items.js';

const MAX_ITEM_BYTES = 25 * 1024 * 1024;

export function createInventoryGuestImport({ prisma, items, bridge = items.bridge }) {
  const deny = () => new InventoryServiceError('No tienes permiso para importar desde un archivo.', 403, 'CAPABILITY_REQUIRED');

  async function context(auth) {
    const ctx = await items.contextOf(auth);
    if (!guestCan(ctx.scope, 'import')) throw deny();
    const service = createInventoryItemImportService({
      prisma, inventoryService: ctx.inventory, guest: true, actorName: `${auth.guest.name || auth.guest.email} (proveedor)`,
      bridge: createGuestAuditBridge({ bridge, guest: auth.guest }),
    });
    return { ...ctx, service };
  }

  async function readFile(form, options) {
    const file = form?.get?.('file');
    if (!file || typeof file.arrayBuffer !== 'function') throw new InventoryServiceError('Adjunta un archivo CSV o Excel.', 400);
    if (file.size > MAX_ITEM_BYTES) throw new InventoryServiceError('El archivo supera 25 MB.', 400);
    return parseItemFile(Buffer.from(await file.arrayBuffer()), file.name, options);
  }

  // Target area: the one chosen, else the only area where the guest can import. Always writable + import-enabled.
  function pickArea(ctx, requested) {
    const importable = [...ctx.scope.roles.keys()].filter((id) => guestCan(ctx.scope, 'import', id));
    const areaId = requested || (importable.length === 1 ? importable[0] : null);
    if (!areaId) throw new InventoryServiceError('Elige el área donde se registrarán los activos.', 400, 'AREA_REQUIRED');
    if (!canWriteArea(ctx.scope, areaId) || !guestCan(ctx.scope, 'import', areaId)) {
      throw new InventoryServiceError('Elige un área donde puedas importar activos.', 403, 'AREA_NOT_WRITABLE');
    }
    return areaId;
  }

  async function template(auth) {
    return (await context(auth)).service.template();
  }

  async function parse(auth, form) {
    const ctx = await context(auth);
    const { headers, rows, rowNumbers, images } = await readFile(form);
    const { fields, customFields, statuses } = await ctx.service.fields(ctx.companyId);
    const mapping = Object.fromEntries(Object.entries(suggestItemMapping(headers, customFields)).filter(([key]) => !GUEST_BLOCKED_IMPORT_FIELDS.has(key)));
    return { headers, rows, rowNumbers, imageCounts: rowNumbers.map((n) => images.get(n)?.length ?? 0), fields, statuses, mapping };
  }

  async function preview(auth, body) {
    const ctx = await context(auth);
    const { rows, rowNumbers, mapping, createMissing, statusMap } = body && typeof body === 'object' ? body : {};
    return ctx.service.preview(rows, mapping, ctx.companyId, {
      createMissing: createMissing === true && guestCan(ctx.scope, 'createModels'), statusMap, rowNumbers, scope: ctx.scope,
    });
  }

  async function commit(auth, form) {
    const ctx = await context(auth);
    const parsed = await readFile(form, { withImages: true });
    let options;
    try { options = JSON.parse(String(form.get('options') ?? '{}')); } catch { throw new InventoryServiceError('Opciones de importación no válidas.', 400); }
    const areaId = pickArea(ctx, typeof options.areaId === 'string' ? options.areaId : null);
    const attachImage = async (itemId, image) => {
      await items.uploadFile(auth, itemId, new File([image.buffer], image.name, { type: image.type }));
    };
    return ctx.service.commit(parsed, options.mapping, ctx.companyId, null, {
      createMissing: options.createMissing === true && guestCan(ctx.scope, 'createModels'),
      statusMap: options.statusMap, attachImage, updateExisting: options.updateExisting === true, scope: ctx.scope, areaId,
    });
  }

  return { template, parse, preview, commit };
}
