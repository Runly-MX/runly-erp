// Advisory availability read. Booking writes re-validate everything inside their
// own transaction (bookings-command-service.js); this answer can be stale.
import { BookingError, eligibleResources, loadResourceWindows, notFound, policyOf } from './bookings-core.js'
import { cutSlots } from './bookings-slots.js'

const M = 60000

// Allocations that really occupy resources: active, minus PENDING holds past expiry.
export async function loadBusy(db, { companyId, resourceIds, from, to }) {
  if (!resourceIds.length) return new Map()
  const rows = await db.$queryRaw`
    SELECT a.resource_id, lower(a.during) AS starts_at, upper(a.during) AS ends_at
      FROM booking_allocation a
      LEFT JOIN booking b ON b.id = a.booking_id
     WHERE a.company_id = ${companyId}::uuid AND a.active
       AND a.resource_id = ANY(${resourceIds}::uuid[])
       AND a.during && tstzrange(${new Date(from)}::timestamptz, ${new Date(to)}::timestamptz, '[)')
       AND NOT COALESCE(b.status = 'PENDING' AND b.hold_expires_at < now(), false)`
  const busy = new Map(resourceIds.map((id) => [id, []]))
  for (const row of rows) busy.get(row.resource_id)?.push({ start: new Date(row.starts_at).getTime(), end: new Date(row.ends_at).getTime() })
  return busy
}

export function bookingWindowLimits(space, now = Date.now()) {
  const policy = policyOf(space)
  return { notBefore: now + policy.leadMinutes * M, notAfter: now + policy.horizonDays * 1440 * M }
}

export function createBookingsAvailabilityService({ prisma }) {
  async function loadService(db, { companyId, spaceId, serviceId }) {
    const rows = await db.$queryRaw`
      SELECT * FROM booking_service WHERE id = ${serviceId}::uuid AND company_id = ${companyId}::uuid AND space_id = ${spaceId}::uuid AND enabled = true`
    if (!rows[0]) throw notFound('Servicio')
    return rows[0]
  }

  async function availability({ companyId, space, query }) {
    if (!space.enabled) throw new BookingError('El sistema de reservaciones está desactivado.', 409, 'SPACE_DISABLED')
    const service = await loadService(prisma, { companyId, spaceId: space.id, serviceId: query.serviceId })
    const { notBefore, notAfter } = bookingWindowLimits(space)
    const from = Math.max(new Date(query.from).getTime(), notBefore), to = Math.min(new Date(query.to).getTime(), notAfter)
    if (service.kind === 'session') {
      const sessions = to <= from ? [] : await prisma.$queryRaw`
        SELECT id, resource_id, starts_at, ends_at, capacity, seats_taken FROM booking_session
         WHERE company_id = ${companyId}::uuid AND service_id = ${service.id}::uuid AND status = 'scheduled'
           AND starts_at >= ${new Date(from)} AND starts_at < ${new Date(to)}
         ORDER BY starts_at`
      return {
        kind: 'session',
        sessions: sessions.map((s) => ({ id: s.id, resourceId: s.resource_id, startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, seatsLeft: s.capacity - s.seats_taken })),
      }
    }
    // partySize keeps only resources with room; durationMinutes (staff only) replaces the service length.
    const durationMinutes = query.durationMinutes ?? service.duration_minutes
    let resources = await eligibleResources(prisma, { companyId, spaceId: space.id, serviceId: service.id, partySize: query.partySize ?? null })
    if (query.resourceId) resources = resources.filter((r) => r.id === query.resourceId)
    if (to <= from || !resources.length) return { kind: 'appointment', slots: [] }
    const ids = resources.map((r) => r.id)
    const pad = (service.buffer_before_minutes + service.buffer_after_minutes + durationMinutes) * M
    const [windows, busy] = await Promise.all([
      loadResourceWindows(prisma, { companyId, space, resourceIds: ids, from, to }),
      loadBusy(prisma, { companyId, resourceIds: ids, from: from - pad, to: to + pad }),
    ])
    const bySlot = new Map()
    for (const id of ids) {
      for (const slot of cutSlots({
        windows: windows.get(id), busy: busy.get(id), durationMs: durationMinutes * M,
        bufferBeforeMs: service.buffer_before_minutes * M, bufferAfterMs: service.buffer_after_minutes * M,
        stepMs: service.slot_step_minutes * M, notBefore: from, notAfter: to - 1,
      })) {
        const entry = bySlot.get(slot.start) ?? { startsAt: new Date(slot.start), endsAt: new Date(slot.end), resourceIds: [] }
        entry.resourceIds.push(id)
        bySlot.set(slot.start, entry)
      }
    }
    return { kind: 'appointment', slots: [...bySlot.keys()].sort((a, b) => a - b).map((k) => bySlot.get(k)) }
  }

  return { availability, loadService }
}
