// runly.ticketing configuration: events (each with its own booking space and
// session service), functions (one engine booking_session each), ticket types and
// per-type quotas. Every write is one transaction with its history.
import { pgCode } from '../bookings/bookings-command-service.js'
import { TicketingError, isTicketingAdmin, notFound, serializeEvent } from './ticketing-core.js'

export function createTicketingConfigService({ prisma, engine }) {
  async function inTx(fn) {
    try {
      return await prisma.$transaction(fn, { maxWait: 30000, timeout: 30000 })
    } catch (error) {
      if (error instanceof TicketingError || error?.status) throw error
      const code = pgCode(error)
      if (code === '23505' && /slug/.test(String(error?.message))) throw new TicketingError('Esa dirección ya la usa otro evento.', 409, 'SLUG_TAKEN')
      if (code === '23514' && /ticket_quota_issued_check/.test(String(error?.message))) throw new TicketingError('El cupo no puede ser menor a los boletos ya emitidos.', 409, 'QUOTA_BELOW_ISSUED')
      if (code === '40P01' || code === '40001') throw new TicketingError('Otra operación cambió estos datos al mismo tiempo; inténtalo de nuevo.', 409, 'CONFLICT_RETRY')
      throw error
    }
  }

  const history = (tx, { companyId, entity, entityId, action, actorId, before = null, after = null }) => tx.$executeRaw`
    INSERT INTO ticket_history (company_id, entity, entity_id, action, actor_id, before, after)
    VALUES (${companyId}::uuid, ${entity}, ${entityId}::uuid, ${action}, ${actorId}::uuid,
            ${before ? JSON.stringify(before) : null}::jsonb, ${after ? JSON.stringify(after) : null}::jsonb)`

  // The event's seats live in its own booking space: a session service whose
  // functions are booking_sessions. The creator administers it (event roles).
  async function createEvent({ companyId, actorId, input }) {
    return inTx(async (tx) => {
      const space = (await tx.$queryRaw`
        INSERT INTO booking_space (company_id, name, slug, description, mode, timezone, policy, created_by_id)
        VALUES (${companyId}::uuid, ${input.title}, ${`boletos-${input.slug}`.slice(0, 64).replace(/-+$/, '')}, ${input.description ?? null}, 'internal',
                ${input.timezone}, ${JSON.stringify({ leadMinutes: 0, horizonDays: 730, requiresApproval: false })}::jsonb, ${actorId}::uuid)
        RETURNING id`)[0]
      const service = (await tx.$queryRaw`
        INSERT INTO booking_service (company_id, space_id, name, kind, duration_minutes, capacity, min_party, max_party)
        VALUES (${companyId}::uuid, ${space.id}::uuid, ${input.title}, 'session', ${input.durationMinutes}, 1, 1, 100)
        RETURNING id`)[0]
      if (actorId) {
        await tx.$executeRaw`INSERT INTO booking_space_member (company_id, space_id, user_id, role) VALUES (${companyId}::uuid, ${space.id}::uuid, ${actorId}::uuid, 'admin')`
      }
      const event = (await tx.$queryRaw`
        INSERT INTO ticket_event (company_id, space_id, service_id, title, slug, description, venue, policy, created_by_id)
        VALUES (${companyId}::uuid, ${space.id}::uuid, ${service.id}::uuid, ${input.title}, ${input.slug}, ${input.description ?? null},
                ${input.venue ?? null}, ${JSON.stringify(input.policy ?? {})}::jsonb, ${actorId}::uuid)
        RETURNING *`)[0]
      await history(tx, { companyId, entity: 'event', entityId: event.id, action: 'create', actorId, after: serializeEvent(event) })
      return serializeEvent(event)
    })
  }

  async function updateEvent({ companyId, actorId, eventId, input }) {
    return inTx(async (tx) => {
      const row = (await tx.$queryRaw`SELECT * FROM ticket_event WHERE id = ${eventId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!row) throw notFound('Evento')
      const policy = input.policy ? { ...(row.policy ?? {}), ...input.policy } : row.policy
      const policyChanged = Boolean(input.policy) && JSON.stringify(policy) !== JSON.stringify(row.policy)
      const pick = (key, column) => (input[key] !== undefined ? input[key] : row[column])
      const updated = (await tx.$queryRaw`
        UPDATE ticket_event SET title = ${pick('title', 'title')}, description = ${pick('description', 'description')}, venue = ${pick('venue', 'venue')},
               sales_open = ${pick('salesOpen', 'sales_open')}, enabled = ${pick('enabled', 'enabled')}, policy = ${JSON.stringify(policy)}::jsonb,
               policy_version = policy_version + ${policyChanged ? 1 : 0}, version = version + 1, updated_at = now()
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      await history(tx, { companyId, entity: 'event', entityId: row.id, action: 'update', actorId, before: serializeEvent(row), after: serializeEvent(updated) })
      return serializeEvent(updated)
    })
  }

  // Admins see every event; others only those whose space they belong to.
  async function listEvents({ companyId, userId, ctx }) {
    const all = isTicketingAdmin(ctx)
    const rows = await prisma.$queryRaw`
      SELECT e.* FROM ticket_event e
       WHERE e.company_id = ${companyId}::uuid
         AND (${all} OR EXISTS (SELECT 1 FROM booking_space_member m WHERE m.space_id = e.space_id AND m.company_id = e.company_id AND m.user_id = ${userId}::uuid))
       ORDER BY e.created_at DESC`
    return rows.map(serializeEvent)
  }

  // A function = one engine booking_session in the event's space (its room capacity),
  // plus a quota row (no limit) for every ticket type.
  async function createSession({ companyId, actorId, event, input }) {
    return inTx(async (tx) => {
      const booking = await engine.createSessionTx(tx, { companyId, spaceId: event.space_id, input: { serviceId: event.service_id, startsAt: input.startsAt, capacity: input.capacity } })
      const session = (await tx.$queryRaw`
        INSERT INTO ticket_session (company_id, event_id, booking_session_id, doors_open_at, admit_before_minutes, admit_after_minutes)
        VALUES (${companyId}::uuid, ${event.id}::uuid, ${booking.id}::uuid, ${input.doorsOpenAt ?? null},
                ${input.admitBeforeMinutes ?? 120}, ${input.admitAfterMinutes ?? 60})
        RETURNING *`)[0]
      await tx.$executeRaw`
        INSERT INTO ticket_quota (company_id, ticket_type_id, session_id)
        SELECT ${companyId}::uuid, t.id, ${session.id}::uuid FROM ticket_type t WHERE t.event_id = ${event.id}::uuid AND t.company_id = ${companyId}::uuid
        ON CONFLICT DO NOTHING`
      await history(tx, { companyId, entity: 'session', entityId: session.id, action: 'create', actorId, after: { bookingSessionId: booking.id, startsAt: booking.starts_at, capacity: booking.capacity } })
      return (await listSessions({ companyId, eventId: event.id }, tx)).find((s) => s.id === session.id)
    })
  }

  async function listSessions({ companyId, eventId }, db = prisma) {
    const rows = await db.$queryRaw`
      SELECT s.*, b.starts_at, b.ends_at, b.capacity, b.seats_taken, b.status AS booking_status
        FROM ticket_session s JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
       WHERE s.event_id = ${eventId}::uuid AND s.company_id = ${companyId}::uuid
       ORDER BY b.starts_at`
    return rows.map((s) => ({
      id: s.id, eventId: s.event_id, bookingSessionId: s.booking_session_id, status: s.status, startsAt: s.starts_at, endsAt: s.ends_at,
      capacity: s.capacity, seatsTaken: s.seats_taken, available: Math.max(0, s.capacity - s.seats_taken), doorsOpenAt: s.doors_open_at,
      admitBeforeMinutes: s.admit_before_minutes, admitAfterMinutes: s.admit_after_minutes, version: s.version,
    }))
  }

  // Paid types reference the catalog product Caja charges (same company, checked here
  // and by the composite foreign key).
  async function assertProduct(tx, companyId, input) {
    if (input.priceMode === 'pos') {
      if (!input.catalogProductId) throw new TicketingError('Un boleto con precio necesita el producto que se cobra en Caja.', 422, 'PRODUCT_REQUIRED')
      const product = (await tx.$queryRaw`SELECT currency FROM catalog_product WHERE id = ${input.catalogProductId}::uuid AND company_id = ${companyId}::uuid`)[0]
      if (!product) throw notFound('Producto')
      return product.currency
    }
    if (input.catalogProductId) throw new TicketingError('Un boleto gratuito no lleva producto.', 422, 'PRODUCT_NOT_ALLOWED')
    return null
  }

  async function createType({ companyId, actorId, event, input }) {
    return inTx(async (tx) => {
      const currency = await assertProduct(tx, companyId, input)
      if (input.salesStart && input.salesEnd && input.salesEnd <= input.salesStart) throw new TicketingError('El fin de venta debe ser después del inicio.', 422, 'SALES_WINDOW')
      const type = (await tx.$queryRaw`
        INSERT INTO ticket_type (company_id, event_id, name, description, price_mode, catalog_product_id, currency, per_order_max, sales_start, sales_end, visibility, sort)
        VALUES (${companyId}::uuid, ${event.id}::uuid, ${input.name}, ${input.description ?? null}, ${input.priceMode}, ${input.catalogProductId ?? null}::uuid,
                ${currency}, ${input.perOrderMax}, ${input.salesStart ?? null}, ${input.salesEnd ?? null}, ${input.visibility}, ${input.sort})
        RETURNING *`)[0]
      await tx.$executeRaw`
        INSERT INTO ticket_quota (company_id, ticket_type_id, session_id)
        SELECT ${companyId}::uuid, ${type.id}::uuid, s.id FROM ticket_session s WHERE s.event_id = ${event.id}::uuid AND s.company_id = ${companyId}::uuid
        ON CONFLICT DO NOTHING`
      await history(tx, { companyId, entity: 'type', entityId: type.id, action: 'create', actorId, after: serializeType(type) })
      return serializeType(type)
    })
  }

  async function updateType({ companyId, actorId, typeId, input }) {
    return inTx(async (tx) => {
      const row = (await tx.$queryRaw`SELECT * FROM ticket_type WHERE id = ${typeId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!row) throw notFound('Tipo de boleto')
      const pick = (key, column) => (input[key] !== undefined ? input[key] : row[column])
      const start = pick('salesStart', 'sales_start'), end = pick('salesEnd', 'sales_end')
      if (start && end && new Date(end) <= new Date(start)) throw new TicketingError('El fin de venta debe ser después del inicio.', 422, 'SALES_WINDOW')
      const updated = (await tx.$queryRaw`
        UPDATE ticket_type SET name = ${pick('name', 'name')}, description = ${pick('description', 'description')}, per_order_max = ${pick('perOrderMax', 'per_order_max')},
               sales_start = ${start}, sales_end = ${end}, visibility = ${pick('visibility', 'visibility')}, sort = ${pick('sort', 'sort')},
               enabled = ${pick('enabled', 'enabled')}, updated_at = now()
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      await history(tx, { companyId, entity: 'type', entityId: row.id, action: 'update', actorId, before: serializeType(row), after: serializeType(updated) })
      return serializeType(updated)
    })
  }

  async function listTypes({ companyId, eventId }) {
    const [types, quotas] = await Promise.all([
      prisma.$queryRaw`SELECT * FROM ticket_type WHERE event_id = ${eventId}::uuid AND company_id = ${companyId}::uuid ORDER BY sort, name`,
      prisma.$queryRaw`SELECT q.* FROM ticket_quota q JOIN ticket_type t ON t.id = q.ticket_type_id WHERE t.event_id = ${eventId}::uuid AND q.company_id = ${companyId}::uuid`,
    ])
    return types.map((t) => ({ ...serializeType(t), quotas: quotas.filter((q) => q.ticket_type_id === t.id).map((q) => ({ sessionId: q.session_id, quota: q.quota, issued: q.issued })) }))
  }

  // Setting a limit below what is already issued is refused by the CHECK (409).
  async function setQuota({ companyId, actorId, typeId, sessionId, quota }) {
    return inTx(async (tx) => {
      const pair = (await tx.$queryRaw`
        SELECT t.id FROM ticket_type t JOIN ticket_session s ON s.event_id = t.event_id AND s.company_id = t.company_id
         WHERE t.id = ${typeId}::uuid AND s.id = ${sessionId}::uuid AND t.company_id = ${companyId}::uuid`)[0]
      if (!pair) throw notFound('Tipo de boleto o función')
      const row = (await tx.$queryRaw`
        INSERT INTO ticket_quota (company_id, ticket_type_id, session_id, quota) VALUES (${companyId}::uuid, ${typeId}::uuid, ${sessionId}::uuid, ${quota})
        ON CONFLICT (ticket_type_id, session_id) DO UPDATE SET quota = EXCLUDED.quota, updated_at = now()
        RETURNING *`)[0]
      await history(tx, { companyId, entity: 'quota', entityId: row.id, action: 'set', actorId, after: { typeId, sessionId, quota } })
      return { typeId, sessionId, quota: row.quota, issued: row.issued }
    })
  }

  return { createEvent, updateEvent, listEvents, createSession, listSessions, createType, updateType, listTypes, setQuota }
}

export const serializeType = (t) => t && ({
  id: t.id, eventId: t.event_id, name: t.name, description: t.description, priceMode: t.price_mode, catalogProductId: t.catalog_product_id,
  currency: t.currency, perOrderMax: t.per_order_max, salesStart: t.sales_start, salesEnd: t.sales_end, visibility: t.visibility,
  sort: t.sort, enabled: t.enabled,
})
