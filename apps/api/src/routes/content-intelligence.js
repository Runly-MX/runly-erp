import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { tenantActiveContext } from '../lib/active-context.js';
import { createRequireInstanceAdmin } from '../lib/platform-owner.js';
import { ContentError, createContentIntelligence } from '../services/content-intelligence/service.js';

const filtersSchema = z.strictObject({ folderId: z.uuid().optional(), mime: z.string().max(100).optional(),
  fromDate: z.iso.datetime().optional(), toDate: z.iso.datetime().optional(),
  mode: z.enum(['all','never','failed','lowQuality','oldEngine']).default('all'),
  belowConfidence: z.number().min(0).max(100).default(70), quality: z.enum(['fast','balanced','accurate']).optional(),
});

export function createContentIntelligenceRouter({ prisma, filesService, supabaseAdmin, authMiddleware, requirePermission, env = process.env }) {
  const app = new Hono();
  const service = createContentIntelligence({ prisma, filesService, supabaseAdmin });
  const read = requirePermission('files.assets.read');
  const processFiles = requirePermission('files.assets.update');
  const manageCompany = async (c, next) => requirePermission('files.assets.update')(c, async () => {
    const tenant = c.get('tenantContext');
    if (!tenant?.isCompanyAdmin && !tenant?.isPlatformOwner) return c.json({ error: 'Se requiere administración de empresa.' }, 403);
    return next();
  });
  const manageInstance = requirePermission('core.instance.update');
  const instanceAdmin = createRequireInstanceAdmin({ prisma });
  const args = c => ({ authUserId: c.get('authUserId'), activeContext: tenantActiveContext(c), id: c.req.param('id') });
  const wrap = fn => async c => {
    c.header('Cache-Control', 'no-store');
    try { return await fn(c); }
    catch (error) {
      if (error instanceof ZodError) return c.json({ error: 'Solicitud inválida.' }, 400);
      if (error instanceof ContentError || [403,404,409,413,415,422].includes(error.status)) return c.json({ error: error.message }, error.status);
      // Error details may contain document text or connection strings.
      console.error('[content-intelligence] request failed');
      return c.json({ error: 'El procesamiento no está disponible. Comprueba la migración y el servicio.' }, 503);
    }
  };
  const smallBodies = bodyLimit({ maxSize: 8 * 1024 * 1024, onError: c => c.json({ error: 'Solicitud excesiva.' }, 413) });
  const derivativeBody = bodyLimit({ maxSize: 64 * 1024 * 1024, onError: c => c.json({ error: 'Solicitud excesiva.' }, 413) });
  // Only the worker's authenticated derivative upload may carry a large body.
  app.use('/content/*', (c, next) => c.req.method === 'PUT' && /^\/content\/worker\/derivatives\/[^/]+\/file$/.test(c.req.path) ? derivativeBody(c, next) : smallBodies(c, next));
  app.get('/content/search', authMiddleware, read, wrap(async c => c.json(await service.search(args(c), c.req.query()))));
  app.get('/content/files/:id', authMiddleware, read, wrap(async c => c.json({ data: await service.result(args(c), { unit: c.req.query('unit') && /^\d{1,3}$/.test(c.req.query('unit')) ? c.req.query('unit') : null }) })));
  app.post('/content/files/:id/process', authMiddleware, processFiles, wrap(async c => {
    const input = z.strictObject({ quality: z.enum(['fast','balanced','accurate']).optional(), reprocess: z.boolean().default(false) }).parse(await c.req.json());
    return c.json({ data: await service.request(args(c), input) }, 202);
  }));
  app.post('/content/files/:id/searchable-pdf', authMiddleware, processFiles, wrap(async c => c.json({ data: await service.requestSearchable(args(c)) }, 202)));
  app.get('/content/files/:id/searchable-pdf', authMiddleware, read, wrap(async c => c.json({ data: await service.searchableDownload(args(c)) })));
  app.post('/content/files/:id/cancel', authMiddleware, read, wrap(async c => c.json({ data: await service.cancel(args(c)) })));
  app.get('/content/admin/company', authMiddleware, manageCompany, wrap(async c => c.json({ data: await service.status(c.get('companyId')) })));
  app.put('/content/admin/company', authMiddleware, manageCompany, wrap(async c => c.json({ data: await service.savePolicy(c.get('companyId'), await c.req.json(), tenantActiveContext(c)) })));
  app.get('/content/admin/instance', authMiddleware, manageInstance, instanceAdmin, wrap(async c => c.json({ data: await service.status('instance') })));
  app.put('/content/admin/instance', authMiddleware, manageInstance, instanceAdmin, wrap(async c => c.json({ data: await service.savePolicy('instance', await c.req.json(), tenantActiveContext(c)) })));
  app.post('/content/admin/backfill', authMiddleware, manageCompany, wrap(async c => {
    const input = z.strictObject({ action: z.enum(['start','pause','resume','cancel']), filters: filtersSchema.optional() }).parse(await c.req.json());
    return c.json({ data: await service.backfill(c.get('companyId'), input.action, input.filters, tenantActiveContext(c)) });
  }));
  app.post('/content/admin/purge', authMiddleware, manageCompany, wrap(async c => {
    z.strictObject({ confirm: z.literal('PURGAR') }).parse(await c.req.json());
    return c.json({ data: await service.purge(c.get('companyId'), tenantActiveContext(c)) });
  }));
  app.post('/content/admin/retry', authMiddleware, manageCompany, wrap(async c => {
    const input = filtersSchema.parse(await c.req.json());
    return c.json({ data: await service.backfill(c.get('companyId'),'start',{...input,mode:input.mode==='all'?'failed':input.mode},tenantActiveContext(c)) });
  }));

  const workerAuth = async (c, next) => {
    const expected = env.RUNLY_CONTENT_WORKER_TOKEN;
    const provided = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
    if (!expected || expected.length < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return c.json({ error: 'No autorizado.' }, 401);
    await next();
  };
  app.post('/content/worker/heartbeat', workerAuth, wrap(async c => {
    const input = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), capabilities: z.strictObject({
      engine: z.string().max(120), languages: z.array(z.string().max(30)).max(100), models: z.record(z.string(), z.string().max(128)),
      cpuLimit: z.number().positive().nullable(), memoryLimit: z.number().positive().nullable(),
      memoryUsed: z.number().nonnegative(), governor: z.enum(['ready','paused','unknown']),
      protocol: z.number().int().min(1).max(2).default(1),
      cpuUsedPercent: z.number().nonnegative().nullable().optional(),
      tempFreeBytes: z.number().nonnegative().optional(),
    }) }).parse(await c.req.json());
    await service.heartbeat(input.id, input.capabilities);
    return c.json({ ok: true });
  }));
  app.post('/content/worker/claim', workerAuth, wrap(async c => {
    const { id } = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) }).parse(await c.req.json());
    return c.json({ data: await service.claim(id) });
  }));
  app.get('/content/worker/jobs/:id/source', workerAuth, wrap(async c => {
    const data = await service.download(c.req.param('id'), c.req.header('X-Content-Lease'));
    c.header('Content-Type', 'application/octet-stream');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(data);
  }));
  app.post('/content/worker/jobs/:id/heartbeat', workerAuth, wrap(async c => {
    const { progress } = z.strictObject({ progress: z.number().int().min(0).max(99) }).parse(await c.req.json());
    return c.json(await service.renew(c.req.param('id'), c.req.header('X-Content-Lease'), progress));
  }));
  app.post('/content/worker/jobs/:id/result', workerAuth, wrap(async c => c.json(await service.complete(c.req.param('id'), c.req.header('X-Content-Lease'), await c.req.json()))));
  app.post('/content/worker/jobs/:id/checkpoint', workerAuth, wrap(async c => c.json(await service.checkpoint(c.req.param('id'),c.req.header('X-Content-Lease'),await c.req.json()))));
  app.post('/content/worker/derivative/claim', workerAuth, wrap(async c => {
    const { id } = z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) }).parse(await c.req.json());
    return c.json({ data: await service.claimDerivative(id) });
  }));
  app.get('/content/worker/derivatives/:id/source', workerAuth, wrap(async c => {
    const data = await service.derivativeSource(c.req.param('id'), c.req.header('X-Content-Lease'));
    c.header('Content-Type', 'application/octet-stream');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(data);
  }));
  app.get('/content/worker/derivatives/:id/pages', workerAuth, wrap(async c => c.json(await service.derivativePages(c.req.param('id'), c.req.header('X-Content-Lease')))));
  app.post('/content/worker/derivatives/:id/heartbeat', workerAuth, wrap(async c => c.json(await service.derivativeRenew(c.req.param('id'), c.req.header('X-Content-Lease')))));
  app.put('/content/worker/derivatives/:id/file', workerAuth, wrap(async c => c.json(await service.derivativeUpload(c.req.param('id'), c.req.header('X-Content-Lease'), new Uint8Array(await c.req.arrayBuffer())))));
  app.post('/content/worker/derivatives/:id/result', workerAuth, wrap(async c => c.json(await service.derivativeComplete(c.req.param('id'), c.req.header('X-Content-Lease'), await c.req.json()))));
  return app;
}
