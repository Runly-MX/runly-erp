// runly.ticketing writes. Each command is one transaction: idempotency claim, per-type
// quota (conditional UPDATE), seats through the Booking Engine (createTx/transitionTx),
// the order and its tickets, history and the outbox event commit or roll back together.
// Credentials: the QR text is returned once, when it is created; only its hash is kept.
import { DOMAIN_EVENTS } from '../../services/domain-events/events.js'
import { pgCode, requestHash } from '../bookings/bookings-command-service.js'
import {
  ENGINE_CHANNEL, SOURCE_MODULE, TicketingError, credentialMatches, newSecret, notFound, orderEvent, parseCredential, policyOf,
  qrText, serializeOrder, serializeTicket, ticketEvent,
} from './ticketing-core.js'

const M = 60000

export function createTicketingCommandService({ prisma, engine, now = () => Date.now() }) {
  async function inTx(fn) {
    try {
      return await prisma.$transaction(fn, { maxWait: 60000, timeout: 60000 })
    } catch (error) {
      if (error?.status && error?.code) throw error
      const code = pgCode(error)
      if (code === '40P01' || code === '40001') throw new TicketingError('Otra operación cambió estos datos al mismo tiempo; inténtalo de nuevo.', 409, 'CONFLICT_RETRY')
      throw error
    }
  }

  // Claimed inside the operation's transaction: a rolled-back attempt leaves no record;
  // a concurrent duplicate waits on the unique index, then replays.
  async function claim(tx, { companyId, scope, operation, key, hash }) {
    if (!key) return null
    if (typeof key !== 'string' || key.length > 200) throw new TicketingError('La clave de idempotencia no es válida.', 400, 'IDEMPOTENCY_KEY_INVALID')
    const rows = await tx.$queryRaw`
      INSERT INTO ticket_idempotency (company_id, scope, operation, key, request_hash)
      VALUES (${companyId}::uuid, ${scope}, ${operation}, ${key}, ${hash})
      ON CONFLICT (company_id, scope, operation, key) DO NOTHING RETURNING id`
    if (rows[0]) return { id: rows[0].id }
    const prior = (await tx.$queryRaw`
      SELECT request_hash, result_id FROM ticket_idempotency
       WHERE company_id = ${companyId}::uuid AND scope = ${scope} AND operation = ${operation} AND key = ${key}`)[0]
    if (!prior || prior.request_hash !== hash) throw new TicketingError('Esta clave de idempotencia ya se usó con otra solicitud.', 422, 'IDEMPOTENCY_KEY_REUSED')
    return { replay: prior.result_id }
  }
  const settle = (tx, claimed, id) => (claimed?.id ? tx.$executeRaw`UPDATE ticket_idempotency SET result_id = ${id}::uuid WHERE id = ${claimed.id}::uuid` : null)

  const history = (tx, { companyId, entity, entityId, action, actorId, actorKind = 'user', before = null, after = null }) => tx.$executeRaw`
    INSERT INTO ticket_history (company_id, entity, entity_id, action, actor_id, actor_kind, before, after)
    VALUES (${companyId}::uuid, ${entity}, ${entityId}::uuid, ${action}, ${actorId}::uuid, ${actorKind},
            ${before ? JSON.stringify(before) : null}::jsonb, ${after ? JSON.stringify(after) : null}::jsonb)`

  // Same transaction and allowed to throw (a swallowed failure would turn the commit into a rollback).
  async function emit(tx, companyId, event, payload) {
    if (!DOMAIN_EVENTS[event]) throw new Error(`Evento de dominio desconocido: ${event}`)
    await tx.domainEventOutbox.create({ data: { companyId, event, payload } })
  }

  const ticketsOf = (tx, orderId) => tx.$queryRaw`SELECT * FROM ticket WHERE order_id = ${orderId}::uuid ORDER BY created_at, id`
  async function orderView(tx, companyId, orderId) {
    const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid`)[0]
    if (!order) throw notFound('Orden')
    return serializeOrder(order, await ticketsOf(tx, order.id))
  }

  // ---- Reserve / issue -----------------------------------------------------------------
  // input: ticketOrderCreateSchema. Free tickets are ISSUED with a credential at once;
  // paid ones are held (PENDING_PAYMENT) until Caja confirms (F6C) or the hold expires.
  // beforeCommit(tx, order): an integration's own write in this same transaction.
  async function reserve({ companyId, actorId, input, idempotencyKey = null, actorKind = 'user', beforeCommit = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'reserve', key: idempotencyKey, hash: requestHash('reserve', input) })
      if (claimed?.replay) return { order: await orderView(tx, companyId, claimed.replay), credentials: [], replayed: true }
      const session = (await tx.$queryRaw`
        SELECT s.*, e.space_id, e.service_id, e.enabled AS event_enabled, e.sales_open, e.policy, e.policy_version, e.id AS event_id
          FROM ticket_session s JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
         WHERE s.id = ${input.sessionId}::uuid AND s.company_id = ${companyId}::uuid`)[0]
      if (!session) throw notFound('Función')
      if (!session.event_enabled || session.status !== 'scheduled') throw new TicketingError('Esta función ya no vende boletos.', 409, 'SESSION_UNAVAILABLE')
      if (input.channel !== 'box_office' && !session.sales_open) throw new TicketingError('La venta de este evento no está abierta.', 409, 'SALES_CLOSED')
      const policy = policyOf(session)
      if (input.buyer?.contactId && !(await tx.$queryRaw`SELECT 1 FROM contact WHERE id = ${input.buyer.contactId}::uuid AND company_id = ${companyId}::uuid`)[0]) throw notFound('Contacto')

      // Items merged per type and sorted: every buyer locks quota rows in the same order.
      const wanted = new Map()
      for (const item of input.items) wanted.set(item.typeId, (wanted.get(item.typeId) ?? 0) + item.quantity)
      const typeIds = [...wanted.keys()].sort()
      const types = await tx.$queryRaw`SELECT * FROM ticket_type WHERE id = ANY(${typeIds}::uuid[]) AND company_id = ${companyId}::uuid AND event_id = ${session.event_id}::uuid`
      const total = [...wanted.values()].reduce((a, b) => a + b, 0)
      if (total > policy.maxPerOrder) throw new TicketingError(`Máximo ${policy.maxPerOrder} boletos por orden.`, 422, 'ORDER_LIMIT')
      const at = now()
      for (const typeId of typeIds) {
        const type = types.find((t) => t.id === typeId)
        if (!type || !type.enabled) throw notFound('Tipo de boleto')
        if (type.visibility !== 'public' && ['portal', 'website'].includes(input.channel)) throw notFound('Tipo de boleto')
        if ((type.sales_start && at < new Date(type.sales_start).getTime()) || (type.sales_end && at >= new Date(type.sales_end).getTime())) {
          throw new TicketingError(`«${type.name}» no está a la venta en este momento.`, 409, 'OUTSIDE_SALES_WINDOW')
        }
        if (wanted.get(typeId) > type.per_order_max) throw new TicketingError(`Máximo ${type.per_order_max} boletos «${type.name}» por orden.`, 422, 'TYPE_ORDER_LIMIT')
      }
      const holders = input.holders ?? []
      if (policy.holderNameRequired && (holders.length < total || holders.some((h) => !h?.name?.trim()))) throw new TicketingError('Este evento pide el nombre de cada asistente.', 422, 'HOLDER_REQUIRED')

      for (const typeId of typeIds) {
        const quantity = wanted.get(typeId)
        await tx.$executeRaw`INSERT INTO ticket_quota (company_id, ticket_type_id, session_id) VALUES (${companyId}::uuid, ${typeId}::uuid, ${session.id}::uuid) ON CONFLICT DO NOTHING`
        const taken = await tx.$queryRaw`
          UPDATE ticket_quota SET issued = issued + ${quantity}, updated_at = now()
           WHERE ticket_type_id = ${typeId}::uuid AND session_id = ${session.id}::uuid AND (quota IS NULL OR issued + ${quantity} <= quota)
          RETURNING id`
        if (!taken[0]) throw new TicketingError(`Ya no quedan suficientes boletos «${types.find((t) => t.id === typeId).name}».`, 409, 'SOLD_OUT')
      }

      const paid = types.some((t) => t.price_mode !== 'free')
      const status = paid ? 'PENDING_PAYMENT' : 'CONFIRMED'
      const holdExpiresAt = paid ? new Date(at + policy.holdMinutes * M) : null
      const totals = { items: typeIds.map((typeId) => { const t = types.find((x) => x.id === typeId); return { typeId, quantity: wanted.get(typeId), priceMode: t.price_mode, catalogProductId: t.catalog_product_id } }) }
      let order = (await tx.$queryRaw`
        INSERT INTO ticket_order (company_id, event_id, session_id, status, channel, quantity, contact_id, buyer_name, buyer_email, buyer_phone,
                                  hold_expires_at, totals, policy_version, created_by_id)
        VALUES (${companyId}::uuid, ${session.event_id}::uuid, ${session.id}::uuid, ${status}, ${input.channel}, ${total}, ${input.buyer?.contactId ?? null}::uuid,
                ${input.buyer?.name ?? null}, ${input.buyer?.email ?? null}, ${input.buyer?.phone ?? null}, ${holdExpiresAt}, ${JSON.stringify(totals)}::jsonb,
                ${session.policy_version}, ${actorId}::uuid)
        RETURNING *`)[0]

      // Seats of the room: one engine booking for the whole order, without personal data.
      const { booking } = await engine.createTx(tx, {
        companyId, actorId, spaceId: session.space_id, channel: ENGINE_CHANNEL[input.channel], skipLimits: false,
        input: { serviceId: session.service_id, sessionId: session.booking_session_id, partySize: total },
        source: { module: SOURCE_MODULE, id: order.id },
      })
      order = (await tx.$queryRaw`UPDATE ticket_order SET booking_id = ${booking.id}::uuid WHERE id = ${order.id}::uuid RETURNING *`)[0]

      const credentials = []
      let index = 0
      for (const typeId of typeIds) {
        const type = types.find((t) => t.id === typeId)
        for (let i = 0; i < wanted.get(typeId); i++, index++) {
          const holder = holders[index] ?? {}
          const issue = type.price_mode === 'free' ? newSecret() : null
          const ticket = (await tx.$queryRaw`
            INSERT INTO ticket (company_id, order_id, session_id, type_id, status, holder_name, holder_email, credential_version, credential_hash, issued_at)
            VALUES (${companyId}::uuid, ${order.id}::uuid, ${session.id}::uuid, ${typeId}::uuid, ${issue ? 'ISSUED' : 'PENDING_PAYMENT'},
                    ${holder.name?.trim() || input.buyer?.name || null}, ${holder.email ?? null}, ${issue ? 1 : 0}, ${issue?.hash ?? null}, ${issue ? new Date(at) : null})
            RETURNING id, code`)[0]
          if (issue) credentials.push({ ticketId: ticket.id, code: ticket.code, credentialVersion: 1, qr: qrText(ticket.id, issue.secret) })
        }
      }
      await settle(tx, claimed, order.id)
      const tickets = await ticketsOf(tx, order.id)
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: 'create', actorId, actorKind, after: { ...serializeOrder(order), tickets: tickets.map((t) => ({ id: t.id, code: t.code, typeId: t.type_id, status: t.status })) } })
      await emit(tx, companyId, 'ticketing.order.created', orderEvent(order))
      if (beforeCommit) await beforeCommit(tx, order)
      return { order: serializeOrder(order, tickets), credentials, replayed: false }
    })
  }

  // Frees what an order holds: per-type quota (by its tickets) and the engine seats.
  async function release(tx, { companyId, actorId, order, ticketStatus, actorKind }) {
    const counts = await tx.$queryRaw`SELECT type_id, count(*)::int AS n FROM ticket WHERE order_id = ${order.id}::uuid AND status IN ('ISSUED', 'PENDING_PAYMENT') GROUP BY type_id ORDER BY type_id`
    for (const { type_id: typeId, n } of counts) {
      await tx.$executeRaw`UPDATE ticket_quota SET issued = issued - ${n}, updated_at = now() WHERE ticket_type_id = ${typeId}::uuid AND session_id = ${order.session_id}::uuid`
    }
    await tx.$executeRaw`
      UPDATE ticket SET status = ${ticketStatus}, credential_hash = NULL, cancelled_at = now(), version = version + 1, updated_at = now()
       WHERE order_id = ${order.id}::uuid AND status IN ('ISSUED', 'PENDING_PAYMENT')`
    if (order.booking_id) {
      const booking = (await tx.$queryRaw`SELECT status FROM booking WHERE id = ${order.booking_id}::uuid`)[0]
      if (booking && ['PENDING', 'CONFIRMED'].includes(booking.status)) {
        await engine.transitionTx(tx, { companyId, actorId, bookingId: order.booking_id, to: 'CANCELLED', actorKind, input: { reason: `ticketing:${ticketStatus.toLowerCase()}` } })
      }
    }
  }

  // Cancels a whole order. Paid orders need the Commerce refund first (F6C).
  async function cancel({ companyId, actorId, orderId, reason = null, idempotencyKey = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'cancel', key: idempotencyKey, hash: requestHash('cancel', { orderId, reason }) })
      if (claimed?.replay) return { order: await orderView(tx, companyId, claimed.replay), replayed: true }
      const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!order) throw notFound('Orden')
      if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(order.status)) throw new TicketingError('Esta orden ya no se puede cancelar.', 409, 'INVALID_TRANSITION')
      if (order.status === 'CONFIRMED' && (order.totals?.items ?? []).some((i) => i.priceMode !== 'free')) throw new TicketingError('Una orden pagada se cancela con su reembolso en Caja.', 409, 'REFUND_REQUIRED')
      const used = (await tx.$queryRaw`SELECT 1 FROM ticket WHERE order_id = ${order.id}::uuid AND status = 'USED' LIMIT 1`)[0]
      if (used) throw new TicketingError('La orden tiene boletos que ya entraron al evento.', 409, 'TICKET_USED')
      await release(tx, { companyId, actorId, order, ticketStatus: 'CANCELLED', actorKind: 'user' })
      const updated = (await tx.$queryRaw`UPDATE ticket_order SET status = 'CANCELLED', hold_expires_at = NULL, version = version + 1, updated_at = now() WHERE id = ${order.id}::uuid RETURNING *`)[0]
      await settle(tx, claimed, order.id)
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: 'cancel', actorId, before: { status: order.status }, after: { status: 'CANCELLED', reason } })
      await emit(tx, companyId, 'ticketing.order.cancelled', orderEvent(updated))
      return { order: serializeOrder(updated, await ticketsOf(tx, order.id)), replayed: false }
    })
  }

  // Unpaid holds past hold_expires_at. SKIP LOCKED: a sweep never waits on, or
  // races, a confirmation or cancellation holding the same order.
  async function expireHolds({ companyId = null, limit = 100 } = {}) {
    return inTx(async (tx) => {
      const due = await tx.$queryRaw`
        SELECT * FROM ticket_order WHERE status = 'PENDING_PAYMENT' AND hold_expires_at < ${new Date(now())}
           AND (${companyId}::uuid IS NULL OR company_id = ${companyId}::uuid)
         ORDER BY hold_expires_at LIMIT ${limit} FOR UPDATE SKIP LOCKED`
      for (const order of due) {
        await release(tx, { companyId: order.company_id, actorId: null, order, ticketStatus: 'EXPIRED', actorKind: 'system' })
        const updated = (await tx.$queryRaw`UPDATE ticket_order SET status = 'EXPIRED', hold_expires_at = NULL, version = version + 1, updated_at = now() WHERE id = ${order.id}::uuid RETURNING *`)[0]
        await history(tx, { companyId: order.company_id, entity: 'order', entityId: order.id, action: 'expire', actorId: null, actorKind: 'system', before: { status: order.status }, after: { status: 'EXPIRED' } })
        await emit(tx, order.company_id, 'ticketing.order.expired', orderEvent(updated))
      }
      return { expired: due.length }
    })
  }

  // ---- Credential changes ---------------------------------------------------------------
  async function lockIssued(tx, companyId, ticketId) {
    const ticket = (await tx.$queryRaw`
      SELECT t.*, o.event_id, b.starts_at, e.policy FROM ticket t
        JOIN ticket_order o ON o.id = t.order_id AND o.company_id = t.company_id
        JOIN ticket_event e ON e.id = o.event_id AND e.company_id = t.company_id
        JOIN ticket_session s ON s.id = t.session_id AND s.company_id = t.company_id
        JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = t.company_id
       WHERE t.id = ${ticketId}::uuid AND t.company_id = ${companyId}::uuid FOR UPDATE OF t`)[0]
    if (!ticket) throw notFound('Boleto')
    if (ticket.status !== 'ISSUED') throw new TicketingError(ticket.status === 'USED' ? 'El boleto ya se usó para entrar.' : 'El boleto no está vigente.', 409, 'TICKET_NOT_ISSUED')
    return ticket
  }

  // New secret, credential_version + 1: every earlier QR of this ticket stops matching.
  async function rotate(tx, { companyId, actorId, ticket, action, holder = null, idempotency }) {
    const issue = newSecret()
    const updated = (await tx.$queryRaw`
      UPDATE ticket SET credential_hash = ${issue.hash}, credential_version = credential_version + 1, version = version + 1, updated_at = now(),
             holder_name = ${holder ? holder.name : ticket.holder_name}, holder_email = ${holder ? holder.email ?? null : ticket.holder_email}
       WHERE id = ${ticket.id}::uuid RETURNING *`)[0]
    await settle(tx, idempotency, updated.id)
    await history(tx, {
      companyId, entity: 'ticket', entityId: ticket.id, action, actorId,
      before: { credentialVersion: ticket.credential_version, ...(holder ? { holderName: ticket.holder_name, holderEmail: ticket.holder_email } : {}) },
      after: { credentialVersion: updated.credential_version, ...(holder ? { holderName: updated.holder_name, holderEmail: updated.holder_email } : {}) },
    })
    await emit(tx, companyId, `ticketing.ticket.${action === 'reissue' ? 'reissued' : 'transferred'}`, ticketEvent(updated, ticket.event_id))
    return { ticket: serializeTicket(updated), credential: { ticketId: updated.id, code: updated.code, credentialVersion: updated.credential_version, qr: qrText(updated.id, issue.secret) }, replayed: false }
  }

  async function replayTicket(tx, companyId, ticketId) {
    const row = (await tx.$queryRaw`SELECT * FROM ticket WHERE id = ${ticketId}::uuid AND company_id = ${companyId}::uuid`)[0]
    return { ticket: serializeTicket(row), credential: null, replayed: true }
  }

  async function reissue({ companyId, actorId, ticketId, idempotencyKey = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'reissue', key: idempotencyKey, hash: requestHash('reissue', { ticketId }) })
      if (claimed?.replay) return replayTicket(tx, companyId, claimed.replay)
      const ticket = await lockIssued(tx, companyId, ticketId)
      return rotate(tx, { companyId, actorId, ticket, action: 'reissue', idempotency: claimed })
    })
  }

  async function transfer({ companyId, actorId, ticketId, input, idempotencyKey = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'transfer', key: idempotencyKey, hash: requestHash('transfer', { ticketId, ...input }) })
      if (claimed?.replay) return replayTicket(tx, companyId, claimed.replay)
      const ticket = await lockIssued(tx, companyId, ticketId)
      const policy = policyOf(ticket)
      if (!policy.transferAllowed) throw new TicketingError('Este evento no permite transferir boletos.', 409, 'TRANSFER_NOT_ALLOWED')
      if (now() >= new Date(ticket.starts_at).getTime() - (policy.transferCutoffMinutes ?? 0) * M) throw new TicketingError('Ya no es posible transferir boletos de esta función.', 409, 'TRANSFER_CLOSED')
      return rotate(tx, { companyId, actorId, ticket, action: 'transfer', holder: { name: input.holderName, email: input.holderEmail }, idempotency: claimed })
    })
  }

  // Read-only check of a scanned QR (admission itself is F6D). Unknown, forged and
  // replaced credentials all answer the same "not valid".
  async function verifyCredential({ companyId, text }) {
    const parsed = parseCredential(text)
    const row = parsed ? (await prisma.$queryRaw`SELECT * FROM ticket WHERE id = ${parsed.ticketId}::uuid AND company_id = ${companyId}::uuid`)[0] : null
    const matches = credentialMatches(parsed?.secret ?? 'x', row?.credential_hash ?? null)
    if (!row || !matches) return { valid: false, reason: 'unknown' }
    if (row.status === 'ISSUED') return { valid: true, reason: 'ok', ticket: serializeTicket(row) }
    return { valid: false, reason: row.status === 'USED' ? 'already_used' : 'cancelled', ticket: serializeTicket(row) }
  }

  const getOrder = ({ companyId, orderId }) => orderView(prisma, companyId, orderId)
  async function listOrders({ companyId, eventId, sessionId = null }) {
    const rows = await prisma.$queryRaw`
      SELECT * FROM ticket_order WHERE company_id = ${companyId}::uuid AND event_id = ${eventId}::uuid AND (${sessionId}::uuid IS NULL OR session_id = ${sessionId}::uuid)
       ORDER BY created_at DESC LIMIT 500`
    return rows.map((o) => serializeOrder(o))
  }

  return { reserve, cancel, expireHolds, reissue, transfer, verifyCredential, getOrder, listOrders }
}
