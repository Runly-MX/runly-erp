// Public signing link for custody records (resguardos), mounted at
// /public/inventory/custody. No auth: the hashed token is the credential.
// Minimal data only (no employee number or e-mail), rate limited per IP.
// Path-scoped only; never add a root use('*').
import { Hono } from 'hono';
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js';
import { createInventoryCustodyService } from '../../services/inventory-custody-service.js';

function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'local';
}

export function createInventoryCustodyPublicRouter({
  prisma,
  supabaseAdmin = null,
  custodyService = null,
  limiter = createTokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 }),
}) {
  const app = new Hono();
  let service = custodyService;
  const svc = () => (service ??= createInventoryCustodyService({ prisma, supabaseAdmin }));

  const limited = (c) => {
    const rate = limiter.consume(clientIp(c));
    if (rate.allowed) return null;
    c.header('Retry-After', String(rate.retryAfter));
    return c.json({ error: 'Demasiadas solicitudes. Intenta más tarde.' }, 429);
  };
  const fail = (c, err, fallback) => (err?.name === 'InventoryServiceError' && err.status
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));

  app.get('/:token', async (c) => {
    const blocked = limited(c);
    if (blocked) return blocked;
    try {
      return c.json({ custody: await svc().getPublic(c.req.param('token')) });
    } catch (err) { return fail(c, err, 'No se pudo cargar el resguardo.'); }
  });

  // -> { ok, signedAt, completed }: completes the record when the deliverer
  // already signed (spec §11.2); 409 when the receiver already signed.
  app.post('/:token/sign', async (c) => {
    const blocked = limited(c);
    if (blocked) return blocked;
    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json(await svc().signPublic(c.req.param('token'), body));
    } catch (err) { return fail(c, err, 'No se pudo guardar la firma.'); }
  });

  return app;
}
