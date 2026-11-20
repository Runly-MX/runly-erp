// Moves an outlet's table reservations or appointments from the legacy POS tables
// onto the Booking Engine, one outlet and kind at a time, and back.
//   preview  -> the same activation inside a transaction that is rolled back (report only)
//   activate -> space + service + resources, legacy rows carried over idempotently
//               (booking.source_* = the legacy row), link mode 'engine'
//   rollback -> link mode 'legacy'; every live engine booking gets (or updates) its
//               legacy row, so nothing booked after activation is lost
// One writer at a time: while mode is 'engine' the legacy POS routes go through the
// engine (pos-bookings-adapter.js); while 'legacy', the engine space is unpublished.
import { createBookingsCommandService } from '../bookings/bookings-command-service.js'
import { createBookingsConfigService } from '../bookings/bookings-config-service.js'
import { BookingError } from '../bookings/bookings-core.js'
import { PosServiceError, requireCompanyId, writeAudit } from './service-helpers.js'

const KINDS = {
  tables: { space: 'Mesas', service: 'Mesa', duration: 90, bufferAfter: 15, maxParty: 50, source: 'runly.pos.reservation' },
  appointments: { space: 'Citas', service: 'Cita', duration: 60, bufferAfter: 0, maxParty: 1, source: 'runly.pos.appointment' },
}
const ROLLED_BACK = Symbol('preview')
const M = 60000

