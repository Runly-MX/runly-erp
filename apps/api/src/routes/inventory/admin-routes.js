// runly.inventory administrative status routes: alta/baja transitions (single
// and bulk), an item's administrative record and the summary dashboard.
// The route guard is read access; each action checks its own permission
// (see ADMIN_TRANSITIONS in inventory-admin-service.js).
import { attachUserAvatarUrls } from '../../lib/attach-user-avatars.js';
import { Hono } from 'hono';
import { createInventoryAdminService } from '../../services/inventory-admin-service.js';
import { createInventoryDashboardService } from '../../services/inventory-dashboard-service.js';
import { createDeregistrationActService } from '../../services/inventory-deregistration-act-service.js';
import { createInventoryDeregistrationReport } from '../../services/inventory-deregistration-report.js';
import { scopeWhere } from '../../services/inventory-scope.js';
import { createScopeGuards } from './scope-guard.js';

export function createInventoryAdminRouter({ prisma, requirePermission, InventoryServiceError, inventoryNotifSvc, supabaseAdmin = null, inventoryScope = null }) {
  const router = new Hono();
  const acts = createDeregistrationActService({ prisma, supabaseAdmin });
  const admin = createInventoryAdminService({ prisma, notifier: inventoryNotifSvc, acts });
  const report = createInventoryDeregistrationReport({ prisma });
  const dashboards = createInventoryDashboardService({ prisma });
  const fail = (c, err, fallback) => err instanceof InventoryServiceError
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500);
  const guards = inventoryScope ? createScopeGuards({ prisma, inventoryScope }) : null;
  const scopeOf = (c) => (inventoryScope ? inventoryScope.fromContext(c) : null);
  const read = requirePermission('inventory.item.read');
  const canFor = (c) => {
    const tenant = c.get('tenantContext');
    return (key) => Boolean(tenant?.isAdmin || tenant?.permissionSet?.has(key));
  };

  router.get('/inventory/dashboard', read, async (c) => {
    try {
      const data = await dashboards.dashboard(c.get('companyId'), { months: c.req.query('months') }, await scopeOf(c));
      // Holder photos (an employee shows its linked user's avatar).
      const holders = data?.top?.holders ?? [];
      if (holders.length) {
        const employees = await prisma.hrEmployee.findMany({ where: { id: { in: holders.map((h) => h.id) }, companyId: c.get('companyId') }, select: { id: true, userProfileId: true } });
        const profileOf = new Map(employees.map((e) => [e.id, e.userProfileId]));
        for (const holder of holders) holder.userProfileId = profileOf.get(holder.id) ?? null;
        await attachUserAvatarUrls(holders, { prisma, supabaseAdmin });
        for (const holder of holders) delete holder.userProfileId;
      }
      return c.json({ data });
    }
    catch (err) { return fail(c, err, 'No se pudo cargar el dashboard.'); }
  });

  router.get('/inventory/dashboard/trend', read, async (c) => {
    try {
      const data = await dashboards.trends(c.get('companyId'), { granularity: c.req.query('granularity'), periods: c.req.query('periods') }, undefined, await scopeOf(c));
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo cargar la tendencia.'); }
  });

  router.get('/inventory/summary', read, async (c) => {
    try { return c.json({ data: await admin.summary(c.get('companyId'), await scopeOf(c)) }); }
    catch (err) { return fail(c, err, 'No se pudo cargar el resumen.'); }
  });

  // Registered before /items/:id/... so "admin-transition" is not read as an id.
  router.post('/inventory/items/admin-transition/bulk', read, async (c) => {
    try {
      const { ids, action, ...payload } = await c.req.json();
      const denied = await guards?.rejectOutOfScope(c, ids, { write: true });
      if (denied) return denied;
      const data = await admin.bulkTransition({ ids, action, payload, companyId: c.get('companyId'), actorId: c.get('userId'), can: canFor(c) });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo aplicar la acción.'); }
  });

  router.post('/inventory/items/:id/admin-transition', read, async (c) => {
    try {
      const { action, ...payload } = await c.req.json();
      const data = await admin.transition({ itemId: c.req.param('id'), action, payload, companyId: c.get('companyId'), actorId: c.get('userId'), can: canFor(c) });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo aplicar la acción.'); }
  });

  router.get('/inventory/items/:id/admin-events', read, async (c) => {
    try { return c.json({ data: await admin.listEvents(c.req.param('id'), c.get('companyId')) }); }
    catch (err) { return fail(c, err, 'No se pudo cargar la situación administrativa.'); }
  });

  // Bitácora de bajas: when each baja was proposed / authorized, by whom, why and its acta.
  router.get('/inventory/deregistrations', read, async (c) => {
    try { return c.json(await report.list(c.get('companyId'), c.req.query(), await scopeOf(c))); }
    catch (err) { return fail(c, err, err?.name === 'ZodError' ? 'Filtros no válidos.' : 'No se pudieron cargar las bajas.'); }
  });

  router.get('/inventory/deregistrations/summary', read, async (c) => {
    try { return c.json({ data: await report.summary(c.get('companyId'), await scopeOf(c)) }); }
    catch (err) { return fail(c, err, 'No se pudo cargar el resumen de bajas.'); }
  });

  // An acta is visible when every asset it lists is inside the caller's areas.
  async function actVisible(c, act) {
    const scope = await scopeOf(c);
    const filter = scopeWhere(scope);
    if (!filter) return true;
    const ids = (act.items ?? []).map((i) => i.itemId);
    const visible = await prisma.invItem.count({ where: { id: { in: ids }, companyId: c.get('companyId'), ...filter } });
    return visible === ids.length;
  }
  const notFound = (c) => c.json({ error: 'Acta no encontrada.' }, 404);

  router.get('/inventory/deregistration-acts/:id', read, async (c) => {
    try {
      const act = await acts.get(c.req.param('id'), c.get('companyId'));
      return (await actVisible(c, act)) ? c.json({ data: act }) : notFound(c);
    } catch (err) { return fail(c, err, 'No se pudo cargar el acta.'); }
  });

  router.get('/inventory/deregistration-acts/:id/document', read, async (c) => {
    try {
      const act = await acts.get(c.req.param('id'), c.get('companyId'));
      if (!(await actVisible(c, act))) return notFound(c);
      return c.json(await acts.documentUrl(act.id, c.get('companyId')));
    } catch (err) { return fail(c, err, 'No se pudo descargar el acta.'); }
  });

  router.post('/inventory/deregistration-acts/:id/regenerate', read, async (c) => {
    try {
      if (!canFor(c)('inventory.item.deregister')) return c.json({ error: 'No tienes permiso para esta acción.' }, 403);
      const act = await acts.get(c.req.param('id'), c.get('companyId'));
      if (!(await actVisible(c, act))) return notFound(c);
      return c.json({ data: await acts.regenerate(act.id, c.get('companyId'), c.get('userId')) });
    } catch (err) { return fail(c, err, 'No se pudo generar el acta.'); }
  });

  return router;
}
