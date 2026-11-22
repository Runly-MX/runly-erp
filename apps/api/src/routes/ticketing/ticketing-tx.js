// Transaction pieces shared by the ticketing write services: the transaction wrapper,
// idempotency claim, append-only history, outbox and the order view.
import { DOMAIN_EVENTS } from '../../services/domain-events/events.js'
import { pgCode } from '../bookings/bookings-command-service.js'
import { TicketingError, notFound, serializeOrder } from './ticketing-core.js'

export function createTicketingTx({ prisma }) {
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

  // F6E delivery: ticket emails enqueued in the issuing transaction (sent later by the
  // worker, never inside it). The buyer gets the order's tickets; a holder with another
  // address gets only their own. `stamp` separates deliveries of the same tickets
  // (credential version for reissue/transfer, a request id for a resend).
  async function enqueueDelivery(tx, { companyId, order, tickets, kind, stamp = '' }) {
    const live = tickets.filter((t) => t.status === 'ISSUED')
    if (!live.length) return 0
    const byRecipient = new Map()
    const add = (email, ids) => {
      const to = String(email ?? '').trim().toLowerCase()
      if (!to) return
      byRecipient.set(to, [...new Set([...(byRecipient.get(to) ?? []), ...ids])])
    }
    if (kind === 'issued') add(order.buyer_email, live.map((t) => t.id))
    for (const t of live) add(t.holder_email || (kind === 'issued' ? null : order.buyer_email), [t.id])
    let queued = 0
    for (const [recipient, ids] of byRecipient) {
      const sorted = [...ids].sort()
      const dedupe = `${order.id}:${kind}:${sorted.join(',')}:${stamp}:${recipient}`
      const rows = await tx.$queryRaw`
        INSERT INTO ticket_notification (company_id, order_id, ticket_ids, kind, dedupe_key, recipient)
        VALUES (${companyId}::uuid, ${order.id}::uuid, ${sorted}::uuid[], ${kind}, ${dedupe}, ${recipient})
        ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
      queued += rows.length
    }
    return queued
  }

  return { inTx, claim, settle, history, emit, ticketsOf, orderView, enqueueDelivery }
}
