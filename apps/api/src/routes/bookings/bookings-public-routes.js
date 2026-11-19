// /public/bookings/* - the customer side of runly.bookings, without a Runly
// account. No admin route is reachable from here; the manage token travels in
// the X-Booking-Token header (the page keeps it in the URL fragment), never in a path.
import { Hono } from 'hono'
import { publicAvailabilityQuerySchema, publicBookingCreateSchema, publicManageAvailabilitySchema, publicRescheduleSchema } from '@runly/validators'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { parseTrustedProxies, resolveClientIp } from '../../mcp/client-ip.js'
import { resolveAppBaseUrl } from '../../services/email-templates.js'
import { BookingError } from './bookings-core.js'
import { createBookingsCommandService } from './bookings-command-service.js'
import { createBookingsPortalService } from './bookings-portal-service.js'

// Browser calls only from the ERP web app's own origins (the portal lives there).
export function allowedOrigins(env = process.env) {
  const list = String(env.CORS_ORIGIN ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  const app = resolveAppBaseUrl(env)
  if (app) list.push(app)
  return new Set(list.map((v) => { try { return new URL(v).origin } catch { return null } }).filter(Boolean))
}

const LIMITS = { reads: [120, 1], creates: [6, 1 / 120], pageCreates: [120, 1 / 30], manageWrites: [10, 1 / 60] }

export function createBookingsPortalRouter({ prisma, getBrand, env = process.env, portal = null, now = () => Date.now(), limits = {} }) {
  const app = new Hono()
  const svc = portal ?? createBookingsPortalService({ prisma, commands: createBookingsCommandService({ prisma, now }), getBrand, env, now })
  const trusted = parseTrustedProxies(env.RUNLY_TRUSTED_PROXIES || env.RUNLY_MCP_TRUSTED_PROXIES)
  const origins = allowedOrigins(env)
  // Per IP: browsing; per IP + page: new bookings; per page: a flood from many IPs.
  const bucket = (name) => { const [capacity, refillPerSecond] = limits[name] ?? LIMITS[name]; return createTokenBucketLimiter({ capacity, refillPerSecond, now }) }
  const reads = bucket('reads'), creates = bucket('creates'), pageCreates = bucket('pageCreates'), manageWrites = bucket('manageWrites')

  const ip = (c) => resolveClientIp(c.env?.incoming?.socket?.remoteAddress, c.req.header('x-forwarded-for'), trusted)
  const limited = (c, result) => {
    c.header('Retry-After', String(Math.ceil(result.retryAfter || 60)))
    return c.json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', code: 'RATE_LIMITED' }, 429)
  }

  app.use('/public/bookings/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    const origin = c.req.header('origin')
    if (origin && origins.size && !origins.has(origin)) return c.json({ error: 'Origen no permitido.', code: 'ORIGIN_FORBIDDEN' }, 403)
    const result = reads.consume(`r:${ip(c)}`)
    if (!result.allowed) return limited(c, result)
    return next()
  })

  async function parse(c, schema, source = 'json') {
    const raw = source === 'query' ? c.req.query() : await c.req.json().catch(() => ({}))
    const result = schema.safeParse(raw)
    if (!result.success) throw new BookingError(result.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'VALIDATION')
    return result.data
  }
  // Errors never echo input or internal details; 5xx are logged without payloads.
  const run = (fn) => async (c) => {
    try {
      return await fn(c)
    } catch (error) {
      if (error instanceof BookingError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      console.error('[runly.bookings public]', error?.code ?? '', error?.message ?? 'error')
      return c.json({ error: 'No pudimos completar la solicitud. Inténtalo de nuevo.', code: 'UNAVAILABLE' }, 503)
    }
  }
  const token = (c) => c.req.header('x-booking-token') ?? ''

  app.get('/public/bookings/pages/:slug', run(async (c) => c.json({ data: await svc.getPage(c.req.param('slug'), c.req.query('vista')) })))
  app.get('/public/bookings/pages/:slug/availability', run(async (c) => c.json({ data: await svc.availability(c.req.param('slug'), await parse(c, publicAvailabilityQuerySchema, 'query')) })))
  app.post('/public/bookings/pages/:slug/reservations', run(async (c) => {
    const slug = c.req.param('slug')
    const perIp = creates.consume(`c:${ip(c)}:${slug}`)
    if (!perIp.allowed) return limited(c, perIp)
    const perPage = pageCreates.consume(`p:${slug}`)
    if (!perPage.allowed) return limited(c, perPage)
    const input = await parse(c, publicBookingCreateSchema)
    const result = await svc.create(slug, input, { idempotencyKey: c.req.header('idempotency-key'), ip: ip(c) })
    return c.json({ data: result.booking, manageToken: result.manageToken, replayed: result.replayed }, result.replayed ? 200 : 201)
  }))

  app.get('/public/bookings/manage', run(async (c) => c.json({ data: await svc.manage(token(c)) })))
  app.get('/public/bookings/manage/availability', run(async (c) => {
    const query = await parse(c, publicManageAvailabilitySchema, 'query')
    return c.json({ data: await svc.manageAvailability(token(c), query) })
  }))
  for (const action of ['cancel', 'reschedule']) {
    app.post(`/public/bookings/manage/${action}`, run(async (c) => {
      const result = manageWrites.consume(`m:${ip(c)}`)
      if (!result.allowed) return limited(c, result)
      const key = c.req.header('idempotency-key')
      if (!key || !/^[A-Za-z0-9:_-]{20,200}$/.test(key)) throw new BookingError('Solicitud inválida.', 400, 'IDEMPOTENCY_KEY_REQUIRED')
      const data = action === 'cancel' ? await svc.cancel(token(c), { idempotencyKey: key }) : await svc.reschedule(token(c), await parse(c, publicRescheduleSchema), { idempotencyKey: key })
      return c.json({ data })
    }))
  }
  return app
}
