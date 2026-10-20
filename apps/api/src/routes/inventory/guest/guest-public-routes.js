// POST /public/inventory/guest/session - the only unauthenticated supplier-portal endpoint. Trades the
// emailed link token (and the access code, when the invite has one) for a guest session token.
// Rate limited per IP; failed codes are also counted per invite inside the service. Path-scoped only.
import { Hono } from 'hono';
import { createTokenBucketLimiter } from '../../../lib/token-bucket-limiter.js';
import { failGuest, rateLimit } from './guest-shared.js';

export function createInventoryGuestPublicRouter({
  guestService,
  limiter = createTokenBucketLimiter({ capacity: 10, refillPerSecond: 0.1 }),
}) {
  const app = new Hono();
  app.post('/session', rateLimit(limiter), async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      const body = await c.req.json().catch(() => ({}));
      const data = await guestService.startSession({ token: body?.token, code: body?.code ?? null });
      return c.json({ data });
    } catch (err) {
      return failGuest(c, err, 'No se pudo abrir tu acceso.');
    }
  });
  return app;
}
