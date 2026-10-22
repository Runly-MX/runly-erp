// runly.inventory item export: the column catalog and the CSV / Excel file.
// Readers of the inventory can export what their areas let them see.
import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { createInventoryExportService } from '../../services/inventory-export-service.js';

export function createInventoryExportRouter({ prisma, requirePermission, InventoryServiceError, supabaseAdmin = null, inventoryScope = null }) {
  const router = new Hono();
  const exporter = createInventoryExportService({ prisma, supabaseAdmin });
  const read = requirePermission('inventory.item.read');
  const fail = (c, err, fallback) => (err instanceof InventoryServiceError
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));

  router.get('/inventory/export/columns', read, async (c) => {
    try { return c.json({ data: await exporter.columnCatalog(c.get('companyId')) }); }
    catch (err) { return fail(c, err, 'No se pudo cargar las columnas.'); }
  });

  router.post('/inventory/export/items', read, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const scope = inventoryScope ? await inventoryScope.fromContext(c) : null;
      const mine = body?.filters?.mine === true || body?.filters?.mine === 'true' ? await inventoryScope?.mineFromContext(c) : null;
      const file = await exporter.exportItems(c.get('companyId'), body, scope, mine);
      return c.body(Readable.toWeb(file.stream), 200, {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'X-Export-Count': String(file.total),
      });
    } catch (err) {
      if (!(err instanceof InventoryServiceError)) console.error('[inventory-export]', err?.message);
      return fail(c, err, 'No se pudo exportar el inventario.');
    }
  });

  return router;
}
