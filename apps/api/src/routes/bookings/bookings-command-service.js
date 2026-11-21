// runly.bookings writes. Every command is one transaction: idempotency claim,
// re-validation, capacity (exclusion constraint / conditional seat UPDATE), the
// booking row, history and the outbox event commit or roll back together.
import crypto from 'node:crypto'
import { DOMAIN_EVENTS } from '../../services/domain-events/events.js'
import { BookingError, TRANSITIONS, eligibleResources, loadResourceWindows, notFound, policyOf, serializeBooking } from './bookings-core.js'
import { bookingWindowLimits } from './bookings-availability-service.js'
import { fitsWindow } from './bookings-slots.js'
import { hashToken, manageExpiry, manageToken } from './bookings-links.js'

const M = 60000

// PENDING (an unexpired hold) and CONFIRMED occupy capacity; every other state frees it.
export const OCCUPYING = new Set(['PENDING', 'CONFIRMED'])
export { TRANSITIONS }
const LABEL = { PENDING: 'Pendiente', CONFIRMED: 'Confirmada', CANCELLED: 'Cancelada', REJECTED: 'Rechazada', COMPLETED: 'Completada', NO_SHOW: 'No presentada', EXPIRED: 'Expirada' }
const EVENT_OF = { CONFIRMED: 'confirmed', CANCELLED: 'cancelled', REJECTED: 'rejected', COMPLETED: 'completed', NO_SHOW: 'no_show', EXPIRED: 'expired' }
// Customer emails per transition (none for completed, no-show or expiry).
const NOTIFY_OF = { CONFIRMED: 'confirmed', CANCELLED: 'cancelled', REJECTED: 'rejected' }

