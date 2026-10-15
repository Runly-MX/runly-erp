// runly.inventory scan kiosk ("Escanear") routes. Thin: logic lives in
// services/inventory-scan-service.js. Mounted by routes/inventory/index.js.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createInventoryScanService } from '../../services/inventory-scan-service.js';

export function createInventoryScanRouter({ prisma, requirePermission, InventoryServiceError, publicService }) {
  const router = new Hono();
  const scan = createInventoryScanService({ prisma, publicService });
  const read = requirePermission('inventory.item.read');
  const fail = (c, err, fallback) => (err instanceof InventoryServiceError
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));
  const body = async (c) => { try { return await c.req.json(); } catch { return {}; } };

  router.post('/inventory/scan/resolve', read, bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    try {
      const { codes } = await body(c);
      return c.json({ data: await scan.resolveCodes(c.get('companyId'), codes) });
    } catch (err) { return fail(c, err, 'No se pudieron buscar los códigos.'); }
  });

  router.post('/inventory/scan/export', read, bodyLimit({ maxSize: 2 * 1024 * 1024 }), async (c) => {
    try {
      const buffer = await scan.exportXlsx(await body(c));
      return c.body(new Uint8Array(buffer), 200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="escaneo.xlsx"',
        'Cache-Control': 'no-store',
      });
    } catch (err) { return fail(c, err, 'No se pudo exportar la lista.'); }
  });

  return router;
}
