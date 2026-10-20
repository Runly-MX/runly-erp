// Helpers shared by the supplier-portal routers (public session + /inventory/guest/*).
import { InventoryServiceError } from '../../../services/inventory-guards.js';

export function clientIp(c) {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return c.req.header('x-real-ip') ?? 'local';
}

// Per-IP token-bucket guard; 429 with Retry-After when the bucket is empty.
export const rateLimit = (limiter) => async (c, next) => {
  const result = limiter.consume(clientIp(c));
  if (!result.allowed) {
    c.header('Retry-After', String(result.retryAfter));
    return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' }, 429);
  }
  return next();
};

// InventoryServiceError keeps its status/code/details; anything else is a generic 500 (never leaks internals).
export function failGuest(c, err, fallback) {
  if (err instanceof InventoryServiceError || err?.name === 'InventoryServiceError') {
    if (err.status === 429) c.header('Retry-After', '60');
    return c.json({ error: err.message, ...(err.code ? { code: err.code, details: err.details ?? null } : {}) }, err.status);
  }
  console.error('[runly.inventory] guest route failed', err?.name ?? 'Error');
  return c.json({ error: fallback }, 500);
}