// SQLSTATE through Prisma's driver-adapter error wrappers.
export function pgCode(error) {
  for (let e = error, depth = 0; e && depth < 6; e = e.cause, depth++) {
    const code = e.meta?.driverAdapterError?.cause?.originalCode ?? e.meta?.code ?? e.originalCode ?? e.code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  const match = /SQLSTATE[^0-9A-Z]*([0-9A-Z]{5})|\b(23P01|40P01|40001|23505|23514)\b/.exec(String(error?.message ?? ''))
  return match ? match[1] ?? match[2] : null
}

function stable(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}
export const requestHash = (operation, body) => crypto.createHash('sha256').update(stable({ operation, body })).digest('hex')

const slotTaken = () => new BookingError('Ese horario ya no está disponible.', 409, 'SLOT_TAKEN')

export function createBookingsCommandService({ prisma, now = () => Date.now(), onChanged = null }) {
  async function inTx(fn) {
    try {
      return await prisma.$transaction(fn, { maxWait: 30000, timeout: 30000 })
    } catch (error) {
      if (error instanceof BookingError) throw error
      const code = pgCode(error)
      if (code === '23P01') throw slotTaken()
      if (code === '40P01' || code === '40001') throw new BookingError('Otra operación cambió estos datos al mismo tiempo; inténtalo de nuevo.', 409, 'CONFLICT_RETRY')
      throw error
    }
  }

  // Claimed inside the operation's transaction: a rolled-back attempt leaves no
  // record (safe to retry); a concurrent duplicate waits on the unique index.
  async function claim(tx, { companyId, scope, operation, key, hash }) {
    if (!key) return null
    if (typeof key !== 'string' || key.length > 200) throw new BookingError('La clave de idempotencia no es válida.', 400, 'IDEMPOTENCY_KEY_INVALID')
    const rows = await tx.$queryRaw`
      INSERT INTO booking_idempotency (company_id, scope, operation, key, request_hash)
      VALUES (${companyId}::uuid, ${scope}, ${operation}, ${key}, ${hash})
      ON CONFLICT (company_id, scope, operation, key) DO NOTHING RETURNING id`
    if (rows[0]) return { id: rows[0].id }
    const prior = (await tx.$queryRaw`
      SELECT request_hash, booking_id FROM booking_idempotency
       WHERE company_id = ${companyId}::uuid AND scope = ${scope} AND operation = ${operation} AND key = ${key}`)[0]
    if (!prior || prior.request_hash !== hash) throw new BookingError('Esta clave de idempotencia ya se usó con otra solicitud.', 422, 'IDEMPOTENCY_KEY_REUSED')
    return { replay: prior.booking_id }
  }

  const settle = (tx, claimed, bookingId) => claimed?.id
    ? tx.$executeRaw`UPDATE booking_idempotency SET booking_id = ${bookingId}::uuid WHERE id = ${claimed.id}::uuid`
    : null

  async function activeResources(tx, bookingId) {
    const rows = await tx.$queryRaw`SELECT resource_id FROM booking_allocation WHERE booking_id = ${bookingId}::uuid AND active ORDER BY resource_id`
    return rows.map((r) => r.resource_id)
  }

  async function view(tx, companyId, bookingId) {
    const row = (await tx.$queryRaw`SELECT * FROM booking WHERE id = ${bookingId}::uuid AND company_id = ${companyId}::uuid`)[0]
    if (!row) throw notFound('Reservación')
    return serializeBooking(row, await activeResources(tx, bookingId))
  }

  async function lockBooking(tx, companyId, bookingId) {
    const row = (await tx.$queryRaw`SELECT * FROM booking WHERE id = ${bookingId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
    if (!row) throw notFound('Reservación')
    return row
  }

  async function history(tx, { companyId, row, actorId, actorKind = 'user', action, from = null, to = null, before = null, after = null }) {
    await tx.$executeRaw`
      INSERT INTO booking_history (company_id, booking_id, actor_id, actor_kind, action, from_status, to_status, before, after)
      VALUES (${companyId}::uuid, ${row.id}::uuid, ${actorId}::uuid, ${actorKind}, ${action},
              ${from}::booking_status, ${to}::booking_status, ${before ? JSON.stringify(before) : null}::jsonb, ${after ? JSON.stringify(after) : null}::jsonb)`
  }

  // Written with the transaction client and allowed to throw: a swallowed failure
  // would abort the transaction and turn the commit into a silent rollback.
  async function emit(tx, companyId, action, row) {
    const event = `bookings.booking.${action}`
    if (!DOMAIN_EVENTS[event]) throw new Error(`Evento de dominio desconocido: ${event}`)
    await tx.domainEventOutbox.create({
      data: {
        companyId,
        event,
        payload: { id: row.id, spaceId: row.space_id, serviceId: row.service_id, status: row.status, startsAt: new Date(row.starts_at).toISOString(), endsAt: new Date(row.ends_at).toISOString(), partySize: row.party_size, channel: row.channel, contactId: row.contact_id ?? null },
      },
    })
  }

  // Customer email for this change, in the same transaction; the worker sends it
  // later. dedupe_key makes retries and replays enqueue it only once.
  async function notify(tx, row, kind) {
    if (!row.guest_email || !kind) return
    await tx.$executeRaw`
      INSERT INTO booking_notification (company_id, booking_id, kind, dedupe_key, recipient)
      VALUES (${row.company_id}::uuid, ${row.id}::uuid, ${kind}, ${`${row.id}:${kind}:${row.version}`}, ${row.guest_email})
      ON CONFLICT (dedupe_key) DO NOTHING`
  }

  // Customers act from the portal only while the space's cut-off allows it.
  function assertCustomerWindow(row, minutes, what) {
    if (minutes == null) return
    if (now() > new Date(row.starts_at).getTime() - Number(minutes) * M) {
      throw new BookingError(`Ya no es posible ${what} en línea; comunícate con el negocio.`, 409, 'POLICY_WINDOW_CLOSED')
    }
  }

  // Frees what a booking occupies: resource allocations and session seats.
  async function release(tx, row) {
    await tx.$executeRaw`UPDATE booking_allocation SET active = false WHERE booking_id = ${row.id}::uuid AND active`
    if (row.session_id) {
      await tx.$executeRaw`UPDATE booking_session SET seats_taken = seats_taken - ${row.party_size}, updated_at = now() WHERE id = ${row.session_id}::uuid AND company_id = ${row.company_id}::uuid`
    }
  }

  // PENDING holds past hold_expires_at stop occupying anything. Called before taking
  // capacity in the same scope, and in bulk by the worker (phase 3).
  async function expireStaleHolds(tx, companyId, { resourceIds = null, from = null, to = null, sessionId = null } = {}) {
    const rows = sessionId
      ? await tx.$queryRaw`
          UPDATE booking SET status = 'EXPIRED', version = version + 1, updated_at = now()
           WHERE company_id = ${companyId}::uuid AND status = 'PENDING' AND hold_expires_at < now() AND session_id = ${sessionId}::uuid
          RETURNING *`
      : resourceIds
        ? await tx.$queryRaw`
            UPDATE booking SET status = 'EXPIRED', version = version + 1, updated_at = now()
             WHERE company_id = ${companyId}::uuid AND status = 'PENDING' AND hold_expires_at < now()
               AND id IN (SELECT booking_id FROM booking_allocation
                           WHERE active AND booking_id IS NOT NULL AND resource_id = ANY(${resourceIds}::uuid[])
                             AND during && tstzrange(${new Date(from)}::timestamptz, ${new Date(to)}::timestamptz, '[)'))
            RETURNING *`
        : await tx.$queryRaw`
            UPDATE booking SET status = 'EXPIRED', version = version + 1, updated_at = now()
             WHERE company_id = ${companyId}::uuid AND status = 'PENDING' AND hold_expires_at < now()
            RETURNING *`
    for (const row of rows) {
      await release(tx, row)
      await history(tx, { companyId, row, actorId: null, actorKind: 'system', action: 'expire', from: 'PENDING', to: 'EXPIRED' })
      await emit(tx, companyId, 'expired', row)
    }
    return rows.length
  }

  function checkLimits(space, start) {
    const { notBefore, notAfter } = bookingWindowLimits(space, now())
    if (start.getTime() < notBefore) throw new BookingError('El horario ya pasó o no respeta la anticipación mínima del sistema.', 422, 'TOO_SOON')
    if (start.getTime() > notAfter) throw new BookingError('El horario está fuera del periodo que el sistema permite reservar.', 422, 'TOO_FAR')
  }

  async function loadService(tx, companyId, spaceId, serviceId) {
    const service = (await tx.$queryRaw`
      SELECT * FROM booking_service WHERE id = ${serviceId}::uuid AND company_id = ${companyId}::uuid AND space_id = ${spaceId}::uuid AND enabled = true`)[0]
    if (!service) throw notFound('Servicio')
    return service
  }

  async function loadSpace(tx, companyId, spaceId) {
    const space = (await tx.$queryRaw`SELECT * FROM booking_space WHERE id = ${spaceId}::uuid AND company_id = ${companyId}::uuid`)[0]
    if (!space) throw notFound('Sistema de reservaciones')
    if (!space.enabled) throw new BookingError('El sistema de reservaciones está desactivado.', 409, 'SPACE_DISABLED')
    return space
  }

  // Resources that can take [start, end) by the hours rules; the exclusion
  // constraint decides which of them is actually free.
  async function appointmentCandidates(tx, { companyId, space, service, start, end, resourceId, partySize = null }) {
    let resources = await eligibleResources(tx, { companyId, spaceId: space.id, serviceId: service.id, partySize })
    if (!resources.length) {
      if (partySize != null && (await eligibleResources(tx, { companyId, spaceId: space.id, serviceId: service.id })).length) throw new BookingError(`Ningún recurso de este servicio tiene lugar para ${partySize} personas.`, 422, 'NO_CAPACITY')
      throw new BookingError('El servicio no tiene recursos asignados en este sistema.', 422, 'NO_RESOURCES')
    }
    if (resourceId) {
      resources = resources.filter((r) => r.id === resourceId)
      if (!resources.length) throw new BookingError('Ese recurso no puede atender este servicio.', 422, 'RESOURCE_NOT_ELIGIBLE')
    }
    const ids = resources.map((r) => r.id)
    const windows = await loadResourceWindows(tx, { companyId, space, resourceIds: ids, from: start, to: end })
    const fit = ids.filter((id) => fitsWindow(windows.get(id) ?? [], start.getTime(), end.getTime()))
    if (!fit.length) throw new BookingError('El horario está fuera del horario de atención.', 409, 'OUTSIDE_HOURS')
    return fit
  }

  // Integrations exclude resources they know are busy outside the engine (a table physically occupied now).
  function withoutExcluded(candidates, exclude) {
    if (!exclude?.length) return candidates
    const left = candidates.filter((id) => !exclude.includes(id))
    if (!left.length) throw new BookingError('Ese recurso está ocupado en este momento; elige otro horario u otro recurso.', 409, 'RESOURCE_BUSY_NOW')
    return left
  }

  function occupiedRange(service, start, end) {
    return { from: new Date(start.getTime() - service.buffer_before_minutes * M), to: new Date(end.getTime() + service.buffer_after_minutes * M) }
  }

  // First candidate whose range is free wins; a conflict only rolls back its savepoint.
  async function allocate(tx, { companyId, bookingId = null, sessionId = null, candidates, range }) {
    for (const resourceId of candidates) {
      await tx.$executeRawUnsafe('SAVEPOINT booking_alloc')
      try {
        await tx.$executeRaw`
          INSERT INTO booking_allocation (company_id, booking_id, session_id, resource_id, during)
          VALUES (${companyId}::uuid, ${bookingId}::uuid, ${sessionId}::uuid, ${resourceId}::uuid,
                  tstzrange(${range.from}::timestamptz, ${range.to}::timestamptz, '[)'))`
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT booking_alloc')
        return resourceId
      } catch (error) {
        if (pgCode(error) !== '23P01') throw error
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT booking_alloc')
      }
    }
    throw slotTaken()
  }

  async function takeSeats(tx, { companyId, serviceId, sessionId, seats }) {
    const session = (await tx.$queryRaw`
      UPDATE booking_session SET seats_taken = seats_taken + ${seats}, updated_at = now()
       WHERE id = ${sessionId}::uuid AND company_id = ${companyId}::uuid AND service_id = ${serviceId}::uuid
         AND status = 'scheduled' AND seats_taken + ${seats} <= capacity
      RETURNING *`)[0]
    if (session) return session
    const exists = (await tx.$queryRaw`SELECT status FROM booking_session WHERE id = ${sessionId}::uuid AND company_id = ${companyId}::uuid AND service_id = ${serviceId}::uuid`)[0]
    if (!exists) throw notFound('Sesión')
    if (exists.status !== 'scheduled') throw new BookingError('La sesión ya no está disponible.', 409, 'SESSION_UNAVAILABLE')
    throw new BookingError('Ya no hay cupo suficiente en esta sesión.', 409, 'SESSION_FULL')
  }

  async function contactCheck(tx, companyId, contactId) {
    if (!contactId) return
    const row = (await tx.$queryRaw`SELECT id FROM contact WHERE id = ${contactId}::uuid AND company_id = ${companyId}::uuid`)[0]
    if (!row) throw notFound('Contacto')
  }

  // Length of a booking: the service's, or one chosen by staff (never by a portal customer).
  function lengthOf(service, input, portal) {
    const custom = !portal && input.durationMinutes != null ? Number(input.durationMinutes) : null
    if (custom != null && !(Number.isInteger(custom) && custom >= 5 && custom <= 720)) throw new BookingError('La duración debe estar entre 5 y 720 minutos.', 422, 'DURATION')
    return (custom ?? service.duration_minutes) * M
  }

  // portal: { pageId, acceptance } for self-scheduled bookings (actorId null).
  // source: { module, id } of an integration record (unique: a repeat returns the existing booking).
  // sideEffect(tx, row): the integration's own record, written in this same transaction.
  const create = (args) => inTx((tx) => createTx(tx, args))
  async function createTx(tx, { companyId, actorId, spaceId, input, idempotencyKey = null, channel = 'backoffice', portal = null, source = null, sideEffect = null, skipLimits = false, excludeResourceIds = null }) {
    const hash = requestHash('create', { spaceId, channel, ...input })
    const scope = portal ? `portal:${portal.pageId}` : `user:${actorId}`
    {
      if (source) {
        const prior = (await tx.$queryRaw`SELECT id FROM booking WHERE company_id = ${companyId}::uuid AND source_module = ${source.module} AND source_id = ${source.id}::uuid`)[0]
        if (prior) return { booking: await view(tx, companyId, prior.id), replayed: true }
      }
      const claimed = await claim(tx, { companyId, scope, operation: 'create', key: idempotencyKey, hash })
      if (claimed?.replay) return { booking: await view(tx, companyId, claimed.replay), replayed: true }
      const space = await loadSpace(tx, companyId, spaceId)
      const service = await loadService(tx, companyId, space.id, input.serviceId)
      const partySize = input.partySize ?? 1
      if (partySize < service.min_party || partySize > service.max_party) {
        throw new BookingError(`Este servicio admite de ${service.min_party} a ${service.max_party} personas.`, 422, 'PARTY_SIZE')
      }
      await contactCheck(tx, companyId, input.contactId)
      const policy = policyOf(space)
      const status = policy.requiresApproval ? 'PENDING' : 'CONFIRMED'
      const holdExpiresAt = status === 'PENDING' && policy.holdMinutes ? new Date(now() + policy.holdMinutes * M) : null
      let start, end, session = null, candidates = null
      if (service.kind === 'session') {
        if (!input.sessionId) throw new BookingError('Este servicio se reserva eligiendo una sesión.', 422, 'SESSION_REQUIRED')
        await expireStaleHolds(tx, companyId, { sessionId: input.sessionId })
        session = await takeSeats(tx, { companyId, serviceId: service.id, sessionId: input.sessionId, seats: partySize })
        start = new Date(session.starts_at); end = new Date(session.ends_at)
        checkLimits(space, start)
      } else {
        if (!input.startsAt) throw new BookingError('Este servicio se reserva eligiendo un horario.', 422, 'START_REQUIRED')
        start = new Date(input.startsAt); end = new Date(start.getTime() + lengthOf(service, input, portal))
        if (!skipLimits) checkLimits(space, start)
        candidates = withoutExcluded(await appointmentCandidates(tx, { companyId, space, service, start, end, resourceId: input.resourceId, partySize }), excludeResourceIds)
        const range = occupiedRange(service, start, end)
        await expireStaleHolds(tx, companyId, { resourceIds: candidates, ...range })
      }
      // A manage link exists whenever the customer can receive or keep it.
      const linked = Boolean(portal || input.guestEmail)
      let row = (await tx.$queryRaw`
        INSERT INTO booking (company_id, space_id, service_id, session_id, status, starts_at, ends_at, party_size,
                             contact_id, guest_name, guest_email, guest_phone, notes, channel, hold_expires_at, created_by_id,
                             page_id, policy_acceptance, manage_token_version, manage_token_expires_at, source_module, source_id)
        VALUES (${companyId}::uuid, ${space.id}::uuid, ${service.id}::uuid, ${session?.id ?? null}::uuid, ${status}::booking_status,
                ${start}, ${end}, ${partySize}, ${input.contactId ?? null}::uuid, ${input.guestName ?? null}, ${input.guestEmail ?? null},
                ${input.guestPhone ?? null}, ${input.notes ?? null}, ${channel}, ${holdExpiresAt}, ${actorId}::uuid,
                ${portal?.pageId ?? null}::uuid, ${portal?.acceptance ? JSON.stringify(portal.acceptance) : null}::jsonb,
                ${linked ? 1 : 0}, ${linked ? manageExpiry(end) : null}, ${source?.module ?? null}, ${source?.id ?? null}::uuid)
        RETURNING *`)[0]
      if (linked) {
        row = (await tx.$queryRaw`UPDATE booking SET manage_token_hash = ${hashToken(manageToken(row.id, 1))} WHERE id = ${row.id}::uuid RETURNING *`)[0]
      }
      const resourceIds = candidates
        ? [await allocate(tx, { companyId, bookingId: row.id, candidates, range: occupiedRange(service, start, end) })]
        : []
      await settle(tx, claimed, row.id)
      await history(tx, { companyId, row, actorId, actorKind: portal ? 'portal' : 'user', action: 'create', to: status, after: serializeBooking(row, resourceIds) })
      await emit(tx, companyId, 'created', row)
      await notify(tx, row, status === 'PENDING' ? 'pending' : 'confirmed')
      if (sideEffect) await sideEffect(tx, row, resourceIds)
      return { booking: serializeBooking(row, resourceIds), replayed: false }
    }
  }

  // customer: { cancelUntilMinutes } when the customer acts from the portal.
  const transition = (args) => inTx((tx) => transitionTx(tx, args))
  async function transitionTx(tx, { companyId, actorId, bookingId, to, input = {}, idempotencyKey = null, actorKind = 'user', customer = null, sideEffect = null }) {
    if (!EVENT_OF[to]) throw new BookingError('Estado inválido.', 400, 'INVALID_STATUS')
    const hash = requestHash(`transition:${to}`, { bookingId, ...input })
    {
      const claimed = await claim(tx, { companyId, scope: customer ? `portal-manage:${bookingId}` : `user:${actorId}`, operation: `transition:${to}`, key: idempotencyKey, hash })
      if (claimed?.replay) return { booking: await view(tx, companyId, claimed.replay), replayed: true }
      const row = await lockBooking(tx, companyId, bookingId)
      if (customer && to === 'CANCELLED' && OCCUPYING.has(row.status)) assertCustomerWindow(row, customer.cancelUntilMinutes, 'cancelar')
      if (input.expectedVersion && row.version !== input.expectedVersion) throw new BookingError('La reservación cambió mientras la editabas.', 409, 'VERSION_CONFLICT')
      if (!(TRANSITIONS[row.status] ?? []).includes(to)) throw new BookingError(`Una reservación ${LABEL[row.status].toLowerCase()} no puede pasar a ${LABEL[to].toLowerCase()}.`, 409, 'INVALID_TRANSITION')
      if ((to === 'COMPLETED' || to === 'NO_SHOW') && now() < new Date(row.starts_at).getTime()) {
        throw new BookingError('La reservación todavía no empieza.', 409, 'NOT_STARTED')
      }
      if (to === 'CONFIRMED' && row.hold_expires_at && new Date(row.hold_expires_at).getTime() < now()) {
        throw new BookingError('La reservación pendiente ya venció.', 409, 'HOLD_EXPIRED')
      }
      const updated = (await tx.$queryRaw`
        UPDATE booking SET status = ${to}::booking_status, version = version + 1, updated_at = now(),
               hold_expires_at = CASE WHEN ${to} = 'CONFIRMED' THEN NULL ELSE hold_expires_at END
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      const before = serializeBooking(row, await activeResources(tx, row.id))
      if (!OCCUPYING.has(to)) await release(tx, row)
      const resourceIds = await activeResources(tx, row.id)
      await settle(tx, claimed, row.id)
      await history(tx, { companyId, row, actorId, actorKind, action: to.toLowerCase(), from: row.status, to, before, after: { ...serializeBooking(updated, resourceIds), ...(input.reason ? { reason: input.reason } : {}) } })
      await emit(tx, companyId, EVENT_OF[to], updated)
      await notify(tx, updated, NOTIFY_OF[to])
      if (sideEffect) await sideEffect(tx, updated, resourceIds)
      return { booking: serializeBooking(updated, resourceIds), replayed: false }
    }
  }

  // customer: { rescheduleUntilMinutes, allowResource } when the customer acts from the portal.
  // The booked length is kept unless staff send a new durationMinutes.
  const reschedule = (args) => inTx((tx) => rescheduleTx(tx, args))
  async function rescheduleTx(tx, { companyId, actorId, bookingId, input, idempotencyKey = null, actorKind = 'user', customer = null, sideEffect = null, excludeResourceIds = null }) {
    const hash = requestHash('reschedule', { bookingId, ...input })
    {
      const claimed = await claim(tx, { companyId, scope: customer ? `portal-manage:${bookingId}` : `user:${actorId}`, operation: 'reschedule', key: idempotencyKey, hash })
      if (claimed?.replay) return { booking: await view(tx, companyId, claimed.replay), replayed: true }
      const row = await lockBooking(tx, companyId, bookingId)
      if (input.expectedVersion && row.version !== input.expectedVersion) throw new BookingError('La reservación cambió mientras la editabas.', 409, 'VERSION_CONFLICT')
      if (!OCCUPYING.has(row.status)) throw new BookingError('Solo se reprograman reservaciones pendientes o confirmadas.', 409, 'INVALID_TRANSITION')
      if (customer) assertCustomerWindow(row, customer.rescheduleUntilMinutes, 'reprogramar')
      const space = await loadSpace(tx, companyId, row.space_id)
      const service = await loadService(tx, companyId, space.id, row.service_id)
      const before = serializeBooking(row, await activeResources(tx, row.id))
      // Staff may change the party size with the move (it decides which table fits).
      const party = !customer && input.partySize != null ? Number(input.partySize) : row.party_size
      if (party < service.min_party || party > service.max_party) throw new BookingError(`Este servicio admite de ${service.min_party} a ${service.max_party} personas.`, 422, 'PARTY_SIZE')
      if (party !== row.party_size && service.kind === 'session') throw new BookingError('En una sesión cambia el número de personas creando otra reservación.', 422, 'PARTY_SIZE')
      // Old capacity is freed first, so moving within an overlapping range works.
      await release(tx, row)
      let start, end, sessionId = null, resourceIds = []
      if (service.kind === 'session') {
        if (!input.sessionId) throw new BookingError('Este servicio se reprograma eligiendo otra sesión.', 422, 'SESSION_REQUIRED')
        await expireStaleHolds(tx, companyId, { sessionId: input.sessionId })
        const session = await takeSeats(tx, { companyId, serviceId: service.id, sessionId: input.sessionId, seats: row.party_size })
        start = new Date(session.starts_at); end = new Date(session.ends_at); sessionId = session.id
        checkLimits(space, start)
      } else {
        if (!input.startsAt) throw new BookingError('Este servicio se reprograma eligiendo otro horario.', 422, 'START_REQUIRED')
        const booked = new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()
        start = new Date(input.startsAt); end = new Date(start.getTime() + (input.durationMinutes != null && !customer ? lengthOf(service, input, null) : booked))
        checkLimits(space, start)
        const candidates = withoutExcluded(await appointmentCandidates(tx, { companyId, space, service, start, end, resourceId: input.resourceId, partySize: party }), excludeResourceIds)
        const range = occupiedRange(service, start, end)
        await expireStaleHolds(tx, companyId, { resourceIds: candidates, ...range })
        resourceIds = [await allocate(tx, { companyId, bookingId: row.id, candidates, range })]
      }
      const updated = (await tx.$queryRaw`
        UPDATE booking SET starts_at = ${start}, ends_at = ${end}, session_id = ${sessionId}::uuid, party_size = ${party}, version = version + 1, updated_at = now(),
               manage_token_expires_at = CASE WHEN manage_token_version > 0 THEN ${manageExpiry(end)}::timestamptz ELSE manage_token_expires_at END
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      await settle(tx, claimed, row.id)
      await history(tx, { companyId, row, actorId, actorKind, action: 'reschedule', from: row.status, to: row.status, before, after: serializeBooking(updated, resourceIds) })
      await emit(tx, companyId, 'rescheduled', updated)
      await notify(tx, updated, 'rescheduled')
      if (sideEffect) await sideEffect(tx, updated, resourceIds)
      return { booking: serializeBooking(updated, resourceIds), replayed: false }
    }
  }

  // D3 (ticketing spec section 9): fewer people in a session booking, in the caller's
  // transaction. Frees exactly `by` seats of its session; the booking keeps the rest.
  // Reducing to zero is a cancellation (transitionTx), never an empty booking.
  async function reducePartyTx(tx, { companyId, actorId, bookingId, by, actorKind = 'user' }) {
    const seats = Number(by)
    if (!Number.isInteger(seats) || seats < 1) throw new BookingError('Indica cuántos lugares liberar.', 422, 'PARTY_SIZE')
    const row = await lockBooking(tx, companyId, bookingId)
    if (!OCCUPYING.has(row.status)) throw new BookingError('La reservación ya no ocupa lugares.', 409, 'INVALID_TRANSITION')
    if (!row.session_id) throw new BookingError('Solo se reducen reservaciones de sesiones con cupo.', 422, 'NOT_SESSION_BOOKING')
    if (seats >= row.party_size) throw new BookingError('Para liberar todos los lugares cancela la reservación.', 422, 'PARTY_SIZE')
    await tx.$executeRaw`UPDATE booking_session SET seats_taken = seats_taken - ${seats}, updated_at = now() WHERE id = ${row.session_id}::uuid AND company_id = ${companyId}::uuid`
    const updated = (await tx.$queryRaw`
      UPDATE booking SET party_size = party_size - ${seats}, version = version + 1, updated_at = now() WHERE id = ${row.id}::uuid RETURNING *`)[0]
    await history(tx, { companyId, row, actorId, actorKind, action: 'reduce_party', from: row.status, to: row.status, before: { partySize: row.party_size }, after: { partySize: updated.party_size } })
    return serializeBooking(updated)
  }

  // The guest arrived and an account (POS order) was opened for this booking, in the
  // caller's transaction (the order and the link commit together). The booking keeps
  // occupying its resource until it is completed.
  async function attachOrderTx(tx, { companyId, actorId, bookingId, orderId }) {
    const row = await lockBooking(tx, companyId, bookingId)
    if (row.status !== 'CONFIRMED') throw new BookingError('Solo una reservación confirmada puede recibir al cliente.', 409, 'INVALID_TRANSITION')
    if (row.pos_order_id) throw new BookingError('Esta reservación ya tiene una cuenta abierta.', 409, 'ALREADY_ARRIVED')
    const updated = (await tx.$queryRaw`
      UPDATE booking SET pos_order_id = ${orderId}::uuid, arrived_at = now(), version = version + 1, updated_at = now()
       WHERE id = ${row.id}::uuid RETURNING *`)[0]
    await history(tx, { companyId, row, actorId, action: 'arrive', from: row.status, to: row.status, after: { orderId } })
    return serializeBooking(updated, await activeResources(tx, row.id))
  }

  // Customer name, phone and notes (nothing that changes capacity or time).
  async function updateDetails({ companyId, actorId, bookingId, input }) {
    return inTx(async (tx) => {
      const row = await lockBooking(tx, companyId, bookingId)
      if (!OCCUPYING.has(row.status)) throw new BookingError('La reservación ya no se puede editar.', 409, 'INVALID_TRANSITION')
      const pick = (key, column) => (input[key] !== undefined ? input[key] : row[column])
      const updated = (await tx.$queryRaw`
        UPDATE booking SET guest_name = ${pick('guestName', 'guest_name')}, guest_phone = ${pick('guestPhone', 'guest_phone')}, notes = ${pick('notes', 'notes')},
               version = version + 1, updated_at = now()
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      const resourceIds = await activeResources(tx, row.id)
      await history(tx, { companyId, row, actorId, action: 'update', from: row.status, to: row.status, before: serializeBooking(row, resourceIds), after: serializeBooking(updated, resourceIds) })
      return { booking: serializeBooking(updated, resourceIds) }
    })
  }

  // Revokes the current manage link and issues a new one (sent by email).
  async function rotateManageLink({ companyId, actorId, bookingId }) {
    return inTx(async (tx) => {
      const row = await lockBooking(tx, companyId, bookingId)
      if (!row.guest_email) throw new BookingError('La reservación no tiene correo del cliente para enviarle un enlace.', 422, 'NO_GUEST_EMAIL')
      const version = row.manage_token_version + 1
      const updated = (await tx.$queryRaw`
        UPDATE booking SET manage_token_version = ${version}, manage_token_hash = ${hashToken(manageToken(row.id, version))},
               manage_token_expires_at = ${manageExpiry(row.ends_at)}, updated_at = now()
         WHERE id = ${row.id}::uuid RETURNING *`)[0]
      await history(tx, { companyId, row, actorId, action: 'manage_link', from: row.status, to: row.status })
      await tx.$executeRaw`
        INSERT INTO booking_notification (company_id, booking_id, kind, dedupe_key, recipient)
        VALUES (${companyId}::uuid, ${row.id}::uuid, 'manage_link', ${`${row.id}:manage_link:${version}`}, ${row.guest_email})
        ON CONFLICT (dedupe_key) DO NOTHING`
      return serializeBooking(updated, await activeResources(tx, row.id))
    })
  }

  // In the caller's transaction too (Ticketing creates the function and its own row together).
  const createSession = (args) => inTx((tx) => createSessionTx(tx, args))
  async function createSessionTx(tx, { companyId, spaceId, input }) {
    {
      const space = await loadSpace(tx, companyId, spaceId)
      const service = await loadService(tx, companyId, space.id, input.serviceId)
      if (service.kind !== 'session') throw new BookingError('Solo los servicios por sesión tienen sesiones.', 422, 'NOT_SESSION_SERVICE')
      if (input.resourceId && !(await eligibleResources(tx, { companyId, spaceId: space.id, serviceId: service.id })).some((r) => r.id === input.resourceId)) {
        throw new BookingError('Ese recurso no puede atender este servicio.', 422, 'RESOURCE_NOT_ELIGIBLE')
      }
      const start = new Date(input.startsAt), end = new Date(start.getTime() + service.duration_minutes * M)
      const session = (await tx.$queryRaw`
        INSERT INTO booking_session (company_id, space_id, service_id, resource_id, starts_at, ends_at, capacity)
        VALUES (${companyId}::uuid, ${space.id}::uuid, ${service.id}::uuid, ${input.resourceId ?? null}::uuid, ${start}, ${end}, ${input.capacity ?? service.capacity})
        RETURNING *`)[0]
      if (input.resourceId) await allocate(tx, { companyId, sessionId: session.id, candidates: [input.resourceId], range: occupiedRange(service, start, end) })
      return session
    }
  }

  async function cancelSession({ companyId, sessionId }) {
    return inTx(async (tx) => {
      const session = (await tx.$queryRaw`SELECT * FROM booking_session WHERE id = ${sessionId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
      if (!session) throw notFound('Sesión')
      if (session.status === 'cancelled') return session
      await expireStaleHolds(tx, companyId, { sessionId })
      const fresh = (await tx.$queryRaw`SELECT seats_taken FROM booking_session WHERE id = ${sessionId}::uuid`)[0]
      if (fresh.seats_taken > 0) throw new BookingError('La sesión tiene reservaciones activas; cancélalas o reprográmalas primero.', 409, 'SESSION_HAS_BOOKINGS')
      await tx.$executeRaw`UPDATE booking_allocation SET active = false WHERE session_id = ${sessionId}::uuid AND active`
      return (await tx.$queryRaw`UPDATE booking_session SET status = 'cancelled', updated_at = now() WHERE id = ${sessionId}::uuid RETURNING *`)[0]
    })
  }

  // Worker entry point (phase 3): expire every stale hold of a company.
  const expireHolds = ({ companyId }) => inTx((tx) => expireStaleHolds(tx, companyId))

  // Worker sweep across companies: idempotent (each stale hold is claimed by one UPDATE).
  async function expireAllHolds() {
    const companies = await prisma.$queryRaw`SELECT DISTINCT company_id FROM booking WHERE status = 'PENDING' AND hold_expires_at < now()`
    let expired = 0
    for (const { company_id: companyId } of companies) expired += await expireHolds({ companyId })
    return { companies: companies.length, expired }
  }

  // After the commit (never inside it): projections such as the calendar mirror. Not
  // awaited, so a slow projection never delays or fails the customer's booking; the
  // worker re-projects whatever this misses.
  const notifyChanged = (fn) => async (args) => {
    const result = await fn(args)
    if (onChanged && result?.booking?.id) Promise.resolve().then(() => onChanged(result.booking.id)).catch(() => {})
    return result
  }

  return {
    create: notifyChanged(create), transition: notifyChanged(transition), reschedule: notifyChanged(reschedule), updateDetails: notifyChanged(updateDetails),
    // In the caller's transaction (integrations such as POS); the caller runs its projections after commit.
    createTx, transitionTx, rescheduleTx, attachOrderTx, createSessionTx, reducePartyTx,
    rotateManageLink, createSession, cancelSession, expireHolds, expireAllHolds, view: (companyId, id) => view(prisma, companyId, id),
  }
}
