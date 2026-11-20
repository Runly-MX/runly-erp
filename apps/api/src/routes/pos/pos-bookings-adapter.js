// POS table reservations and appointments for outlets whose pos_booking_link is in
// 'engine' mode. The legacy POS routes keep their contract (same DTO shape) and
// delegate here, so the Booking Engine is the only source of time and capacity.
// Boundary with physical state, which stays in POS (pos_table.status, open orders):
//   - a table occupied right now cannot take a reservation that starts within one
//     turnover (the link service's duration); auto-assignment skips it;
//   - a walk-in cannot open a table whose unseated reservation overlaps the next turnover;
//   - seating needs the table physically free (createOrder already checks it).
import { createBookingsCommandService } from '../bookings/bookings-command-service.js'
import { BookingError } from '../bookings/bookings-core.js'
import { fail } from './pos-contracts.js'
import { PosServiceError, writeAudit } from './service-helpers.js'

const M = 60000
const OPEN_ORDER = ['PAID', 'CANCELLED', 'REFUNDED']
const STATUS = { PENDING: 'PENDING', CANCELLED: 'CANCELLED', REJECTED: 'CANCELLED', EXPIRED: 'CANCELLED', NO_SHOW: 'NO_SHOW', COMPLETED: 'COMPLETED' }

export const engineError = (error) => (error instanceof BookingError ? new PosServiceError(error.message, error.status) : error)

// The outlet's link when POS writes through the engine for this kind, else null.
export async function engineLink(db, companyId, outletId, kind) {
  if (!outletId) return null
  const row = await db.posBookingLink.findUnique({ where: { companyId_outletId_kind: { companyId, outletId, kind } } })
  return row?.mode === 'engine' ? row : null
}

const serviceMinutes = async (db, serviceId) => (await db.bookingService.findUnique({ where: { id: serviceId }, select: { durationMinutes: true } }))?.durationMinutes ?? 90

// A walk-in cannot open a table whose unseated reservation overlaps the next turnover.
export async function assertTableWalkIn(tx, { companyId, outletId, tableId }) {
  const l = await engineLink(tx, companyId, outletId, 'tables')
  if (!l || !tableId) return
  const minutes = await serviceMinutes(tx, l.serviceId)
  const soon = (await tx.$queryRaw`
    SELECT b.starts_at, s.timezone FROM booking_allocation a JOIN booking b ON b.id = a.booking_id JOIN booking_space s ON s.id = b.space_id
      JOIN pos_booking_table pbt ON pbt.resource_id = a.resource_id
     WHERE pbt.table_id = ${tableId}::uuid AND a.active AND b.pos_order_id IS NULL AND b.status IN ('PENDING', 'CONFIRMED')
       AND a.during && tstzrange(now(), now() + make_interval(mins => ${minutes}::int), '[)')
     ORDER BY b.starts_at LIMIT 1`)[0]
  if (soon) {
    const at = new Date(soon.starts_at).toLocaleTimeString('es-MX', { timeZone: soon.timezone, hour: '2-digit', minute: '2-digit' })
    fail('TABLE_OCCUPIED', `La mesa tiene una reserva a las ${at}; recibe esa reserva o usa otra mesa.`)
  }
}

