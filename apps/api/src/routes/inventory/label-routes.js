// runly.inventory label routes: templates, printers, render and print log.
// Mounted by routes/inventory/index.js. Thin: logic lives in
// services/inventory-label-service.js.
import { Hono } from 'hono';

export function createInventoryLabelRouter({ requirePermission, InventoryServiceError, labelService, publicService = null, publicBaseUrl = '' }) {
  const router = new Hono();
  const labels = labelService;
  const read = requirePermission('inventory.label.read');
  const print = requirePermission('inventory.label.print');
  const manage = requirePermission('inventory.label.manage');
  const fail = (c, err, fallback) => (err instanceof InventoryServiceError
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));
  const company = (c) => c.get('companyId');
  const userId = (c) => c.get('userContext')?.profile?.id ?? null;
  const run = (fallback, handler) => async (c) => {
    try { return await handler(c); } catch (err) { return fail(c, err, fallback); }
  };

  // Templates
  router.get('/inventory/label-templates', read, run('No se pudieron cargar las plantillas.', async (c) => c.json({ data: await labels.listTemplates(company(c)) })));
  router.post('/inventory/label-templates', manage, run('No se pudo crear la plantilla.', async (c) => c.json({ data: await labels.createTemplate(company(c), await c.req.json(), userId(c)) }, 201)));
  router.put('/inventory/label-templates/:id', manage, run('No se pudo actualizar la plantilla.', async (c) => c.json({ data: await labels.updateTemplate(company(c), c.req.param('id'), await c.req.json()) })));
  router.delete('/inventory/label-templates/:id', manage, run('No se pudo eliminar la plantilla.', async (c) => {
    await labels.removeTemplate(company(c), c.req.param('id'));
    return c.json({ ok: true });
  }));

  // Printers
  router.get('/inventory/label-printers', read, run('No se pudieron cargar las impresoras.', async (c) => c.json({ data: await labels.listPrinters(company(c)) })));
  router.post('/inventory/label-printers', manage, run('No se pudo crear la impresora.', async (c) => c.json({ data: await labels.createPrinter(company(c), await c.req.json()) }, 201)));
  router.put('/inventory/label-printers/:id', manage, run('No se pudo actualizar la impresora.', async (c) => c.json({ data: await labels.updatePrinter(company(c), c.req.param('id'), await c.req.json()) })));
  router.delete('/inventory/label-printers/:id', manage, run('No se pudo eliminar la impresora.', async (c) => {
    await labels.removePrinter(company(c), c.req.param('id'));
    return c.json({ ok: true });
  }));

  // Render: zpl -> text, pdf -> application/pdf, png -> image/png (first label preview).
  router.post('/inventory/labels/render', print, run('No se pudieron generar las etiquetas.', async (c) => {
    const out = await labels.render(company(c), await c.req.json(), { baseUrl: new URL(c.req.url).origin });
    const headers = {
      'Content-Type': out.contentType,
      'X-Label-Count': String(out.labelCount),
      'X-Label-Overflow': String(out.overflow ?? 0),
      'Cache-Control': 'no-store',
    };
    if (c.req.query('download') === '1') headers['Content-Disposition'] = `attachment; filename="etiquetas.${out.extension}"`;
    return c.body(typeof out.body === 'string' ? new TextEncoder().encode(out.body) : out.body, 200, headers);
  }));

  // Print log: one row per item (user, quantity, template, printer).
  router.post('/inventory/labels/prints', print, run('No se pudo registrar la impresión.', async (c) => (
    c.json({ data: await labels.registerPrints(company(c), userId(c), await c.req.json()) }, 201)
  )));
  // Company print log for Etiquetas > Historial (paginated, newest first).
  router.get('/inventory/label-prints', read, run('No se pudo cargar el historial de impresiones.', async (c) => (
    c.json(await labels.listPrints(company(c), { page: c.req.query('page'), limit: c.req.query('limit') }))
  )));
  router.get('/inventory/items/:id/labels', read, run('No se pudo cargar el historial de etiquetas.', async (c) => c.json({ data: await labels.history(company(c), c.req.param('id')) })));

  // Public item link (QR target). Ensuring creates the token lazily, so it needs
  // the print permission; revoking and the page settings need manage.
  if (publicService) {
    const linkUrl = (c, token) => publicService.urlFor(publicBaseUrl || new URL(c.req.url).origin, token);
    router.get('/inventory/items/:id/public-link', print, run('No se pudo obtener el enlace público.', async (c) => (
      c.json({ data: { url: linkUrl(c, await publicService.ensureToken(company(c), c.req.param('id'))) } })
    )));
    router.delete('/inventory/items/:id/public-link', manage, run('No se pudo revocar el enlace.', async (c) => (
      c.json({ data: await publicService.revoke(company(c), c.req.param('id')) })
    )));
    router.post('/inventory/public-links/revoke-all', manage, run('No se pudieron revocar los enlaces.', async (c) => (
      c.json({ data: await publicService.revokeAll(company(c)) })
    )));
    router.get('/inventory/public-page-settings', read, run('No se pudo cargar la configuración.', async (c) => c.json({ data: await publicService.getSettings(company(c)) })));
    router.put('/inventory/public-page-settings', manage, run('No se pudo guardar la configuración.', async (c) => (
      c.json({ data: await publicService.updateSettings(company(c), await c.req.json()) })
    )));
  }

  return router;
}
