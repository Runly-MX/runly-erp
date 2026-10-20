// runly.inventory area routes (spec 2026-10-20-inventory-areas-scoping). Thin: logic lives in
// services/inventory-area-service.js. Mounted by routes/inventory/index.js with the scope-guarded
// requirePermission.
import { Hono } from 'hono';
import { z } from 'zod';
import { canManageArea, SCOPE_ALL_PERMISSION } from '../../services/inventory-scope.js';

const uuid = z.string().uuid();
const areaBody = z.object({ name: z.string().trim().min(1).max(150), parentId: uuid.nullish() });
const areaPatch = z.object({ name: z.string().trim().min(1).max(150).optional(), parentId: uuid.nullable().optional() });
const memberBody = z.object({ role: z.enum(['viewer', 'editor', 'manager']).default('viewer') });
const moveBody = z.object({ itemIds: z.array(uuid).min(1).max(500), areaId: uuid.nullable().optional() });
const settingsBody = z.object({ enabled: z.boolean() });

export function createInventoryAreaRouter({ prisma, requirePermission, inventoryScope, inventoryAreaService, InventoryServiceError }) {
  const router = new Hono();
  const read = requirePermission('inventory.item.read');
  const manage = requirePermission('inventory.area.manage');
  const hasPerm = (c, key) => {
    const ctx = c.get('userContext');
    return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.(key));
  };
  const fail = (c, err, fallback) => {
    if (err instanceof InventoryServiceError) return c.json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return c.json({ error: 'Datos invalidos.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    return c.json({ error: fallback }, 500);
  };
  const json = async (c) => { try { return await c.req.json(); } catch { return {}; } };
  // Area managers (real scope, not the "everything" scope of a disabled feature) may administer
  // the members of their own areas; inventory.area.manage holders may administer any.
  async function canAdminMembers(c, areaId) {
    if (hasPerm(c, 'inventory.area.manage')) return true;
    const scope = await inventoryScope.fromContext(c);
    return !scope.all && canManageArea(scope, areaId);
  }
  const deny = (c) => c.json({ error: 'No tienes permiso para administrar los miembros de esta area.' }, 403);

  router.get('/inventory/areas', read, async (c) => {
    try {
      const scope = await inventoryScope.fromContext(c);
      return c.json({ data: await inventoryAreaService.listTree(c.get('companyId'), scope) });
    } catch (err) { return fail(c, err, 'No se pudieron cargar las areas.'); }
  });

  router.post('/inventory/areas', manage, async (c) => {
    try {
      const body = areaBody.parse(await json(c));
      const data = await inventoryAreaService.createArea({ companyId: c.get('companyId'), actorId: c.get('userId') ?? null, name: body.name, parentId: body.parentId ?? null });
      return c.json({ data }, 201);
    } catch (err) { return fail(c, err, 'No se pudo crear el area.'); }
  });

  router.patch('/inventory/areas/:id', manage, async (c) => {
    try {
      const body = areaPatch.parse(await json(c));
      const data = await inventoryAreaService.updateArea({ companyId: c.get('companyId'), id: c.req.param('id'), ...body });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo actualizar el area.'); }
  });

  router.delete('/inventory/areas/:id', manage, async (c) => {
    try {
      return c.json({ data: await inventoryAreaService.disableArea({ companyId: c.get('companyId'), id: c.req.param('id') }) });
    } catch (err) { return fail(c, err, 'No se pudo desactivar el area.'); }
  });

  router.get('/inventory/areas/:id/members', read, async (c) => {
    try {
      const areaId = c.req.param('id');
      if (!(await canAdminMembers(c, areaId))) return deny(c);
      return c.json({ data: await inventoryAreaService.listMembers(c.get('companyId'), areaId) });
    } catch (err) { return fail(c, err, 'No se pudieron cargar los miembros.'); }
  });

  router.put('/inventory/areas/:id/members/:userId', read, async (c) => {
    try {
      const { id: areaId, userId } = c.req.param();
      if (!(await canAdminMembers(c, areaId))) return deny(c);
      const body = memberBody.parse(await json(c));
      const data = await inventoryAreaService.setMember({ companyId: c.get('companyId'), areaId, userId: uuid.parse(userId), role: body.role, actorId: c.get('userId') ?? null });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo guardar el miembro.'); }
  });

  router.delete('/inventory/areas/:id/members/:userId', read, async (c) => {
    try {
      const { id: areaId, userId } = c.req.param();
      if (!(await canAdminMembers(c, areaId))) return deny(c);
      return c.json({ data: await inventoryAreaService.removeMember({ companyId: c.get('companyId'), areaId, userId }) });
    } catch (err) { return fail(c, err, 'No se pudo quitar al miembro.'); }
  });

  // Bulk "Mover a area"; the service enforces write access on the sources and the destination.
  router.post('/inventory/items/move', requirePermission('inventory.item.update'), async (c) => {
    try {
      const body = moveBody.parse(await json(c));
      const data = await inventoryAreaService.moveItems({ companyId: c.get('companyId'), itemIds: body.itemIds, areaId: body.areaId ?? null, scope: await inventoryScope.fromContext(c) });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudieron mover los items.'); }
  });

  router.get('/inventory/areas-settings', read, async (c) => {
    try {
      return c.json({ data: await inventoryAreaService.getSettings(c.get('companyId')) });
    } catch (err) { return fail(c, err, 'No se pudo cargar la configuracion.'); }
  });

  // Enabling returns `affectedRoles`: roles that can read inventory but lack inventory.scope.all,
  // whose members will only see the areas they belong to once the feature is on.
  router.put('/inventory/areas-settings', manage, async (c) => {
    try {
      const companyId = c.get('companyId');
      const { enabled } = settingsBody.parse(await json(c));
      const data = await inventoryAreaService.setEnabled(companyId, enabled);
      if (!enabled) return c.json({ data });
      const roles = await prisma.role.findMany({
        where: {
          enabled: true,
          key: { not: 'system.admin' },
          OR: [{ companyId: null }, { companyId }],
          AND: [
            { permissions: { some: { permission: { key: 'inventory.item.read' } } } },
            { NOT: { permissions: { some: { permission: { key: SCOPE_ALL_PERMISSION } } } } },
          ],
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return c.json({ data: { ...data, affectedRoles: roles } });
    } catch (err) { return fail(c, err, 'No se pudo guardar la configuracion.'); }
  });

  return router;
}
