// /public/lms/* — certificate verification and course share links, path-scoped and unauthenticated.
import { Hono } from 'hono'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { LmsError } from './lms-error.js'
import { createLmsCertService } from './lms-cert-service.js'
import { createLmsGuestService } from './lms-guest-service.js'
import { registerLmsSharePublicRoutes } from './lms-share-public.js'
import { createLmsHls } from './lms-hls.js'
import { createLmsMedia } from './lms-media.js'

const clientKey = (c) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'

function fail(c, error, fallback) {
  if (error instanceof LmsError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.lms:public]', error)
  return c.json({ error: fallback }, 500)
}

// service / guestService: optional overrides (tests). Guests behind one office IP
// share a bucket, so the share limiter is wider than the certificate one.
export function createLmsPublicRouter({
  prisma, signFile = null, supabaseAdmin = null, bucket = 'runly-files', notificationService = null, service = null, guestService = null, documentsHub = null,
  limiter = createTokenBucketLimiter({ capacity: 30, refillPerSecond: 0.5 }),
  shareLimiter = createTokenBucketLimiter({ capacity: 300, refillPerSecond: 5 }),
  joinLimiter = createTokenBucketLimiter({ capacity: 20, refillPerSecond: 0.2 }),
  // Invite code checks: 10 per IP, then one every 30 s.
  accessLimiter = createTokenBucketLimiter({ capacity: 10, refillPerSecond: 1 / 30 }),
}) {
  const app = new Hono()
  const certs = service ?? createLmsCertService({ prisma, signFile, hub: documentsHub })
  const hlsManifest = supabaseAdmin ? createLmsHls({ prisma, supabaseAdmin, bucket }).manifestFor : null
  const media = supabaseAdmin ? createLmsMedia({ prisma, supabaseAdmin, bucket }) : null
  const guest = guestService ?? createLmsGuestService({ prisma, signFile, hlsManifest, notificationService, media })

  app.use('/public/lms/certificates/*', async (c, next) => {
    const result = limiter.consume(clientKey(c))
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter))
      return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' }, 429)
    }
    return next()
  })

  app.get('/public/lms/certificates/:token', async (c) => {
    try {
      c.header('Cache-Control', 'no-store')
      return c.json({ data: await certs.publicCertificate(c.req.param('token')) })
    } catch (error) { return fail(c, error, 'No se pudo verificar el certificado.') }
  })

  // Also served for revoked certificates (stamped "REVOCADO").
  app.get('/public/lms/certificates/:token/pdf', async (c) => {
    try {
      const { buffer, filename } = await certs.publicCertificatePdf(c.req.param('token'))
      return c.body(buffer, 200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' })
    } catch (error) { return fail(c, error, 'No se pudo generar el certificado.') }
  })

  registerLmsSharePublicRoutes(app, { guest, limiter: shareLimiter, joinLimiter, accessLimiter, clientKey, fail })

  return app
}
