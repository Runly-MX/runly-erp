// runly.ticketing internal API (/ticketing/*). Thin: validation, tenant + per-event
// role checks, then the services. Roles: viewer reads, agent issues and cancels at the
// box office, admin configures the event; ticketing.events.manage creates events.
import { Hono } from 'hono'
import {
  ticketCancelSchema, ticketConfirmPaymentSchema, ticketScanSchema, ticketMemberSchema, ticketEventCreateSchema, ticketEventUpdateSchema, ticketOrderCreateSchema, ticketQuotaSchema,
  ticketSessionCreateSchema, ticketTransferSchema, ticketTypeCreateSchema, ticketTypeUpdateSchema,
} from '@runly/validators'
import { createBookingsCommandService } from '../bookings/bookings-command-service.js'
import { createSharedBucket } from '../bookings/bookings-rate-limit.js'
import { TicketingError, canCreateEvents, isTicketingAdmin, notFound, requireEventRole, serializeEvent } from './ticketing-core.js'
import { createTicketingCheckinService } from './ticketing-checkin-service.js'
import { createTicketingCommandService } from './ticketing-command-service.js'
import { createTicketingConfigService } from './ticketing-config-service.js'
import { createTicketingPaymentService } from './ticketing-payment-service.js'

export function createTicketingRouter({ prisma, requirePermission, requireAnyPermission = null, engine = null, commands = null, payments = null, checkin = null, scanLimit = [60, 3] }) {
  const app = new Hono()
  const bookings = engine ?? createBookingsCommandService({ prisma })
  const config = createTicketingConfigService({ prisma, engine: bookings })
  const cmd = commands ?? createTicketingCommandService({ prisma, engine: bookings })
  const pay = payments ?? createTicketingPaymentService({ prisma })
  const gate = checkin ?? createTicketingCheckinService({ prisma })
  const access = requirePermission('ticketing.access')
  const checkinAccess = requirePermission('ticketing.checkin')
  // Shared PostgreSQL buckets (all API instances): per operator and per reader device.
  const scanBucket = createSharedBucket({ prisma, capacity: scanLimit[0], refillPerSecond: scanLimit[1], namespace: 'tk-scan' })
  // Caja confirms the sale it just charged: cashiers without Boletos access may load
  // the order's lines and confirm it (the server proves the payment either way).
  const accessOrCashier = requireAnyPermission ? requireAnyPermission(['ticketing.access', 'pos.caja.operate']) : access

  const companyId = (c) => c.get('companyId')
  const userId = (c) => c.get('userContext')?.profile?.id ?? c.get('userId') ?? null
  const ctx = (c) => c.get('userContext')
  const key = (c) => c.req.header('Idempotency-Key') || null
  async function parse(c, schema) {
    const result = schema.safeParse(await c.req.json().catch(() => ({})))
    if (!result.success) throw new TicketingError(result.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'VALIDATION')
    return result.data
  }
  const role = (c, eventId, min) => requireEventRole(prisma, { companyId: companyId(c), eventId, userId: userId(c), ctx: ctx(c), min })
  // Orders and tickets resolve their event first, inside this company only.
  async function eventOf(c, table, id) {
    const rows = table === 'order'
      ? await prisma.$queryRaw`SELECT event_id FROM ticket_order WHERE id = ${id}::uuid AND company_id = ${companyId(c)}::uuid`
      : table === 'ticket'
        ? await prisma.$queryRaw`SELECT o.event_id FROM ticket t JOIN ticket_order o ON o.id = t.order_id WHERE t.id = ${id}::uuid AND t.company_id = ${companyId(c)}::uuid`
        : table === 'type'
          ? await prisma.$queryRaw`SELECT event_id FROM ticket_type WHERE id = ${id}::uuid AND company_id = ${companyId(c)}::uuid`
          : await prisma.$queryRaw`SELECT event_id FROM ticket_session WHERE id = ${id}::uuid AND company_id = ${companyId(c)}::uuid`
    if (!rows[0]) throw notFound({ order: 'Orden', ticket: 'Boleto', type: 'Tipo de boleto', session: 'Función' }[table])
    return rows[0].event_id
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const run = (fn) => async (c) => {
    try {
      for (const value of Object.values(c.req.param())) if (!uuid.test(value)) throw notFound()
      return await fn(c)
    } catch (error) {
      if (error?.status && error?.code) return c.json({ error: error.message, code: error.code }, error.status)
      console.error('[runly.ticketing]', error?.message ?? error)
      return c.json({ error: 'No se pudo completar la operación de boletos.' }, 500)
    }
  }

  // Events
  app.get('/ticketing/events', access, run(async (c) => c.json({ data: await config.listEvents({ companyId: companyId(c), userId: userId(c), ctx: ctx(c) }) })))
  app.post('/ticketing/events', access, run(async (c) => {
    if (!canCreateEvents(ctx(c))) throw new TicketingError('No tienes permiso para crear eventos.', 403, 'FORBIDDEN')
    return c.json({ data: await config.createEvent({ companyId: companyId(c), actorId: userId(c), input: await parse(c, ticketEventCreateSchema) }) }, 201)
  }))
  app.get('/ticketing/events/:eventId', access, run(async (c) => {
    const { event, role: r } = await role(c, c.req.param('eventId'), 'viewer')
    const [sessions, types] = await Promise.all([config.listSessions({ companyId: companyId(c), eventId: event.id }), config.listTypes({ companyId: companyId(c), eventId: event.id })])
    return c.json({ data: { ...serializeEvent(event), role: r, sessions, types } })
  }))
  app.patch('/ticketing/events/:eventId', access, run(async (c) => {
    await role(c, c.req.param('eventId'), 'admin')
    return c.json({ data: await config.updateEvent({ companyId: companyId(c), actorId: userId(c), eventId: c.req.param('eventId'), input: await parse(c, ticketEventUpdateSchema) }) })
  }))

  // Functions, types, quotas
  app.post('/ticketing/events/:eventId/sessions', access, run(async (c) => {
    const { event } = await role(c, c.req.param('eventId'), 'admin')
    return c.json({ data: await config.createSession({ companyId: companyId(c), actorId: userId(c), event, input: await parse(c, ticketSessionCreateSchema) }) }, 201)
  }))
  app.post('/ticketing/events/:eventId/types', access, run(async (c) => {
    const { event } = await role(c, c.req.param('eventId'), 'admin')
    return c.json({ data: await config.createType({ companyId: companyId(c), actorId: userId(c), event, input: await parse(c, ticketTypeCreateSchema) }) }, 201)
  }))
  app.patch('/ticketing/types/:typeId', access, run(async (c) => {
    await role(c, await eventOf(c, 'type', c.req.param('typeId')), 'admin')
    return c.json({ data: await config.updateType({ companyId: companyId(c), actorId: userId(c), typeId: c.req.param('typeId'), input: await parse(c, ticketTypeUpdateSchema) }) })
  }))
  app.put('/ticketing/types/:typeId/quotas/:sessionId', access, run(async (c) => {
    await role(c, await eventOf(c, 'type', c.req.param('typeId')), 'admin')
    const { quota } = await parse(c, ticketQuotaSchema)
    return c.json({ data: await config.setQuota({ companyId: companyId(c), actorId: userId(c), typeId: c.req.param('typeId'), sessionId: c.req.param('sessionId'), quota }) })
  }))

  // Event team
  app.get('/ticketing/events/:eventId/members', access, run(async (c) => {
    const { event } = await role(c, c.req.param('eventId'), 'viewer')
    return c.json({ data: await config.listMembers({ companyId: companyId(c), event }) })
  }))
  app.put('/ticketing/events/:eventId/members/:userId', access, run(async (c) => {
    const { event } = await role(c, c.req.param('eventId'), 'admin')
    const { role: memberRole } = await parse(c, ticketMemberSchema)
    return c.json({ data: await config.setMember({ companyId: companyId(c), actorId: userId(c), event, userId: c.req.param('userId'), role: memberRole }) })
  }))
  app.delete('/ticketing/events/:eventId/members/:userId', access, run(async (c) => {
    const { event } = await role(c, c.req.param('eventId'), 'admin')
    return c.json({ data: await config.removeMember({ companyId: companyId(c), actorId: userId(c), event, userId: c.req.param('userId') }) })
  }))

  // An event agent, or a cashier of this company (order resolved inside the company).
  async function agentOrCashier(c, orderId) {
    const eventId = await eventOf(c, 'order', orderId)
    const grants = ctx(c)?.permissionSet
    if (grants?.has?.('pos.caja.operate') && !grants?.has?.('ticketing.access')) return
    try { await role(c, eventId, 'agent') } catch (error) { if (!(error?.status === 403 && grants?.has?.('pos.caja.operate'))) throw error }
  }

  // Orders and tickets
  app.get('/ticketing/events/:eventId/orders', access, run(async (c) => {
    await role(c, c.req.param('eventId'), 'viewer')
    const sessionId = c.req.query('sessionId') || null
    if (sessionId && !uuid.test(sessionId)) throw notFound('Función')
    const status = ['PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(c.req.query('status')) ? c.req.query('status') : null
    return c.json({ data: await cmd.listOrders({ companyId: companyId(c), eventId: c.req.param('eventId'), sessionId, status, q: (c.req.query('q') || '').slice(0, 100) || null }) })
  }))
  app.post('/ticketing/orders', access, run(async (c) => {
    const input = await parse(c, ticketOrderCreateSchema)
    await role(c, await eventOf(c, 'session', input.sessionId), 'agent')
    const result = await cmd.reserve({ companyId: companyId(c), actorId: userId(c), input, idempotencyKey: key(c) })
    return c.json({ data: result.order, credentials: result.credentials, replayed: result.replayed }, result.replayed ? 200 : 201)
  }))
  app.get('/ticketing/orders/:orderId', access, run(async (c) => {
    await role(c, await eventOf(c, 'order', c.req.param('orderId')), 'viewer')
    return c.json({ data: await cmd.getOrder({ companyId: companyId(c), orderId: c.req.param('orderId') }) })
  }))
  app.get('/ticketing/orders/:orderId/history', access, run(async (c) => {
    await role(c, await eventOf(c, 'order', c.req.param('orderId')), 'viewer')
    return c.json({ data: await cmd.orderHistory({ companyId: companyId(c), orderId: c.req.param('orderId') }) })
  }))
  app.get('/ticketing/orders/:orderId/sale', accessOrCashier, run(async (c) => {
    await agentOrCashier(c, c.req.param('orderId'))
    return c.json({ data: await pay.saleView({ companyId: companyId(c), orderId: c.req.param('orderId') }) })
  }))
  app.get('/ticketing/orders/:orderId/payment-candidates', access, run(async (c) => {
    await role(c, await eventOf(c, 'order', c.req.param('orderId')), 'agent')
    return c.json({ data: await pay.paymentCandidates({ companyId: companyId(c), orderId: c.req.param('orderId') }) })
  }))
  app.post('/ticketing/orders/:orderId/confirm-payment', accessOrCashier, run(async (c) => {
    await agentOrCashier(c, c.req.param('orderId'))
    const { posOrderId } = await parse(c, ticketConfirmPaymentSchema)
    const result = await pay.confirmPayment({ companyId: companyId(c), actorId: userId(c), orderId: c.req.param('orderId'), posOrderId, idempotencyKey: key(c) })
    return c.json({ data: result.order, credentials: result.credentials, replayed: result.replayed })
  }))
  app.post('/ticketing/orders/:orderId/cancel', access, run(async (c) => {
    await role(c, await eventOf(c, 'order', c.req.param('orderId')), 'agent')
    const { reason, ticketIds } = await parse(c, ticketCancelSchema)
    const result = await cmd.cancel({ companyId: companyId(c), actorId: userId(c), orderId: c.req.param('orderId'), ticketIds: ticketIds ?? null, reason: reason ?? null, idempotencyKey: key(c) })
    return c.json({ data: result.order, replayed: result.replayed })
  }))
  app.post('/ticketing/tickets/:ticketId/reissue', access, run(async (c) => {
    await role(c, await eventOf(c, 'ticket', c.req.param('ticketId')), 'agent')
    const result = await cmd.reissue({ companyId: companyId(c), actorId: userId(c), ticketId: c.req.param('ticketId'), idempotencyKey: key(c) })
    return c.json({ data: result.ticket, credential: result.credential, replayed: result.replayed })
  }))
  app.post('/ticketing/tickets/:ticketId/transfer', access, run(async (c) => {
    await role(c, await eventOf(c, 'ticket', c.req.param('ticketId')), 'agent')
    const result = await cmd.transfer({ companyId: companyId(c), actorId: userId(c), ticketId: c.req.param('ticketId'), input: await parse(c, ticketTransferSchema), idempotencyKey: key(c) })
    return c.json({ data: result.ticket, credential: result.credential, replayed: result.replayed })
  }))

  // Check-in (F6D): ticketing.checkin plus a place on the event's team (any role).
  app.get('/ticketing/checkin/sessions', checkinAccess, run(async (c) => c.json({ data: await gate.checkinSessions({ companyId: companyId(c), userId: userId(c), all: isTicketingAdmin(ctx(c)) }) })))
  app.get('/ticketing/checkin/sessions/:sessionId', checkinAccess, run(async (c) => {
    await role(c, await eventOf(c, 'session', c.req.param('sessionId')), 'viewer')
    return c.json({ data: await gate.sessionBoard({ companyId: companyId(c), sessionId: c.req.param('sessionId') }) })
  }))
  app.post('/ticketing/checkin/sessions/:sessionId/scan', checkinAccess, run(async (c) => {
    await role(c, await eventOf(c, 'session', c.req.param('sessionId')), 'viewer')
    const input = await parse(c, ticketScanSchema)
    const checks = [scanBucket.consume(`op:${companyId(c)}:${userId(c)}`), ...(input.deviceId ? [scanBucket.consume(`dev:${companyId(c)}:${input.deviceId}`)] : [])]
    const limited = (await Promise.all(checks)).find((r) => !r.allowed)
    if (limited) {
      c.header('Retry-After', String(limited.retryAfter))
      throw new TicketingError('Demasiadas lecturas seguidas. Espera un momento.', 429, 'RATE_LIMITED')
    }
    return c.json({ data: await gate.scan({ companyId: companyId(c), operatorId: userId(c), sessionId: c.req.param('sessionId'), text: input.text ?? null, code: input.code ?? null, deviceId: input.deviceId ?? null, admit: input.admit }) })
  }))

  return app
}
