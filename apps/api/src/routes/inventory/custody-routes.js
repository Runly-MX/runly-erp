// runly.inventory custody records (resguardos) and document templates.
// Spec: docs/superpowers/specs/2026-10-13-inventory-custody-design.md §5
import { Hono } from 'hono';
import { createInventoryCustodyService } from '../../services/inventory-custody-service.js';
import { CUSTODY_PLACEHOLDERS } from '../../services/inventory-document-template-service.js';
import { buildDefaultCustodyTemplate } from '../../services/document-templates/custody-template-data.js';

export function createInventoryCustodyRouter({ prisma, requirePermission, InventoryServiceError, supabaseAdmin = null, custodyService = null }) {
  const router = new Hono();
  let service = custodyService;
  const svc = () => (service ??= createInventoryCustodyService({ prisma, supabaseAdmin }));
  const read = requirePermission('inventory.custody.read');
  const manage = requirePermission('inventory.custody.manage');
  const manageTemplates = requirePermission('inventory.template.manage');
  const fail = (c, err, fallback) => (err instanceof InventoryServiceError || (err?.status && err?.name === 'InventoryServiceError')
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));
  const body = (c) => c.req.json().catch(() => ({}));
  // inventory.custody.deliver_on_behalf (spec §9.5): admins hold every permission.
  const onBehalf = (c) => {
    const tenant = c.get('tenantContext');
    return { canDeliverOnBehalf: Boolean(tenant?.isAdmin || tenant?.permissionSet?.has?.('inventory.custody.deliver_on_behalf')) };
  };

  // ── Templates (read with custody.read, write with template.manage) ─────────
  router.get('/inventory/document-templates', read, async (c) => {
    try {
      return c.json({ templates: await svc().templates.list(c.get('companyId')), placeholders: CUSTODY_PLACEHOLDERS });
    } catch (err) { return fail(c, err, 'No se pudieron cargar las plantillas.'); }
  });

  router.post('/inventory/document-templates', manageTemplates, async (c) => {
    try {
      const form = await c.req.formData();
      const result = await svc().templates.upload({
        companyId: c.get('companyId'),
        profileId: c.get('userId'),
        file: form.get('file'),
        name: form.get('name'),
        isDefault: ['true', '1'].includes(String(form.get('isDefault') ?? '')),
      });
      return c.json(result, 201);
    } catch (err) { return fail(c, err, 'No se pudo subir la plantilla.'); }
  });

  // Built-in example with every tag, as a starting point for a company format.
  router.get('/inventory/document-templates/sample', read, (c) => {
    const bytes = buildDefaultCustodyTemplate();
    return c.body(bytes, 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="plantilla-resguardo-ejemplo.docx"',
    });
  });

  // Re-upload an edited version over the same template.
  router.put('/inventory/document-templates/:id/file', manageTemplates, async (c) => {
    try {
      const form = await c.req.formData();
      return c.json(await svc().templates.replaceFile({
        id: c.req.param('id'), companyId: c.get('companyId'), profileId: c.get('userId'), file: form.get('file'),
      }));
    } catch (err) { return fail(c, err, 'No se pudo reemplazar la plantilla.'); }
  });

  // Same file with suggested tags placed, for review (nothing is saved).
  router.post('/inventory/document-templates/:id/suggest', manageTemplates, async (c) => {
    try {
      return c.json(await svc().templates.suggestTags(c.req.param('id'), c.get('companyId')));
    } catch (err) { return fail(c, err, 'No se pudieron sugerir etiquetas.'); }
  });

  router.get('/inventory/document-templates/:id/file', read, async (c) => {
    try {
      return c.json(await svc().templates.fileUrl(c.req.param('id'), c.get('companyId')));
    } catch (err) { return fail(c, err, 'No se pudo descargar la plantilla.'); }
  });

  router.patch('/inventory/document-templates/:id', manageTemplates, async (c) => {
    try {
      return c.json({ template: await svc().templates.update(c.req.param('id'), c.get('companyId'), await body(c)) });
    } catch (err) { return fail(c, err, 'No se pudo actualizar la plantilla.'); }
  });

  router.delete('/inventory/document-templates/:id', manageTemplates, async (c) => {
    try {
      return c.json(await svc().templates.remove(c.req.param('id'), c.get('companyId')));
    } catch (err) { return fail(c, err, 'No se pudo eliminar la plantilla.'); }
  });

  // ── Custody records ──────────────────────────────────────────────────────
  router.get('/inventory/custodies', read, async (c) => {
    try {
      const { status, employeeId, itemId, q, page, pageSize } = c.req.query();
      return c.json(await svc().list({ companyId: c.get('companyId'), status, employeeId, itemId, q, page, pageSize }));
    } catch (err) { return fail(c, err, 'No se pudieron cargar los resguardos.'); }
  });

  router.post('/inventory/custodies', manage, async (c) => {
    try {
      return c.json({ custody: await svc().create(await body(c), c.get('companyId'), c.get('userId'), onBehalf(c)) }, 201);
    } catch (err) { return fail(c, err, 'No se pudo crear el resguardo.'); }
  });

  // Declared before /:id. Without deliver_on_behalf only the caller is listed.
  router.get('/inventory/custodies/deliverers', manage, async (c) => {
    try {
      return c.json(await svc().listDeliverers(c.get('companyId'), c.get('userId'), onBehalf(c)));
    } catch (err) { return fail(c, err, 'No se pudieron cargar las personas que entregan.'); }
  });

  router.get('/inventory/custodies/:id', read, async (c) => {
    try {
      return c.json({ custody: await svc().get(c.req.param('id'), c.get('companyId')) });
    } catch (err) { return fail(c, err, 'No se pudo cargar el resguardo.'); }
  });

  router.patch('/inventory/custodies/:id', manage, async (c) => {
    try {
      return c.json({ custody: await svc().update(c.req.param('id'), await body(c), c.get('companyId'), c.get('userId'), onBehalf(c)) });
    } catch (err) { return fail(c, err, 'No se pudo actualizar el resguardo.'); }
  });

  // Hand-edited snapshot fields of one row (spec §10.2); :itemId is the row id or the item id.
  router.patch('/inventory/custodies/:id/items/:itemId', manage, async (c) => {
    try {
      return c.json({ custody: await svc().updateItem(c.req.param('id'), c.req.param('itemId'), await body(c), c.get('companyId'), c.get('userId')) });
    } catch (err) { return fail(c, err, 'No se pudo actualizar el artículo del resguardo.'); }
  });

  router.post('/inventory/custodies/:id/signatures', manage, async (c) => {
    try {
      return c.json({ custody: await svc().sign(c.req.param('id'), await body(c), c.get('companyId'), c.get('userId'), onBehalf(c)) });
    } catch (err) { return fail(c, err, 'No se pudo guardar la firma.'); }
  });

  router.post('/inventory/custodies/:id/public-link', manage, async (c) => {
    try {
      const origin = c.req.header('origin') ?? null;
      const { sendEmail } = await body(c);
      return c.json(await svc().createPublicLink(c.req.param('id'), c.get('companyId'), c.get('userId'), { origin, sendEmail: sendEmail === true }));
    } catch (err) { return fail(c, err, 'No se pudo generar el enlace de firma.'); }
  });

  router.post('/inventory/custodies/:id/complete', manage, async (c) => {
    try {
      const { allowUnsigned, sendEmail } = await body(c);
      return c.json(await svc().complete(c.req.param('id'), c.get('companyId'), c.get('userId'), { allowUnsigned: allowUnsigned === true, sendEmail: sendEmail !== false }));
    } catch (err) { return fail(c, err, 'No se pudo completar el resguardo.'); }
  });

  router.post('/inventory/custodies/:id/document/regenerate', manage, async (c) => {
    try {
      return c.json({ custody: await svc().regenerateDocument(c.req.param('id'), c.get('companyId'), c.get('userId')) });
    } catch (err) { return fail(c, err, 'No se pudo generar el documento.'); }
  });

  router.post('/inventory/custodies/:id/cancel', manage, async (c) => {
    try {
      return c.json({ custody: await svc().cancel(c.req.param('id'), await body(c), c.get('companyId'), c.get('userId')) });
    } catch (err) { return fail(c, err, 'No se pudo cancelar el resguardo.'); }
  });

  router.get('/inventory/custodies/:id/document', read, async (c) => {
    try {
      return c.json(await svc().documentUrl(c.req.param('id'), c.get('companyId')));
    } catch (err) { return fail(c, err, 'No se pudo descargar el documento.'); }
  });

  // Binary response: PDF when Office is configured, else the filled DOCX/XLSX.
  router.post('/inventory/custodies/:id/preview', read, async (c) => {
    try {
      const document = await svc().preview(c.req.param('id'), c.get('companyId'));
      return c.body(document.buffer, 200, {
        'Content-Type': document.mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
        'X-Document-Format': document.format,
      });
    } catch (err) { return fail(c, err, 'No se pudo generar la vista previa.'); }
  });

  return router;
}
