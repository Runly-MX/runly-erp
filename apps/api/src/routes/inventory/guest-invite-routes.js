// Supplier (guest) invitation management for company users (spec 2026-10-20-inventory-areas-scoping,
// phase 3). Thin: logic lives in services/inventory-guest-service.js. Mounted by routes/inventory/index.js
// with the scope-guarded requirePermission. Allowed for holders of `inventory.area.manage` and for
// managers of the area (revoking a supplier needs manager rights over every area it belongs to).
import { Hono } from 'hono';
import { z } from 'zod';
import { canManageArea } from '../../services/inventory-scope.js';

const uuid = z.string().uuid();
const inviteBody = z.object({
  email: z.string().trim().min(1).max(255),
  name: z.string().trim().max(150).nullish(),
  role: z.enum(['viewer', 'editor']).default('viewer'),
  contactId: uuid.nullish(),
  requireCode: z.boolean().optional(),
  canCreateModels: z.boolean().optional(),
  canImport: z.boolean().optional(),
});
const memberBody = z.object({
  role: z.enum(['viewer', 'editor']).optional(),
  canCreateModels: z.boolean().optional(),
  canImport: z.boolean().optional(),
}).strict();
const resendBody = z.object({ requireCode: z.boolean().optional() });

export function createInventoryGuestInviteRouter({ requirePermission, inventoryScope, guestService, InventoryServiceError }) {
  const router = new Hono();
  const read = requirePermission('inventory.item.read');
  const hasPerm = (c) => {
    const ctx = c.get('userContext');
    return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('inventory.area.manage'));
  };
  const fail = (c, err, fallback) => {
    if (err instanceof InventoryServiceError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    if (err instanceof z.ZodError) return c.json({ error: 'Datos invalidos.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, 400);
    return c.json({ error: fallback }, 500);
  };
  const json = async (c) => { try { return await c.req.json(); } catch { return {}; } };
  // Real scope only: when area scoping is off every user resolves to `all`, which grants no manager role.
  async function canAdminAreas(c, areaIds) {
    if (hasPerm(c)) return true;
    const scope = await inventoryScope.fromContext(c);
    return !scope.all && areaIds.length > 0 && areaIds.every((id) => canManageArea(scope, id));
  }
  const deny = (c) => c.json({ error: 'No tienes permiso para administrar proveedores en esta area.' }, 403);

  router.get('/inventory/areas/:id/guests', read, async (c) => {
    try {
      const areaId = c.req.param('id');
      if (!(await canAdminAreas(c, [areaId]))) return deny(c);
      return c.json({ data: await guestService.listForArea(c.get('companyId'), areaId) });
    } catch (err) { return fail(c, err, 'No se pudieron cargar los proveedores.'); }
  });

  router.post('/inventory/areas/:id/guests', read, async (c) => {
    try {
      const areaId = c.req.param('id');
      if (!(await canAdminAreas(c, [areaId]))) return deny(c);
      const body = inviteBody.parse(await json(c));
      const data = await guestService.inviteToArea({ companyId: c.get('companyId'), actorId: c.get('userId') ?? null, areaId, ...body });
      return c.json({ data }, 201);
    } catch (err) { return fail(c, err, 'No se pudo invitar al proveedor.'); }
  });

  router.patch('/inventory/areas/:id/guests/:guestId', read, async (c) => {
    try {
      const { id: areaId, guestId } = c.req.param();
      if (!(await canAdminAreas(c, [areaId]))) return deny(c);
      const body = memberBody.parse(await json(c));
      return c.json({ data: await guestService.updateMember({ companyId: c.get('companyId'), areaId, guestId: uuid.parse(guestId), ...body }) });
    } catch (err) { return fail(c, err, 'No se pudo actualizar al proveedor.'); }
  });

  router.delete('/inventory/areas/:id/guests/:guestId', read, async (c) => {
    try {
      const { id: areaId, guestId } = c.req.param();
      if (!(await canAdminAreas(c, [areaId]))) return deny(c);
      return c.json({ data: await guestService.removeFromArea({ companyId: c.get('companyId'), areaId, guestId: uuid.parse(guestId) }) });
    } catch (err) { return fail(c, err, 'No se pudo quitar al proveedor.'); }
  });

  router.post('/inventory/guests/:id/resend', read, async (c) => {
    try {
      const guestId = uuid.parse(c.req.param('id'));
      const companyId = c.get('companyId');
      if (!(await canAdminAreas(c, await guestService.areaIdsOf(companyId, guestId)))) return deny(c);
      const body = resendBody.parse(await json(c));
      return c.json({ data: await guestService.resend({ companyId, actorId: c.get('userId') ?? null, guestId, requireCode: body.requireCode }) });
    } catch (err) { return fail(c, err, 'No se pudo reenviar la invitacion.'); }
  });

  router.post('/inventory/guests/:id/revoke', read, async (c) => {
    try {
      const guestId = uuid.parse(c.req.param('id'));
      const companyId = c.get('companyId');
      if (!(await canAdminAreas(c, await guestService.areaIdsOf(companyId, guestId)))) return deny(c);
      return c.json({ data: await guestService.revoke({ companyId, guestId }) });
    } catch (err) { return fail(c, err, 'No se pudo revocar al proveedor.'); }
  });

  return router;
}