export function createPosBookingsAdapter({ prisma, onChanged = null }) {
  const commands = createBookingsCommandService({ prisma })
  const changed = (id) => { if (onChanged && id) Promise.resolve().then(() => onChanged(id)).catch(() => {}) }
  const guard = async (fn) => { try { return await fn() } catch (error) { throw engineError(error) } }

  const link = engineLink
  const engineLinks = (companyId, kind) => prisma.posBookingLink.findMany({ where: { companyId, kind, mode: 'engine' } })

  async function tableResource(db, companyId, tableId) {
    const row = await db.posBookingTable.findFirst({ where: { tableId, companyId } })
    if (!row) throw new PosServiceError('La mesa no está en el sistema de reservaciones; vuelve a activar la sucursal para incluirla.', 404)
    return row.resourceId
  }
  // Tables occupied right now (open account or a physical status) whose resource must not
  // take a reservation that starts before the table can turn over.
  async function busyNow(db, { companyId, link: l, startsAt }) {
    if (new Date(startsAt).getTime() >= Date.now() + await serviceMinutes(db, l.serviceId) * M) return []
    const rows = await db.$queryRaw`
      SELECT pbt.resource_id FROM pos_table t JOIN pos_booking_table pbt ON pbt.table_id = t.id
       WHERE t.company_id = ${companyId}::uuid
         AND (t.status IN ('OCCUPIED', 'BILL_REQUESTED', 'DIRTY')
              OR EXISTS (SELECT 1 FROM pos_order o WHERE o.table_id = t.id AND o.status NOT IN ('PAID', 'CANCELLED', 'REFUNDED')))`
    return rows.map((r) => r.resource_id)
  }

  // ---- Reservations ----------------------------------------------------------------
  async function bookingsOf(db, { companyId, spaceId, from = null, to = null, id = null }) {
    return db.$queryRaw`
      SELECT b.*, b.status::text AS status_text, pbt.table_id, t.name AS table_name, t.capacity AS table_capacity, t.status::text AS table_status
        FROM booking b
        LEFT JOIN booking_allocation a ON a.booking_id = b.id AND a.active
        LEFT JOIN pos_booking_table pbt ON pbt.resource_id = a.resource_id
        LEFT JOIN pos_table t ON t.id = pbt.table_id
       WHERE b.company_id = ${companyId}::uuid AND b.space_id = ${spaceId}::uuid
         AND (${id}::uuid IS NULL OR b.id = ${id}::uuid)
         AND (${from}::timestamptz IS NULL OR b.starts_at >= ${from}::timestamptz)
         AND (${to}::timestamptz IS NULL OR b.starts_at <= ${to}::timestamptz)
       ORDER BY b.starts_at, b.created_at`
  }
  // Same shape as a legacy pos_reservation (plus booking fields), so every POS client keeps working.
  function reservationDto(b, outletId) {
    return {
      id: b.id, bookingId: b.id, reference: b.reference, source: 'engine', companyId: b.company_id, outletId,
      tableId: b.table_id ?? null, table: b.table_id ? { id: b.table_id, name: b.table_name, capacity: b.table_capacity, status: b.table_status } : null,
      guestName: b.guest_name, guestPhone: b.guest_phone, partySize: b.party_size, scheduledAt: b.starts_at,
      durationMinutes: Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / M), endsAt: b.ends_at, notes: b.notes,
      status: b.status_text === 'CONFIRMED' ? (b.pos_order_id ? 'SEATED' : 'CONFIRMED') : STATUS[b.status_text], engineStatus: b.status_text,
      orderId: b.pos_order_id ?? null, arrivedAt: b.arrived_at ?? null, channel: b.channel, createdById: b.created_by_id, createdAt: b.created_at, updatedAt: b.updated_at,
    }
  }

  async function listReservations({ companyId, outletId, from, to, status }) {
    const links = outletId ? [await link(prisma, companyId, outletId, 'tables')].filter(Boolean) : await engineLinks(companyId, 'tables')
    const out = []
    for (const l of links) for (const b of await bookingsOf(prisma, { companyId, spaceId: l.spaceId, from, to })) out.push(reservationDto(b, l.outletId))
    return status ? out.filter((r) => r.status === status) : out
  }

  // A POS reservation id may be a booking id, or a legacy row already carried into the engine.
  async function resolveReservation(db, companyId, id) {
    const legacy = await db.posReservation.findFirst({ where: { id, companyId }, select: { outletId: true, bookingId: true } })
    if (legacy) {
      const l = legacy.bookingId ? await link(db, companyId, legacy.outletId, 'tables') : null
      return l ? { bookingId: legacy.bookingId, link: l } : null
    }
    const row = (await db.$queryRaw`
      SELECT b.id, l.outlet_id FROM booking b JOIN pos_booking_link l ON l.space_id = b.space_id AND l.company_id = b.company_id AND l.kind = 'tables' AND l.mode = 'engine'
       WHERE b.id = ${id}::uuid AND b.company_id = ${companyId}::uuid`)[0]
    return row ? { bookingId: row.id, link: await link(db, companyId, row.outlet_id, 'tables') } : null
  }

  async function reservationView(db, companyId, l, bookingId) {
    const [row] = await bookingsOf(db, { companyId, spaceId: l.spaceId, id: bookingId })
    return reservationDto(row, l.outletId)
  }

  async function createReservation({ companyId, actorId, link: l, data }) {
    const resourceId = data.tableId ? await tableResource(prisma, companyId, data.tableId) : undefined
    const busy = await busyNow(prisma, { companyId, link: l, startsAt: data.scheduledAt })
    if (resourceId && busy.includes(resourceId)) throw new PosServiceError('La mesa está ocupada ahora; elige otra mesa o un horario posterior a su rotación.', 409)
    const result = await guard(() => commands.create({
      companyId, actorId, spaceId: l.spaceId, channel: 'pos', excludeResourceIds: busy,
      input: { serviceId: l.serviceId, startsAt: data.scheduledAt, durationMinutes: data.durationMinutes, partySize: data.partySize ?? 2, resourceId, guestName: data.guestName, guestPhone: data.guestPhone ?? null, notes: data.notes ?? null },
    }))
    changed(result.booking.id)
    const view = await reservationView(prisma, companyId, l, result.booking.id)
    await writeAudit(prisma, { actorId, entityType: 'Booking', entityId: view.id, action: 'pos.reservation.create', after: view })
    return view
  }

  async function updateReservation({ companyId, actorId, ref, data }) {
    const { bookingId, link: l } = ref
    if (data.status === 'SEATED') throw new PosServiceError('Recibe la reserva con «Llegó» para abrir su cuenta.', 409)
    if (data.status === 'CANCELLED' || data.status === 'NO_SHOW') {
      await guard(() => commands.transition({ companyId, actorId, bookingId, to: data.status, input: {} }))
    }
    const moves = ['scheduledAt', 'durationMinutes', 'tableId', 'partySize'].some((k) => data[k] !== undefined)
    if (moves && !data.status) {
      const current = await reservationView(prisma, companyId, l, bookingId)
      if (current.orderId) throw new PosServiceError('La reserva ya está en mesa; cambia la cuenta, no la reserva.', 409)
      const startsAt = data.scheduledAt ?? current.scheduledAt
      const tableId = data.tableId === undefined ? current.tableId : data.tableId
      const resourceId = tableId ? await tableResource(prisma, companyId, tableId) : undefined
      const busy = await busyNow(prisma, { companyId, link: l, startsAt })
      if (resourceId && busy.includes(resourceId)) throw new PosServiceError('La mesa está ocupada ahora; elige otra mesa o un horario posterior a su rotación.', 409)
      await guard(() => commands.reschedule({ companyId, actorId, bookingId, excludeResourceIds: busy, input: {
        startsAt, resourceId, durationMinutes: data.durationMinutes ?? current.durationMinutes, partySize: data.partySize ?? current.partySize,
      } }))
    }
    if (['guestName', 'guestPhone', 'notes'].some((k) => data[k] !== undefined) && !data.status) {
      await guard(() => commands.updateDetails({ companyId, actorId, bookingId, input: { guestName: data.guestName, guestPhone: data.guestPhone, notes: data.notes } }))
    }
    changed(bookingId)
    const view = await reservationView(prisma, companyId, l, bookingId)
    await writeAudit(prisma, { actorId, entityType: 'Booking', entityId: bookingId, action: 'pos.reservation.update', after: view })
    return view
  }

  // Arrival (C6 and the legacy /seat route): the POS account and the link to the
  // booking commit in the caller's transaction.
  async function seatInTx(tx, { companyId, actorId, ref, openOrder }) {
    const [b] = await bookingsOf(tx, { companyId, spaceId: ref.link.spaceId, id: ref.bookingId })
    if (!b || b.status_text !== 'CONFIRMED' || b.pos_order_id) fail('INVALID_TRANSITION', 'La reserva ya fue atendida o cancelada.')
    const order = await openOrder({ outletId: ref.link.outletId, tableId: b.table_id ?? undefined, guestName: b.guest_name, guestPhone: b.guest_phone, partySize: b.party_size, notes: b.notes })
    try { await commands.attachOrderTx(tx, { companyId, actorId, bookingId: b.id, orderId: order.id }) } catch (error) {
      if (error instanceof BookingError) fail('INVALID_TRANSITION', error.message)
      throw error
    }
    return order
  }

  // Next reservation per table for the floor (unseated, not yet ended), engine outlets only.
  async function upcomingByTable(db, { companyId, outletId }) {
    const l = await link(db, companyId, outletId, 'tables')
    if (!l) return null
    const rows = await db.$queryRaw`
      SELECT DISTINCT ON (pbt.table_id) pbt.table_id, b.id, b.starts_at, b.ends_at, b.guest_name, b.party_size, b.status::text AS status
        FROM booking b JOIN booking_allocation a ON a.booking_id = b.id AND a.active JOIN pos_booking_table pbt ON pbt.resource_id = a.resource_id
       WHERE b.company_id = ${companyId}::uuid AND b.space_id = ${l.spaceId}::uuid AND b.status IN ('PENDING', 'CONFIRMED') AND b.pos_order_id IS NULL AND b.ends_at > now()
       ORDER BY pbt.table_id, b.starts_at`
    return new Map(rows.map((r) => [r.table_id, { id: r.id, scheduledAt: r.starts_at, endsAt: r.ends_at, guestName: r.guest_name, partySize: r.party_size, status: r.status }]))
  }

  // ---- Appointments ------------------------------------------------------------------
  // The pos_appointment row (services, customer, Caja link) is written in the same
  // transaction as its booking, so they never disagree.
  async function createAppointment({ companyId, actorId, link: l, data, items }) {
    let appointment
    const result = await guard(() => prisma.$transaction((tx) => commands.createTx(tx, {
      companyId, actorId, spaceId: l.spaceId, channel: 'pos',
      input: { serviceId: l.serviceId, startsAt: data.startsAt, durationMinutes: data.durationMinutes ?? 60, partySize: 1, resourceId: data.resourceId ?? undefined, contactId: data.contactId ?? undefined, guestName: data.customerName.trim(), guestPhone: data.customerPhone?.trim() || null, notes: data.notes?.trim() || null },
      sideEffect: async (db, row) => {
        appointment = await db.posAppointment.create({ data: {
          companyId, outletId: data.outletId, contactId: data.contactId ?? null, customerName: data.customerName.trim(), customerPhone: data.customerPhone?.trim() || null,
          startsAt: row.starts_at, durationMinutes: Math.round((new Date(row.ends_at) - new Date(row.starts_at)) / M), items, notes: data.notes?.trim() || null, createdById: actorId, bookingId: row.id,
        } })
      },
    }), { maxWait: 30000, timeout: 30000 }))
    changed(result.booking.id)
    return appointment
  }

  async function updateAppointment({ companyId, actorId, before, link: l, data, items }) {
    const moves = data.startsAt !== undefined || data.durationMinutes !== undefined || data.resourceId !== undefined
    const row = await guard(() => prisma.$transaction(async (tx) => {
      if (moves) {
        await commands.rescheduleTx(tx, { companyId, actorId, bookingId: before.bookingId, input: {
          startsAt: data.startsAt ?? before.startsAt, durationMinutes: data.durationMinutes ?? before.durationMinutes, ...(data.resourceId ? { resourceId: data.resourceId } : {}),
        } })
      }
      const [b] = await tx.$queryRaw`SELECT starts_at, ends_at FROM booking WHERE id = ${before.bookingId}::uuid`
      if (data.customerName || data.customerPhone !== undefined || data.notes !== undefined) {
        await tx.$executeRaw`UPDATE booking SET guest_name = COALESCE(${data.customerName?.trim() ?? null}, guest_name), guest_phone = ${data.customerPhone !== undefined ? (data.customerPhone?.trim() || null) : before.customerPhone},
                             notes = ${data.notes !== undefined ? (data.notes?.trim() || null) : before.notes}, version = version + 1, updated_at = now() WHERE id = ${before.bookingId}::uuid`
      }
      return tx.posAppointment.update({ where: { id: before.id }, data: {
        ...(data.contactId !== undefined ? { contactId: data.contactId } : {}),
        ...(data.customerName ? { customerName: data.customerName.trim() } : {}),
        ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone?.trim() || null } : {}),
        startsAt: b.starts_at, durationMinutes: Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / M),
        ...(items ? { items } : {}), ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      } })
    }, { maxWait: 30000, timeout: 30000 }))
    changed(before.bookingId)
    await writeAudit(prisma, { actorId, entityType: 'PosAppointment', entityId: before.id, action: 'pos.appointment.update', before, after: row })
    return row
  }

  // Engine transitions with the POS row updated in the same transaction. COMPLETED and
  // NO_SHOW before the start keep the engine as is (the engine only accepts them once the
  // appointment started; the worker completes it later), the POS row changes now.
  async function setAppointmentStatus({ companyId, before, status, orderId = null, actorId }) {
    const row = await guard(() => prisma.$transaction(async (tx) => {
      const [b] = await tx.$queryRaw`SELECT status::text AS status, starts_at FROM booking WHERE id = ${before.bookingId}::uuid FOR UPDATE`
      const started = Date.now() >= new Date(b.starts_at).getTime()
      const to = status === 'CANCELLED' ? 'CANCELLED' : status === 'NO_SHOW' ? 'NO_SHOW' : status === 'COMPLETED' && started ? 'COMPLETED' : null
      if (status === 'NO_SHOW' && !started) throw new PosServiceError('La cita todavía no empieza; si el cliente avisó, cancélala.', 409)
      if (to && b.status === 'CONFIRMED') await commands.transitionTx(tx, { companyId, actorId, bookingId: before.bookingId, to, input: {} })
      return tx.posAppointment.update({ where: { id: before.id }, data: { status, ...(status === 'COMPLETED' ? { orderId } : {}) } })
    }, { maxWait: 30000, timeout: 30000 }))
    changed(before.bookingId)
    return row
  }

  async function professionals({ companyId, outletId }) {
    const l = await link(prisma, companyId, outletId, 'appointments')
    if (!l) return []
    return prisma.$queryRaw`
      SELECT r.id, r.name FROM booking_resource r JOIN booking_space_resource sr ON sr.resource_id = r.id AND sr.space_id = ${l.spaceId}::uuid
       WHERE r.company_id = ${companyId}::uuid AND r.enabled ORDER BY r.name`
  }
  async function appointmentResources(companyId, bookingIds) {
    if (!bookingIds.length) return new Map()
    const rows = await prisma.$queryRaw`
      SELECT a.booking_id, r.id, r.name FROM booking_allocation a JOIN booking_resource r ON r.id = a.resource_id
       WHERE a.company_id = ${companyId}::uuid AND a.active AND a.booking_id = ANY(${bookingIds}::uuid[])`
    return new Map(rows.map((r) => [r.booking_id, { id: r.id, name: r.name }]))
  }

  // Worker: a seated reservation whose account closed, or an appointment charged before its
  // start, is completed once it has started (freeing what is left of its time).
  async function completeClosed() {
    const due = await prisma.$queryRaw`
      SELECT b.id, b.company_id FROM booking b
        LEFT JOIN pos_order o ON o.id = b.pos_order_id
        LEFT JOIN pos_appointment p ON p.booking_id = b.id
       WHERE b.status = 'CONFIRMED' AND b.starts_at <= now()
         AND ((b.pos_order_id IS NOT NULL AND o.status::text = ANY(${OPEN_ORDER})) OR p.status = 'COMPLETED')
       LIMIT 100`
    let completed = 0
    for (const b of due) {
      try { await commands.transition({ companyId: b.company_id, actorId: null, actorKind: 'system', bookingId: b.id, to: 'COMPLETED', input: {} }); completed++; changed(b.id) } catch { /* changed meanwhile */ }
    }
    return { completed }
  }

  return {
    link, listReservations, resolveReservation, createReservation, updateReservation, seatInTx, upcomingByTable, reservationView, assertWalkIn: assertTableWalkIn,
    createAppointment, updateAppointment, setAppointmentStatus, professionals, appointmentResources, completeClosed,
  }
}
