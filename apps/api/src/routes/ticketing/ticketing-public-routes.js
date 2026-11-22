// /public/ticketing/* - the visitor side of runly.ticketing (F6E), without a Runly account.
// No admin route is reachable from here. The buyer's link travels in X-Ticket-Token (the page
// keeps it in the URL fragment), never in a path. Same guards as the Reservaciones portal:
// own origins only, per-IP and per-event limits shared across API instances, frame policy.
import { Hono } from 'hono'
import { publicTicketOrderSchema, ticketResendSchema } from '@runly/validators'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { parseTrustedProxies, resolveClientIp } from '../../mcp/client-ip.js'
import { allowedOrigins, isAdminHost } from '../bookings/bookings-public-routes.js'
import { createSharedBucket } from '../bookings/bookings-rate-limit.js'
import { createBookingsCommandService } from '../bookings/bookings-command-service.js'
import { TicketingError } from './ticketing-core.js'
import { createTicketingCommandService } from './ticketing-command-service.js'
import { createTicketingPublicService } from './ticketing-public-service.js'

const LIMITS = { reads: [120, 1], creates: [6, 1 / 120], eventCreates: [300, 2], resends: [5, 1 / 300] }

export function createTicketingPublicRouter({ prisma, env = process.env, service = null, commands = null, signFile, getBrand, onIssued = null, limits = {}, now = () => Date.now() }) {
  const app = new Hono()
  const svc = service ?? createTicketingPublicService({ prisma, commands: commands ?? createTicketingCommandService({ prisma, engine: createBookingsCommandService({ prisma }), env }), signFile, getBrand, env, now })
  const trusted = parseTrustedProxies(env.RUNLY_TRUSTED_PROXIES || env.RUNLY_MCP_TRUSTED_PROXIES)
  const origins = allowedOrigins(env)
  const [readCapacity, readRefill] = limits.reads ?? LIMITS.reads
  const reads = createTokenBucketLimiter({ capacity: readCapacity, refillPerSecond: readRefill, now })
  const shared = (name) => { const [capacity, refillPerSecond] = limits[name] ?? LIMITS[name]; return createSharedBucket({ prisma, capacity, refillPerSecond, now, namespace: `tk-${name}` }) }
  const creates = shared('creates'), eventCreates = shared('eventCreates'), resends = shared('resends')
  const ip = (c) => resolveClientIp(c.env?.incoming?.socket?.remoteAddress, c.req.header('x-forwarded-for'), trusted)
  const limited = (c, result) => {
    c.header('Retry-After', String(Math.ceil(result.retryAfter || 60)))
    return c.json({ error: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', code: 'RATE_LIMITED' }, 429)
  }

  // nginx auth_request before serving /app/p/boletos/* HTML (CSP frame-ancestors).
  app.get('/public/ticketing/frame-policy', async (c) => {
    c.header('Cache-Control', 'no-store')
    if (!isAdminHost(c.req.header('host'), env)) return c.body(null, 403)
    try {
      c.header('X-Ticket-Frame-Ancestors', await svc.frameAncestors(c.req.header('x-original-uri')))
    } catch (error) {
      console.error('[runly.ticketing public] frame policy', error?.message ?? 'error')
      c.header('X-Ticket-Frame-Ancestors', "'self'")
    }
    return c.body(null, 204)
  })

  app.use('/public/ticketing/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    const origin = c.req.header('origin')
    if (origin && origins.size && !origins.has(origin)) return c.json({ error: 'Origen no permitido.', code: 'ORIGIN_FORBIDDEN' }, 403)
    const result = reads.consume(`r:${ip(c)}`)
    if (!result.allowed) return limited(c, result)
    return next()
  })

  const run = (fn) => async (c) => {
    try {
      return await fn(c)
    } catch (error) {
      if (error instanceof TicketingError || (error?.status && error?.code)) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      console.error('[runly.ticketing public]', error?.code ?? '', error?.message ?? 'error')
      return c.json({ error: 'No pudimos completar la solicitud. Inténtalo de nuevo.', code: 'UNAVAILABLE' }, 503)
    }
  }
  const token = (c) => c.req.header('x-ticket-token') ?? ''
  async function parse(c, schema) {
    const result = schema.safeParse(await c.req.json().catch(() => ({})))
    if (!result.success) throw new TicketingError(result.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'VALIDATION')
    return result.data
  }

  app.get('/public/ticketing/events/:slug', run(async (c) => c.json({ data: await svc.getEvent(c.req.param('slug'), c.req.query('vista')) })))
  app.post('/public/ticketing/events/:slug/orders', run(async (c) => {
    const slug = c.req.param('slug')
    const perIp = await creates.consume(`c:${ip(c)}:${slug}`)
    if (!perIp.allowed) return limited(c, perIp)
    const perEvent = await eventCreates.consume(`e:${slug}`)
    if (!perEvent.allowed) return limited(c, perEvent)
    const input = await parse(c, publicTicketOrderSchema)
    const channel = c.req.query('canal') === 'website' ? 'website' : 'portal'
    const result = await svc.createOrder(slug, input, { idempotencyKey: c.req.header('idempotency-key'), channel })
    if (onIssued && !result.replayed) Promise.resolve().then(() => onIssued(result)).catch(() => {})
    // The QR texts go to the visitor who just obtained them, once (a replay gets none).
    return c.json({ data: result.order, credentials: result.credentials, manageToken: result.manageToken, replayed: result.replayed }, result.replayed ? 200 : 201)
  }))
  app.get('/public/ticketing/orders', run(async (c) => c.json({ data: await svc.manage(token(c)) })))
  app.post('/public/ticketing/orders/resend', run(async (c) => {
    const perIp = await resends.consume(`ri:${ip(c)}`)
    if (!perIp.allowed) return limited(c, perIp)
    const perLink = await resends.consume(`rl:${token(c).slice(0, 16)}`)
    if (!perLink.allowed) return limited(c, perLink)
    const { ticketIds } = await parse(c, ticketResendSchema)
    return c.json({ data: await svc.resend(token(c), { ticketIds: ticketIds ?? null }) })
  }))
  return app
}
