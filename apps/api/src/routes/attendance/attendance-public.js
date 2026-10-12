import { Hono } from 'hono'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { AttendanceError } from './attendance-core.js'
import { createAttendanceKioskService } from './attendance-kiosk-service.js'

function fail(c, error, fallback) {
  if (error instanceof AttendanceError) return c.json({ error: error.message, code: error.code }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.attendance:public]', error)
  return c.json({ error: fallback }, 500)
}

const clientKey = (c) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
const deviceToken = (c) => (c.req.header('authorization') ?? '').replace(/^Kiosk\s+/i, '') || null

// /public/attendance/* — path-scoped and unauthenticated. The kiosk link only
// starts a pairing; roster and sync require the approved device token.
export function createAttendancePublicRouter({ prisma, service = null, limiter = createTokenBucketLimiter({ capacity: 60, refillPerSecond: 2 }), strictLimiter = createTokenBucketLimiter({ capacity: 8, refillPerSecond: 0.1 }) }) {
  const app = new Hono()
  const kiosks = service ?? createAttendanceKioskService({ prisma })

  app.use('/public/attendance/*', async (c, next) => {
    const result = limiter.consume(clientKey(c))
    if (!result.allowed) return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }, 429)
    return next()
  })

  app.get('/public/attendance/kiosk/:link', async (c) => {
    try {
      const kiosk = await kiosks.kioskByLink(c.req.param('link'))
      return c.json({ data: { name: kiosk.name, paired: Boolean(kiosk.deviceTokenHash), revoked: Boolean(kiosk.revokedAt) } })
    } catch (error) { return fail(c, error, 'No se pudo abrir el kiosko.') }
  })

  app.post('/public/attendance/kiosk/:link/pair', async (c) => {
    try {
      if (!strictLimiter.consume(`pair:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos de emparejamiento.' }, 429)
      const body = await c.req.json().catch(() => ({}))
      return c.json({ data: await kiosks.requestPairing(c.req.param('link'), body.label) })
    } catch (error) { return fail(c, error, 'No se pudo solicitar el emparejamiento.') }
  })

  app.get('/public/attendance/kiosk/:link/pair-status', async (c) => {
    try { return c.json({ data: await kiosks.pairingStatus(c.req.param('link'), c.req.header('x-pair-secret')) }) }
    catch (error) { return fail(c, error, 'No se pudo consultar el emparejamiento.') }
  })

  app.get('/public/attendance/kiosk/:link/roster', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      return c.json({ data: await kiosks.roster(kiosk) })
    } catch (error) { return fail(c, error, 'No se pudo cargar el kiosko.') }
  })

  app.post('/public/attendance/kiosk/:link/sync', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      return c.json({ data: await kiosks.sync(kiosk, await c.req.json().catch(() => ({}))) })
    } catch (error) { return fail(c, error, 'No se pudieron sincronizar las checadas.') }
  })

  app.post('/public/attendance/enroll', async (c) => {
    try {
      if (!strictLimiter.consume(`enroll:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429)
      return c.json({ data: await kiosks.enrollPhone(await c.req.json().catch(() => ({}))) }, 201)
    } catch (error) { return fail(c, error, 'No se pudo enrolar el teléfono.') }
  })

  return app
}
