// Saved signature of the signed-in user: GET|PUT|PATCH|DELETE /profile/me/signature.
// Spec: docs/superpowers/specs/2026-10-13-inventory-custody-design.md §9.6
// Same auth as the other /profile/me routes (authMiddleware + profile.self.*).
import { Hono } from 'hono';
import { createUserSignatureService } from '../services/user-signature-service.js';

export function createProfileSignatureRouter({ prisma, supabaseAdmin, authMiddleware, requirePermission, signatureService = null }) {
  const router = new Hono();
  const svc = signatureService ?? createUserSignatureService({ prisma, supabaseAdmin });
  const read = requirePermission('profile.self.read');
  const update = requirePermission('profile.self.update');
  const fail = (c, err, fallback) => (err?.name === 'UserSignatureError' && err.status
    ? c.json({ error: err.message }, err.status)
    : c.json({ error: fallback }, 500));
  const body = (c) => c.req.json().catch(() => ({}));

  router.get('/profile/me/signature', authMiddleware, read, async (c) => {
    try {
      return c.json(await svc.get(c.get('userId')));
    } catch (err) { return fail(c, err, 'No se pudo cargar la firma.'); }
  });

  router.put('/profile/me/signature', authMiddleware, update, async (c) => {
    try {
      return c.json(await svc.put(c.get('userId'), await body(c)));
    } catch (err) { return fail(c, err, 'No se pudo guardar la firma.'); }
  });

  router.patch('/profile/me/signature', authMiddleware, update, async (c) => {
    try {
      return c.json(await svc.patch(c.get('userId'), await body(c)));
    } catch (err) { return fail(c, err, 'No se pudo actualizar la firma.'); }
  });

  router.delete('/profile/me/signature', authMiddleware, update, async (c) => {
    try {
      return c.json(await svc.remove(c.get('userId')));
    } catch (err) { return fail(c, err, 'No se pudo eliminar la firma.'); }
  });

  return router;
}
