// /public/bookings/* - the customer side of runly.bookings, without a Runly
// account. No admin route is reachable from here; the manage token travels in
// the X-Booking-Token header (the page keeps it in the URL fragment), never in a path.
import { Hono } from 'hono'
import { publicAvailabilityQuerySchema, publicBookingCreateSchema, publicManageAvailabilitySchema, publicRescheduleSchema } from '@runly/validators'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { parseTrustedProxies, resolveClientIp } from '../../mcp/client-ip.js'
import { resolveAppBaseUrl } from '../../services/email-templates.js'
import { strictWebsiteHostname } from '../../services/website-gateway-service.js'
import { BookingError } from './bookings-core.js'
import { createSharedBucket } from './bookings-rate-limit.js'
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

// Hosts that serve the ERP SPA (same rule as /public/website/admin-origin-check).
function isAdminHost(host, env) {
  let name
  try { name = strictWebsiteHostname(String(host ?? '')) } catch { return false }
  const configured = [env.RUNLY_APP_URL, resolveAppBaseUrl(env)].filter(Boolean).map((v) => { try { return new URL(v).hostname } catch { return null } })
  return name === 'localhost' || name === '127.0.0.1' || configured.includes(name)
}

export function createBookingsPortalRouter({ prisma, getBrand, env = process.env, portal = null, now = () => Date.now(), limits = {}, onChanged, meetings = null }) {
  const app = new Hono()
  const svc = portal ?? createBookingsPortalService({ prisma, commands: createBookingsCommandService({ prisma, now, onChanged }), getBrand, env, now, meetings })
  const trusted = parseTrustedProxies(env.RUNLY_TRUSTED_PROXIES || env.RUNLY_MCP_TRUSTED_PROXIES)
  const origins = allowedOrigins(env)
  // Per IP: browsing (in memory: cheap, and N instances only multiply a generous
  // limit); per IP + page: new bookings; per page: a flood from many IPs; per IP:
  // manage changes. Writes are shared in PostgreSQL across every API instance.
  const [readCapacity, readRefill] = limits.reads ?? LIMITS.reads
  const reads = createTokenBucketLimiter({ capacity: readCapacity, refillPerSecond: readRefill, now })
  const shared = (name) => { const [capacity, refillPerSecond] = limits[name] ?? LIMITS[name]; return createSharedBucket({ prisma, capacity, refillPerSecond, now, namespace: name }) }
  const creates = shared('creates'), pageCreates = shared('pageCreates'), manageWrites = shared('manageWrites')

  const ip = (c) => resolveClientIp(c.env?.incoming?.socket?.remoteAddress, c.req.header('x-forwarded-for'), trusted)
  const limited = (c, result) => {
    c.header('Retry-After', String(Math.ceil(result.retryAfter || 60)))
    return c.json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', code: 'RATE_LIMITED' }, 429)
  }

  // nginx auth_request before serving /app/p/reservar/* HTML: answers the CSP
  // frame-ancestors for that URL, and 403 on hosts that are not the ERP (like the
  // admin gate, a customer's website domain never serves the SPA).
  app.get('/public/bookings/frame-policy', async (c) => {
    c.header('Cache-Control', 'no-store')
    if (!isAdminHost(c.req.header('host'), env)) return c.body(null, 403)
    try {
      c.header('X-Booking-Frame-Ancestors', await svc.frameAncestors(c.req.header('x-original-uri')))
    } catch (error) {
      console.error('[runly.bookings public] frame policy', error?.message ?? 'error')
      c.header('X-Booking-Frame-Ancestors', "'self'")
    }
    return c.body(null, 204)
  })

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
    const perIp = await creates.consume(`c:${ip(c)}:${slug}`)
    if (!perIp.allowed) return limited(c, perIp)
    const perPage = await pageCreates.consume(`p:${slug}`)
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
      const result = await manageWrites.consume(`m:${ip(c)}`)
      if (!result.allowed) return limited(c, result)
      const key = c.req.header('idempotency-key')
      if (!key || !/^[A-Za-z0-9:_-]{20,200}$/.test(key)) throw new BookingError('Solicitud inválida.', 400, 'IDEMPOTENCY_KEY_REQUIRED')
      const data = action === 'cancel' ? await svc.cancel(token(c), { idempotencyKey: key }) : await svc.reschedule(token(c), await parse(c, publicRescheduleSchema), { idempotencyKey: key })
      return c.json({ data })
    }))
  }
  return app
}
