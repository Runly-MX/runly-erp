// runly.ticketing writes. Each command is one transaction: idempotency claim, per-type
// quota (conditional UPDATE), seats through the Booking Engine (createTx/transitionTx),
// the order and its tickets, history and the outbox event commit or roll back together.
// Credentials: the QR text is returned once, when it is created; only its hash is kept.
import { requestHash } from '../bookings/bookings-command-service.js'
import { readPosSale } from '../pos/pos-sale-read.js'
import {
  ENGINE_CHANNEL, SOURCE_MODULE, TicketingError, credentialMatches, newSecret, notFound, orderEvent, parseCredential, policyOf,
  qrText, serializeOrder, serializeTicket, ticketEvent,
} from './ticketing-core.js'
import { createTicketingTx } from './ticketing-tx.js'
import { createTicketingVault } from './ticketing-vault.js'
import { canSignLinks, hashToken, orderLinkExpiry, orderToken } from './ticketing-links.js'

const M = 60000

export function createTicketingCommandService({ prisma, engine, now = () => Date.now(), env = process.env, vault = createTicketingVault({ env }) }) {
  const { inTx, claim, settle, history, emit, ticketsOf, orderView, enqueueDelivery } = createTicketingTx({ prisma })

  // ---- Reserve / issue -----------------------------------------------------------------
  // input: ticketOrderCreateSchema. Free tickets are ISSUED with a credential at once;
  // paid ones are held (PENDING_PAYMENT) until Caja confirms (F6C) or the hold expires.
  // beforeCommit(tx, order): an integration's own write in this same transaction.
  // scope: the idempotency scope (a portal passes its own, since it has no user).
  async function reserve({ companyId, actorId, input, idempotencyKey = null, actorKind = 'user', beforeCommit = null, scope = null }) {
    return inTx(async (tx) => {
      const claimed = await claim(tx, { companyId, scope: scope ?? `user:${actorId}`, operation: 'reserve', key: idempotencyKey, hash: requestHash('reserve', input) })
      if (claimed?.replay) return { order: await orderView(tx, companyId, claimed.replay), credentials: [], replayed: true }
      const session = (await tx.$queryRaw`
        SELECT s.*, e.space_id, e.service_id, e.enabled AS event_enabled, e.sales_open, e.policy, e.policy_version, e.id AS event_id, b.ends_at
          FROM ticket_session s JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
          JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
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

      // Paid orders snapshot the catalog price and currency Caja must charge; the
      // confirmation compares the POS sale against this, never against the client.
      const paid = types.some((t) => t.price_mode !== 'free')
      const status = paid ? 'PENDING_PAYMENT' : 'CONFIRMED'
      const holdExpiresAt = paid ? new Date(at + policy.holdMinutes * M) : null
      const products = paid ? await tx.$queryRaw`SELECT id, name, price, currency, enabled FROM catalog_product WHERE company_id = ${companyId}::uuid AND id = ANY(${types.filter((t) => t.catalog_product_id).map((t) => t.catalog_product_id)}::uuid[])` : []
      const items = typeIds.map((typeId) => {
        const t = types.find((x) => x.id === typeId)
        if (t.price_mode === 'free') return { typeId, quantity: wanted.get(typeId), priceMode: 'free', catalogProductId: null, unitPrice: '0.00' }
        const product = products.find((p) => p.id === t.catalog_product_id)
        if (!product?.enabled) throw new TicketingError(`El producto de «${t.name}» ya no está en el catálogo.`, 409, 'PRODUCT_UNAVAILABLE')
        return { typeId, quantity: wanted.get(typeId), priceMode: t.price_mode, catalogProductId: product.id, productName: product.name, unitPrice: Number(product.price).toFixed(2), currency: product.currency }
      })
      const currencies = [...new Set(items.filter((i) => i.currency).map((i) => i.currency))]
      if (currencies.length > 1) throw new TicketingError('Una orden no puede mezclar monedas.', 422, 'MIXED_CURRENCY')
      const amount = items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0).toFixed(2)
      const totals = { items, currency: currencies[0] ?? null, amount }
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
        for (let i = 0; i < wanted.get(typeId); i++, index++) {
          const holder = holders[index] ?? {}
          // In a paid order every ticket waits for the payment, free types included.
          const issue = paid ? null : newSecret()
          const ticket = (await tx.$queryRaw`
            INSERT INTO ticket (company_id, order_id, session_id, type_id, status, holder_name, holder_email, credential_version, credential_hash, issued_at)
            VALUES (${companyId}::uuid, ${order.id}::uuid, ${session.id}::uuid, ${typeId}::uuid, ${issue ? 'ISSUED' : 'PENDING_PAYMENT'},
                    ${holder.name?.trim() || input.buyer?.name || null}, ${holder.email ?? null}, ${issue ? 1 : 0}, ${issue?.hash ?? null}, ${issue ? new Date(at) : null})
            RETURNING id, code`)[0]
          if (issue) {
            credentials.push({ ticketId: ticket.id, code: ticket.code, credentialVersion: 1, qr: qrText(ticket.id, issue.secret) })
            await vault.store(tx, { companyId, ticketId: ticket.id, version: 1, secret: issue.secret })
          }
        }
      }
      // The buyer's personal link (hash only) whenever there is an address to send it to.
      let manageToken = null
      if (order.buyer_email && canSignLinks(env)) {
        manageToken = orderToken(order.id, 1, env)
        order = (await tx.$queryRaw`
          UPDATE ticket_order SET manage_token_version = 1, manage_token_hash = ${hashToken(manageToken)}, manage_token_expires_at = ${orderLinkExpiry(session.ends_at)}
           WHERE id = ${order.id}::uuid RETURNING *`)[0]
      }
      await settle(tx, claimed, order.id)
      const tickets = await ticketsOf(tx, order.id)
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: 'create', actorId, actorKind, after: { ...serializeOrder(order), tickets: tickets.map((t) => ({ id: t.id, code: t.code, typeId: t.type_id, status: t.status })) } })
      await emit(tx, companyId, 'ticketing.order.created', orderEvent(order))
      await enqueueDelivery(tx, { companyId, order, tickets, kind: 'issued' })
      if (beforeCommit) await beforeCommit(tx, order)
      return { order: serializeOrder(order, tickets), credentials, manageToken, replayed: false }
    })
  }

  // Frees what the given tickets hold: their per-type quota and their seats in the
  // engine. Seats of the order's other tickets stay taken (engine reducePartyTx); the
  // engine booking is cancelled only when no active ticket remains.
  async function release(tx, { companyId, actorId, order, ticketIds = null, ticketStatus, actorKind, refundIds = {} }) {
    const active = await tx.$queryRaw`SELECT id, type_id FROM ticket WHERE order_id = ${order.id}::uuid AND status IN ('ISSUED', 'PENDING_PAYMENT') ORDER BY id FOR UPDATE`
    const target = ticketIds ? active.filter((t) => ticketIds.includes(t.id)) : active
    const byType = new Map()
    for (const t of target) byType.set(t.type_id, (byType.get(t.type_id) ?? 0) + 1)
    for (const typeId of [...byType.keys()].sort()) {
      await tx.$executeRaw`UPDATE ticket_quota SET issued = issued - ${byType.get(typeId)}, updated_at = now() WHERE ticket_type_id = ${typeId}::uuid AND session_id = ${order.session_id}::uuid`
    }
    for (const t of target) {
      // Kept so a gate can answer "cancelado" for this QR instead of "no válido".
      await tx.$executeRaw`
        INSERT INTO ticket_credential_revoked (company_id, ticket_id, credential_version, credential_hash, reason)
        SELECT company_id, id, credential_version, credential_hash, ${ticketStatus === 'EXPIRED' ? 'expired' : 'cancelled'}
          FROM ticket WHERE id = ${t.id}::uuid AND credential_hash IS NOT NULL
        ON CONFLICT DO NOTHING`
      await tx.$executeRaw`
        UPDATE ticket SET status = ${ticketStatus}, credential_hash = NULL, cancelled_at = now(), pos_refund_id = ${refundIds[t.type_id] ?? null}::uuid,
               version = version + 1, updated_at = now()
         WHERE id = ${t.id}::uuid`
      await vault.forget(tx, t.id)
    }
    const remaining = active.length - target.length
    if (order.booking_id && target.length) {
      const booking = (await tx.$queryRaw`SELECT status FROM booking WHERE id = ${order.booking_id}::uuid`)[0]
      if (booking && ['PENDING', 'CONFIRMED'].includes(booking.status)) {
        if (remaining > 0) await engine.reducePartyTx(tx, { companyId, actorId, bookingId: order.booking_id, by: target.length, actorKind })
        else await engine.transitionTx(tx, { companyId, actorId, bookingId: order.booking_id, to: 'CANCELLED', actorKind, input: { reason: `ticketing:${ticketStatus.toLowerCase()}` } })
      }
    }
    return { released: target, remaining }
  }

  // Paid tickets are voided only against a Commerce refund of their lines: per product,
  // refunded quantity in the linked sale minus tickets already voided against it.
  async function refundsCover(tx, { companyId, order, target }) {
    const items = order.totals?.items ?? []
    const paidTypes = new Map(items.filter((i) => i.priceMode !== 'free').map((i) => [i.typeId, i]))
    const needed = new Map()
    for (const t of target) if (paidTypes.has(t.type_id)) needed.set(t.type_id, (needed.get(t.type_id) ?? 0) + 1)
    if (!needed.size) return {}
    const sale = await readPosSale(tx, { companyId, orderId: order.pos_order_id, lock: true })
    if (!sale) throw new TicketingError('No se encontró la venta de Caja de esta orden.', 409, 'REFUND_REQUIRED')
    const refundIds = {}
    for (const [typeId, count] of needed) {
      const productId = paidTypes.get(typeId).catalogProductId
      const lineIds = new Set(sale.lines.filter((l) => l.productId === productId).map((l) => l.id))
      const refunds = sale.refunds.filter((r) => lineIds.has(r.orderLineId))
      const refunded = refunds.reduce((sum, r) => sum + r.quantity, 0)
      const voided = (await tx.$queryRaw`SELECT count(*)::int AS n FROM ticket WHERE order_id = ${order.id}::uuid AND type_id = ${typeId}::uuid AND pos_refund_id IS NOT NULL`)[0].n
      if (refunded - voided < count) {
        throw new TicketingError(`Primero devuelve en Caja ${count - Math.max(0, refunded - voided)} boleto(s) «${paidTypes.get(typeId).productName ?? 'de pago'}» de la venta #${sale.orderNumber}.`, 409, 'REFUND_REQUIRED')
      }
      refundIds[typeId] = refunds[refunds.length - 1].refundId
    }
    return refundIds
  }

  // Cancels some tickets (ticketIds) or the whole order. Free tickets cancel directly;
  // paid ones need their Commerce refund first. The order ends CANCELLED (or REFUNDED
  // when it was paid) once no active ticket is left.
  async function cancel({ companyId, actorId, orderId, ticketIds = null, reason = null, idempotencyKey = null }) {
    return inTx(async (tx) => {
      const ids = ticketIds?.length ? [...new Set(ticketIds)].sort() : null
      const claimed = await claim(tx, { companyId, scope: `user:${actorId}`, operation: 'cancel', key: idempotencyKey, hash: requestHash('cancel', { orderId, ticketIds: ids, reason }) })
      if (claimed?.replay) return { order: await orderView(tx, companyId, claimed.replay), replayed: true }
      const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!order) throw notFound('Orden')
      if (!['CONFIRMED', 'PENDING_PAYMENT'].includes(order.status)) throw new TicketingError('Esta orden ya no se puede cancelar.', 409, 'INVALID_TRANSITION')
      const tickets = await ticketsOf(tx, order.id)
      const target = ids ? tickets.filter((t) => ids.includes(t.id)) : tickets.filter((t) => ['ISSUED', 'PENDING_PAYMENT', 'USED'].includes(t.status))
      if (ids && target.length !== ids.length) throw notFound('Boleto')
      if (target.some((t) => t.status === 'USED')) throw new TicketingError('Hay boletos que ya entraron al evento.', 409, 'TICKET_USED')
      if (target.some((t) => !['ISSUED', 'PENDING_PAYMENT'].includes(t.status))) throw new TicketingError('Algunos boletos ya estaban cancelados.', 409, 'INVALID_TRANSITION')
      if (!target.length) throw new TicketingError('No hay boletos vigentes para cancelar.', 409, 'INVALID_TRANSITION')
      // An unpaid order is cancelled whole: its price snapshot must keep matching the sale Caja charges.
      if (order.status === 'PENDING_PAYMENT' && target.length < tickets.filter((t) => t.status === 'PENDING_PAYMENT').length) {
        throw new TicketingError('Una orden sin pagar se cancela completa; cóbrala primero para cancelar solo algunos boletos.', 409, 'PARTIAL_UNPAID')
      }
      const refundIds = order.status === 'CONFIRMED' && order.pos_order_id ? await refundsCover(tx, { companyId, order, target }) : {}
      const { remaining } = await release(tx, { companyId, actorId, order, ticketIds: target.map((t) => t.id), ticketStatus: 'CANCELLED', actorKind: 'user', refundIds })
      const ended = remaining === 0
      // A paid order whose last tickets are voided was refunded (paid tickets only void against refunds).
      const final = ended ? (order.pos_order_id ? 'REFUNDED' : 'CANCELLED') : order.status
      const updated = (await tx.$queryRaw`
        UPDATE ticket_order SET status = ${final}, hold_expires_at = CASE WHEN ${ended} THEN NULL ELSE hold_expires_at END, version = version + 1, updated_at = now()
         WHERE id = ${order.id}::uuid RETURNING *`)[0]
      await settle(tx, claimed, order.id)
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: ended ? 'cancel' : 'cancel_tickets', actorId, before: { status: order.status }, after: { status: final, reason, ticketIds: target.map((t) => t.id), refundIds } })
      for (const t of target) await emit(tx, companyId, 'ticketing.ticket.cancelled', ticketEvent({ ...t, credential_version: t.credential_version }, order.event_id))
      if (ended) await emit(tx, companyId, final === 'REFUNDED' ? 'ticketing.order.refunded' : 'ticketing.order.cancelled', orderEvent(updated))
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
    await tx.$executeRaw`
      INSERT INTO ticket_credential_revoked (company_id, ticket_id, credential_version, credential_hash, reason)
      VALUES (${companyId}::uuid, ${ticket.id}::uuid, ${ticket.credential_version}, ${ticket.credential_hash}, ${action === 'reissue' ? 'reissued' : 'transferred'})`
    const updated = (await tx.$queryRaw`
      UPDATE ticket SET credential_hash = ${issue.hash}, credential_version = credential_version + 1, version = version + 1, updated_at = now(),
             holder_name = ${holder ? holder.name : ticket.holder_name}, holder_email = ${holder ? holder.email ?? null : ticket.holder_email}
       WHERE id = ${ticket.id}::uuid RETURNING *`)[0]
    await settle(tx, idempotency, updated.id)
    // The sealed copy follows the credential: the old version's copy is replaced.
    await vault.store(tx, { companyId, ticketId: updated.id, version: updated.credential_version, secret: issue.secret })
    const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${updated.order_id}::uuid`)[0]
    await enqueueDelivery(tx, { companyId, order, tickets: [updated], kind: action === 'reissue' ? 'reissued' : 'transferred', stamp: `v${updated.credential_version}` })
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

  // Resend (F6E): the SAME valid QR again, to the address on file (holder, else buyer);
  // never to an address the caller supplies. Nothing about the credential changes.
  // Tickets issued before F6E (or without a vault key) have no sealed copy: the caller
  // gets REISSUE_REQUIRED and staff decide whether to reissue.
  // stamp groups repeated clicks (one email per stamp); actor is staff or the buyer's link.
  async function resend({ companyId, orderId, ticketIds = null, stamp, actorId = null, actorKind = 'user' }) {
    return inTx(async (tx) => {
      const order = (await tx.$queryRaw`SELECT * FROM ticket_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid`)[0]
      if (!order) throw notFound('Orden')
      const tickets = (await tx.$queryRaw`
        SELECT t.*, (s.ticket_id IS NOT NULL AND s.credential_version = t.credential_version) AS sealed
          FROM ticket t LEFT JOIN ticket_credential_secret s ON s.ticket_id = t.id
         WHERE t.order_id = ${order.id}::uuid AND t.company_id = ${companyId}::uuid ORDER BY t.created_at, t.id`)
      const target = ticketIds?.length ? tickets.filter((t) => ticketIds.includes(t.id)) : tickets.filter((t) => t.status === 'ISSUED')
      if (ticketIds?.length && target.length !== new Set(ticketIds).size) throw notFound('Boleto')
      if (!target.length || target.some((t) => t.status !== 'ISSUED')) throw new TicketingError('Solo se reenvían boletos vigentes.', 409, 'TICKET_NOT_ISSUED')
      if (target.some((t) => !t.sealed)) throw new TicketingError('Este boleto se emitió antes de los envíos por correo; para mandarlo hay que reemitir su QR.', 409, 'REISSUE_REQUIRED')
      if (!target.some((t) => t.holder_email || order.buyer_email)) throw new TicketingError('La orden no tiene un correo al cual reenviar.', 409, 'NO_EMAIL')
      const queued = await enqueueDelivery(tx, { companyId, order, tickets: target, kind: 'resend', stamp })
      await history(tx, { companyId, entity: 'order', entityId: order.id, action: 'resend', actorId, actorKind, after: { ticketIds: target.map((t) => t.id), queued } })
      return { queued, tickets: target.map((t) => t.id) }
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
  // Orders of an event, newest first, with ticket counts; q matches reference, buyer or holder.
  async function listOrders({ companyId, eventId, sessionId = null, status = null, q = null }) {
    const like = q ? `%${q.trim()}%` : null
    const rows = await prisma.$queryRaw`
      SELECT o.*,
             (SELECT count(*)::int FROM ticket t WHERE t.order_id = o.id AND t.status IN ('ISSUED', 'USED')) AS active_tickets,
             (SELECT count(*)::int FROM ticket t WHERE t.order_id = o.id AND t.status IN ('CANCELLED', 'EXPIRED')) AS cancelled_tickets
        FROM ticket_order o
       WHERE o.company_id = ${companyId}::uuid AND o.event_id = ${eventId}::uuid
         AND (${sessionId}::uuid IS NULL OR o.session_id = ${sessionId}::uuid)
         AND (${status}::text IS NULL OR o.status = ${status})
         AND (${like}::text IS NULL OR o.reference ILIKE ${like} OR o.buyer_name ILIKE ${like} OR o.buyer_email ILIKE ${like}
              OR EXISTS (SELECT 1 FROM ticket t WHERE t.order_id = o.id AND (t.holder_name ILIKE ${like} OR t.code ILIKE ${like})))
       ORDER BY o.created_at DESC LIMIT 500`
    return rows.map((o) => ({ ...serializeOrder(o), activeTickets: o.active_tickets, cancelledTickets: o.cancelled_tickets }))
  }

  // Audit trail of an order and its tickets (append-only), newest first.
  async function orderHistory({ companyId, orderId }) {
    const rows = await prisma.$queryRaw`
      SELECT h.*, p.display_name AS actor_name FROM ticket_history h LEFT JOIN user_profile p ON p.id = h.actor_id
       WHERE h.company_id = ${companyId}::uuid AND (h.entity_id = ${orderId}::uuid OR h.entity_id IN (SELECT id FROM ticket WHERE order_id = ${orderId}::uuid))
       ORDER BY h.created_at DESC, h.id DESC LIMIT 200`
    return rows.map((h) => ({ id: h.id, entity: h.entity, entityId: h.entity_id, action: h.action, actorName: h.actor_name, actorKind: h.actor_kind, before: h.before, after: h.after, createdAt: h.created_at }))
  }

  return { reserve, cancel, expireHolds, reissue, transfer, resend, verifyCredential, getOrder, listOrders, orderHistory, vault }
}
