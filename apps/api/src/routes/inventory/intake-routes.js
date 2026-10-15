import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createInventoryIntakeService } from '../../services/inventory-intake-service.js';
import { createInventoryAccess } from '../../services/inventory-access.js';

export function createInventoryIntakeRouter({ prisma, requirePermission, intake = createInventoryIntakeService({ prisma }), authorize = createInventoryAccess({ prisma }).assertCurrent }) {
  const router = new Hono();
  const read = requirePermission('inventory.item.read');
  const write = requirePermission('inventory.item.create');
  function context(c) { return { companyId: c.get('companyId'), actorId: c.get('userId'), authUserId: c.get('authUserId') }; }
  function failure(c, err) {
    if (err instanceof SyntaxError) return c.json({ error: 'La solicitud no contiene JSON válido.' }, 400);
    const status = [400, 403, 409, 413, 429, 503].includes(err.status) ? err.status : 500;
    return c.json({ error: status === 500 ? 'No se pudo completar la operación. Tus datos siguen en el formulario.' : err.message, issues: err.issues ?? [], ...(err.code ? { code: err.code } : {}), ...(err.details ? { details: err.details } : {}) }, status);
  }
  router.get('/inventory/ai/status', read, c => c.json({ data: { available: intake.isConfigured() } }));
  router.post('/inventory/ai/recognize', read, write, bodyLimit({ maxSize: 42 * 1024 * 1024 }), async c => {
    try {
      await authorize(context(c), ['inventory.item.read', 'inventory.item.create']);
      const form = await c.req.formData();
      const files = form.getAll('files');
      if (files.some(file => typeof file === 'string' || typeof file.arrayBuffer !== 'function')) return c.json({ error: 'Adjunta fotografías válidas.' }, 400);
      const data = await intake.recognize({ files, ...context(c) });
      await authorize(context(c), ['inventory.item.read', 'inventory.item.create']);
      return c.json({ data });
    } catch (err) { return failure(c, err); }
  });
  router.post('/inventory/items/validate-batch', read, write, bodyLimit({ maxSize: 2 * 1024 * 1024 }), async c => {
    try {
      await authorize(context(c), ['inventory.item.read', 'inventory.item.create']);
      const { issues, updates } = await intake.validate({ input: await c.req.json(), ...context(c) });
      await authorize(context(c), ['inventory.item.read', 'inventory.item.create']);
      return c.json({ data: { issues, updates: (updates ?? []).map(({ patch, ...rest }) => rest), valid: issues.length === 0 } });
    } catch (err) { return failure(c, err); }
  });
  router.post('/inventory/items/bulk', read, write, bodyLimit({ maxSize: 2 * 1024 * 1024 }), async c => {
    try {
      const input = await c.req.json();
      // Updating a matched item needs the update permission on top of create.
      const needed = ['inventory.item.read', 'inventory.item.create', ...(input?.units?.some?.(u => u?.mode === 'update') ? ['inventory.item.update'] : [])];
      await authorize(context(c), needed);
      const data = await intake.create({ input, ...context(c) });
      await authorize(context(c), ['inventory.item.read', 'inventory.item.create']);
      return c.json({ data }, 201);
    }
    catch (err) { return failure(c, err); }
  });
  return router;
}
