// Public item page data, mounted at /public/inventory/items. No auth: the opaque
// revocable token is the credential. Unknown, revoked, malformed or legacy
// (f-<folio>) tokens all answer the same 404. Rate limited per IP.
// Path-scoped only; never add a root use('*').
import { Hono } from 'hono';
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js';
import { createInventoryPublicService } from '../../services/inventory-public-service.js';

function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'local';
}

export function createInventoryItemPublicRouter({
  prisma,
  supabaseAdmin = null,
  publicService = null,
  limiter = createTokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 }),
}) {
  const app = new Hono();
  let service = publicService;
  const svc = () => (service ??= createInventoryPublicService({ prisma, supabaseAdmin }));

  app.get('/:token', async (c) => {
    const rate = limiter.consume(clientIp(c));
    if (!rate.allowed) {
      c.header('Retry-After', String(rate.retryAfter));
      return c.json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
    }
    c.header('Cache-Control', 'no-store');
    try {
      return c.json({ item: await svc().resolve(c.req.param('token')) });
    } catch (err) {
      if (err?.name === 'InventoryServiceError' && err.status === 404) return c.json({ error: 'Enlace no válido.' }, 404);
      return c.json({ error: 'No se pudo cargar el equipo.' }, 500);
    }
  });

  return app;
}