export function createPosBookingsLinkService({ prisma, onChanged = null }) {
  const commands = createBookingsCommandService({ prisma })
  const config = createBookingsConfigService({ prisma })

  async function outletOf(db, companyId, outletId) {
    const outlet = await db.posOutlet.findFirst({ where: { id: outletId, companyId, enabled: true } })
    if (!outlet) throw new PosServiceError('Sucursal no encontrada.', 404)
    return outlet
  }

  async function links({ companyId, outletId }) {
    const scoped = requireCompanyId(companyId)
    await outletOf(prisma, scoped, outletId)
    return prisma.posBookingLink.findMany({ where: { companyId: scoped, outletId }, orderBy: { kind: 'asc' } })
  }

  // Tables of the outlet (directly or through its floors).
  const outletTables = (db, companyId, outletId) => db.posTable.findMany({
    where: { companyId, enabled: true, OR: [{ outletId }, { floor: { outletId } }] }, orderBy: { name: 'asc' },
  })

  async function ensureSpace(tx, { companyId, outlet, kind, actorId, timezone, existing }) {
    const spec = KINDS[kind]
    if (existing) return { spaceId: existing.spaceId, serviceId: existing.serviceId }
    const zone = (await tx.$queryRaw`SELECT name FROM pg_timezone_names WHERE name = ${timezone}`)[0]
    if (!zone) throw new PosServiceError('Zona horaria inválida.', 400)
    const space = await tx.bookingSpace.create({ data: {
      companyId, name: `${spec.space} · ${outlet.name}`, slug: `pos-${kind}-${outlet.id.slice(-12)}`, mode: 'internal', timezone,
      policy: { horizonDays: 365, leadMinutes: 0 }, createdById: actorId,
    } })
    await tx.bookingSpaceMember.create({ data: { companyId, spaceId: space.id, userId: actorId, role: 'admin' } })
    await config.syncAccessGrant(tx, { companyId, userId: actorId, actorId })
    const service = await tx.bookingService.create({ data: {
      companyId, spaceId: space.id, name: spec.service, kind: 'appointment', durationMinutes: spec.duration, bufferBeforeMinutes: 0,
      bufferAfterMinutes: spec.bufferAfter, slotStepMinutes: 15, capacity: 1, minParty: 1, maxParty: spec.maxParty,
    } })
    // Open around the clock (two halves per day merge into one continuous window, so a
    // dinner can cross midnight); the business narrows it in Reservaciones if it wants.
    for (let weekday = 0; weekday < 7; weekday++) {
      await tx.$executeRaw`INSERT INTO booking_schedule_rule (company_id, space_id, weekday, start_time, end_time) VALUES (${companyId}::uuid, ${space.id}::uuid, ${weekday}, '00:00'::time, '12:00'::time), (${companyId}::uuid, ${space.id}::uuid, ${weekday}, '12:00'::time, '00:00'::time)`
    }
    return { spaceId: space.id, serviceId: service.id }
  }

  async function attach(tx, { companyId, spaceId, serviceId, resourceId }) {
    await tx.$executeRaw`INSERT INTO booking_space_resource (company_id, space_id, resource_id) VALUES (${companyId}::uuid, ${spaceId}::uuid, ${resourceId}::uuid) ON CONFLICT DO NOTHING`
    await tx.$executeRaw`INSERT INTO booking_service_resource (company_id, service_id, resource_id) VALUES (${companyId}::uuid, ${serviceId}::uuid, ${resourceId}::uuid) ON CONFLICT DO NOTHING`
  }

  // Every enabled table is a resource with its seats as capacity (kept in sync on each activation).
  async function syncTables(tx, { companyId, outletId, spaceId, serviceId }) {
    const map = new Map()
    for (const table of await outletTables(tx, companyId, outletId)) {
      const known = await tx.posBookingTable.findUnique({ where: { tableId: table.id } })
      let resourceId = known?.resourceId
      if (resourceId) await tx.bookingResource.update({ where: { id: resourceId }, data: { name: table.name, capacity: table.capacity, enabled: true } })
      else {
        resourceId = (await tx.bookingResource.create({ data: { companyId, name: table.name, type: 'table', capacity: table.capacity } })).id
        await tx.posBookingTable.create({ data: { tableId: table.id, companyId, resourceId } })
      }
      await attach(tx, { companyId, spaceId, serviceId, resourceId })
      map.set(table.id, resourceId)
    }
    return map
  }

  async function syncProfessionals(tx, { companyId, spaceId, serviceId, professionals = [] }) {
    const existing = await tx.$queryRaw`SELECT r.id FROM booking_resource r JOIN booking_space_resource sr ON sr.resource_id = r.id WHERE sr.space_id = ${spaceId}::uuid AND r.enabled`
    if (!existing.length && !professionals.length) throw new PosServiceError('Agrega al menos un profesional para agendar citas sin empalmes.', 400)
    for (const p of professionals) {
      const resource = await tx.bookingResource.create({ data: { companyId, name: p.name, type: 'staff', userId: p.userId ?? null } })
      await attach(tx, { companyId, spaceId, serviceId, resourceId: resource.id })
    }
  }

  // Legacy rows that still matter (open and not yet ended) go into the engine; a repeat finds
  // the same booking by its source. Started ones keep their remaining time (skipLimits).
  async function carryOver(tx, { companyId, outletId, kind, spaceId, serviceId, tables }) {
    const now = new Date()
    const report = { carried: 0, conflicts: [] }
    const rows = kind === 'tables'
      ? await tx.$queryRaw`SELECT * FROM pos_reservation WHERE company_id = ${companyId}::uuid AND outlet_id = ${outletId}::uuid AND status = 'CONFIRMED' AND booking_id IS NULL AND scheduled_at + make_interval(mins => duration_minutes) > ${now} ORDER BY scheduled_at, created_at`
      : await tx.$queryRaw`SELECT * FROM pos_appointment WHERE company_id = ${companyId}::uuid AND outlet_id = ${outletId}::uuid AND status IN ('SCHEDULED', 'ARRIVED') AND booking_id IS NULL AND starts_at + make_interval(mins => duration_minutes) > ${now} ORDER BY starts_at, created_at`
    // Rows copied back by a rollback (booking_id set) and changed in legacy mode meanwhile:
    // the legacy change wins (it is the newer one) and is applied through the engine.
    const relinked = kind === 'tables'
      ? await tx.$queryRaw`SELECT r.id, r.status::text AS status, r.scheduled_at AS starts_at, r.duration_minutes, b.id AS booking_id, b.status::text AS booking_status, b.starts_at AS booking_starts, b.ends_at AS booking_ends
          FROM pos_reservation r JOIN booking b ON b.id = r.booking_id WHERE r.company_id = ${companyId}::uuid AND r.outlet_id = ${outletId}::uuid AND b.status IN ('PENDING', 'CONFIRMED')`
      : await tx.$queryRaw`SELECT r.id, r.status::text AS status, r.starts_at, r.duration_minutes, b.id AS booking_id, b.status::text AS booking_status, b.starts_at AS booking_starts, b.ends_at AS booking_ends
          FROM pos_appointment r JOIN booking b ON b.id = r.booking_id WHERE r.company_id = ${companyId}::uuid AND r.outlet_id = ${outletId}::uuid AND b.status IN ('PENDING', 'CONFIRMED')`
    for (const r of relinked) {
      try {
        await tx.$executeRawUnsafe('SAVEPOINT pos_relink')
        if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)) {
          await commands.transitionTx(tx, { companyId, actorId: null, actorKind: 'system', bookingId: r.booking_id, to: 'CANCELLED', input: { reason: `Cambio hecho en POS durante el modo anterior (${r.status})` } })
          report.reconciled = (report.reconciled ?? 0) + 1
        } else if (new Date(r.starts_at).getTime() !== new Date(r.booking_starts).getTime() || r.duration_minutes * M !== new Date(r.booking_ends) - new Date(r.booking_starts)) {
          await commands.rescheduleTx(tx, { companyId, actorId: null, actorKind: 'system', bookingId: r.booking_id, input: { startsAt: r.starts_at, durationMinutes: r.duration_minutes } })
          report.reconciled = (report.reconciled ?? 0) + 1
        }
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT pos_relink')
      } catch (error) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT pos_relink')
        if (!(error instanceof BookingError)) throw error
        report.conflicts.push({ id: r.id, startsAt: r.starts_at, code: error.code, reason: error.message })
      }
    }
    for (const row of rows) {
      const input = kind === 'tables'
        ? { serviceId, startsAt: row.scheduled_at, durationMinutes: row.duration_minutes, partySize: row.party_size, resourceId: row.table_id ? tables.get(row.table_id) : undefined, guestName: row.guest_name, guestPhone: row.guest_phone, notes: row.notes }
        : { serviceId, startsAt: row.starts_at, durationMinutes: row.duration_minutes, partySize: 1, contactId: row.contact_id ?? undefined, guestName: row.customer_name, guestPhone: row.customer_phone, notes: row.notes }
      try {
        await tx.$executeRawUnsafe('SAVEPOINT pos_carry')
        const result = await commands.createTx(tx, { companyId, actorId: row.created_by_id, spaceId, input, channel: 'pos', source: { module: KINDS[kind].source, id: row.id }, skipLimits: true })
        if (kind === 'tables') await tx.$executeRaw`UPDATE pos_reservation SET booking_id = ${result.booking.id}::uuid WHERE id = ${row.id}::uuid`
        else await tx.$executeRaw`UPDATE pos_appointment SET booking_id = ${result.booking.id}::uuid WHERE id = ${row.id}::uuid`
        // Its POS calendar event goes; the engine projection mirrors the booking (one event).
        await tx.calendarEvent.deleteMany({ where: { sourceModule: 'runly.pos', sourceEntityId: row.id } })
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT pos_carry')
        report.carried++
      } catch (error) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT pos_carry')
        if (!(error instanceof BookingError)) throw error
        report.conflicts.push({ id: row.id, name: row.guest_name ?? row.customer_name, startsAt: row.scheduled_at ?? row.starts_at, tableId: row.table_id ?? null, code: error.code, reason: error.message })
      }
    }
    // Legacy all-day RESERVED marks go: the engine now holds those times.
    if (kind === 'tables') {
      await tx.$executeRaw`
        UPDATE pos_table t SET status = 'AVAILABLE', version = version + 1
         WHERE t.company_id = ${companyId}::uuid AND t.status = 'RESERVED' AND t.id IN (SELECT table_id FROM pos_booking_table)
           AND NOT EXISTS (SELECT 1 FROM pos_order o WHERE o.table_id = t.id AND o.status NOT IN ('PAID', 'CANCELLED', 'REFUNDED'))`
    }
    return report
  }

  async function run({ companyId, actorId, outletId, kind, timezone = 'America/Mexico_City', professionals = [], dryRun }) {
    const scoped = requireCompanyId(companyId)
    if (!KINDS[kind]) throw new PosServiceError('Tipo inválido.', 400)
    let report
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos-booking-link:${scoped}:${outletId}:${kind}`}, 0))::text`
        const outlet = await outletOf(tx, scoped, outletId)
        if (kind === 'tables' && !['RESTAURANT', 'HYBRID'].includes(outlet.mode)) throw new PosServiceError('La sucursal no maneja mesas.', 409)
        const existing = await tx.posBookingLink.findUnique({ where: { companyId_outletId_kind: { companyId: scoped, outletId, kind } } })
        if (existing?.mode === 'engine') { report = { alreadyActive: true, carried: 0, conflicts: [], spaceId: existing.spaceId }; return }
        const { spaceId, serviceId } = await ensureSpace(tx, { companyId: scoped, outlet, kind, actorId, timezone, existing })
        const tables = kind === 'tables' ? await syncTables(tx, { companyId: scoped, outletId, spaceId, serviceId }) : new Map()
        if (kind === 'appointments') await syncProfessionals(tx, { companyId: scoped, spaceId, serviceId, professionals })
        report = { ...(await carryOver(tx, { companyId: scoped, outletId, kind, spaceId, serviceId, tables })), spaceId, resources: kind === 'tables' ? tables.size : professionals.length }
        if (report.conflicts.length && !dryRun) throw new PosServiceError(`${report.conflicts.length} registro(s) no caben en el motor; resuélvelos y vuelve a activar.`, 409)
        const data = { spaceId, serviceId, mode: 'engine', activatedAt: new Date(), activatedById: actorId, rolledBackAt: null }
        await tx.posBookingLink.upsert({ where: { companyId_outletId_kind: { companyId: scoped, outletId, kind } }, update: data, create: { companyId: scoped, outletId, kind, ...data } })
        await tx.bookingSpace.update({ where: { id: spaceId }, data: { enabled: true } })
        if (dryRun) throw ROLLED_BACK
        await writeAudit(tx, { actorId, entityType: 'PosBookingLink', entityId: outletId, action: `pos.bookings.activate.${kind}`, after: { spaceId, carried: report.carried } })
      }, { maxWait: 30000, timeout: 120000 })
    } catch (error) {
      if (error === ROLLED_BACK) return { ...report, preview: true }
      if (error instanceof PosServiceError && report?.conflicts?.length) Object.assign(error, { report })
      throw error
    }
    return report
  }

  const preview = (args) => run({ ...args, dryRun: true })
  const activate = async (args) => {
    const report = await run({ ...args, dryRun: false })
    if (onChanged && report.spaceId) for (const id of await bookingIdsOf(report.spaceId)) await onChanged(id)
    return report
  }
  const bookingIdsOf = async (spaceId) => (await prisma.$queryRaw`SELECT id FROM booking WHERE space_id = ${spaceId}::uuid AND status IN ('PENDING', 'CONFIRMED')`).map((r) => r.id)

  // Back to the legacy tables without losing anything booked meanwhile. The engine keeps
  // its bookings (history, calendar); its space stops taking public bookings.
  async function rollback({ companyId, actorId, outletId, kind }) {
    const scoped = requireCompanyId(companyId)
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pos-booking-link:${scoped}:${outletId}:${kind}`}, 0))::text`
      const link = await tx.posBookingLink.findUnique({ where: { companyId_outletId_kind: { companyId: scoped, outletId, kind } } })
      if (!link || link.mode !== 'engine') throw new PosServiceError('Esta sucursal no usa el motor de reservaciones.', 409)
      const live = await tx.$queryRaw`
        SELECT b.*, (SELECT pbt.table_id FROM booking_allocation a JOIN pos_booking_table pbt ON pbt.resource_id = a.resource_id WHERE a.booking_id = b.id AND a.active LIMIT 1) AS table_id
          FROM booking b WHERE b.company_id = ${scoped}::uuid AND b.space_id = ${link.spaceId}::uuid AND b.status IN ('PENDING', 'CONFIRMED') AND b.ends_at > now()`
      let copied = 0, updated = 0
      for (const b of live) {
        const minutes = Math.round((new Date(b.ends_at) - new Date(b.starts_at)) / M)
        if (kind === 'tables') {
          const row = await tx.posReservation.findFirst({ where: { companyId: scoped, OR: [{ bookingId: b.id }, ...(b.source_id ? [{ id: b.source_id }] : [])] } })
          const data = { tableId: b.table_id ?? null, guestName: b.guest_name ?? 'Cliente', guestPhone: b.guest_phone, partySize: b.party_size, scheduledAt: b.starts_at, durationMinutes: minutes, notes: b.notes, status: b.pos_order_id ? 'SEATED' : 'CONFIRMED', orderId: b.pos_order_id ?? null, bookingId: b.id }
          if (row) { await tx.posReservation.update({ where: { id: row.id }, data }); updated++ }
          else { await tx.posReservation.create({ data: { companyId: scoped, outletId, createdById: b.created_by_id ?? actorId, ...data } }); copied++ }
        } else {
          const row = await tx.posAppointment.findFirst({ where: { companyId: scoped, bookingId: b.id } })
          if (row) { await tx.posAppointment.update({ where: { id: row.id }, data: { startsAt: b.starts_at, durationMinutes: minutes } }); updated++ }
          else { await tx.posAppointment.create({ data: { companyId: scoped, outletId, contactId: b.contact_id, customerName: b.guest_name ?? 'Cliente', customerPhone: b.guest_phone, startsAt: b.starts_at, durationMinutes: minutes, notes: b.notes, createdById: b.created_by_id ?? actorId, bookingId: b.id } }); copied++ }
        }
      }
      await tx.posBookingLink.update({ where: { id: link.id }, data: { mode: 'legacy', rolledBackAt: new Date() } })
      await tx.bookingSpace.update({ where: { id: link.spaceId }, data: { published: false } })
      await writeAudit(tx, { actorId, entityType: 'PosBookingLink', entityId: outletId, action: `pos.bookings.rollback.${kind}`, after: { copied, updated } })
      return { copied, updated, live: live.length }
    }, { maxWait: 30000, timeout: 120000 })
  }

  return { links, preview, activate, rollback }
}
