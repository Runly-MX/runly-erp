// Change proposals for restricted duplicates (spec 2026-10-21-inventory-change-proposals-design).
// Thin: the rules live in services/inventory-proposal-service.js. Anyone who can create items may submit; only
// users who can update items review, and only proposals on items in areas where they can write.
import { Hono } from 'hono';

export function createInventoryProposalRouter({ requirePermission, inventoryScope, proposalService, InventoryServiceError }) {
  const router = new Hono();
  const fail = (c, err, fallback) => {
    if (err instanceof InventoryServiceError) return c.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, err.status);
    return c.json({ error: fallback }, 500);
  };
  const json = async (c) => { try { return await c.req.json(); } catch { return {}; } };
  const labelOf = (c) => {
    const profile = c.get('userContext')?.profile;
    return profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.email || 'Usuario';
  };

  router.post('/inventory/change-proposals', requirePermission('inventory.item.create'), async (c) => {
    try {
      const profile = c.get('userContext')?.profile;
      const data = await proposalService.submit({
        companyId: c.get('companyId'),
        proposer: { userId: profile?.id ?? null, label: labelOf(c) },
        body: await json(c),
      });
      return c.json({ data }, 201);
    } catch (err) { return fail(c, err, 'No se pudo enviar la propuesta.'); }
  });

  router.get('/inventory/change-proposals', requirePermission('inventory.item.update'), async (c) => {
    try {
      const { status, limit } = c.req.query();
      const data = await proposalService.list({ companyId: c.get('companyId'), scope: await inventoryScope.fromContext(c), status: status || 'pending', limit });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudieron cargar las propuestas.'); }
  });

  router.post('/inventory/change-proposals/:id/review', requirePermission('inventory.item.update'), async (c) => {
    try {
      const data = await proposalService.review({
        companyId: c.get('companyId'),
        id: c.req.param('id'),
        body: await json(c),
        scope: await inventoryScope.fromContext(c),
        actorId: c.get('userContext')?.profile?.id ?? null,
        actorAuthId: c.get('authUserId'),
      });
      return c.json({ data });
    } catch (err) { return fail(c, err, 'No se pudo revisar la propuesta.'); }
  });

  return router;
}
