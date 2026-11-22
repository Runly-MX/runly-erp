// runly.ticketing F6E: Calendar mirror of functions (never of tickets or attendees).
// Same contract as the Reservaciones mirror: source_module + source_entity_id, projected
// from current rows under a per-function advisory lock, so retries, replays and the worker
// converge on one event. A fingerprint of what is shown skips unchanged functions.
// Calendar is read-only here: editing or deleting the event never changes the function.
import crypto from 'node:crypto'
import { calendarFor } from '../bookings/bookings-calendar.js'

const SOURCE = 'runly.ticketing'
const COLOR = '#B45309'

export function sessionEventOf(row) {
  const cancelled = row.status === 'cancelled' || !row.event_enabled
  return {
    title: `${cancelled ? 'Cancelada · ' : ''}${row.title}`,
    description: [row.description ? String(row.description).slice(0, 500) : null, `Capacidad: ${row.capacity}`, row.published ? 'Venta pública en línea' : null].filter(Boolean).join('\n'),
    location: row.venue ?? null,
    startAt: new Date(row.starts_at),
    endAt: new Date(row.ends_at),
  }
}
const fingerprintOf = (row) => crypto.createHash('sha256').update(JSON.stringify([row.status, row.event_enabled, row.title, row.description, row.venue, row.published, row.capacity, new Date(row.starts_at).toISOString(), new Date(row.ends_at).toISOString(), row.space_name])).digest('hex')

export function createTicketingCalendarProjection({ prisma, log = console.error }) {
  async function project(sessionId) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ticketing.calendar:${sessionId}`}, 0))::text`
      const row = (await tx.$queryRaw`
        SELECT s.id, s.company_id, s.status, e.title, e.description, e.venue, e.published, e.enabled AS event_enabled, e.space_id,
               sp.name AS space_name, b.starts_at, b.ends_at, b.capacity
          FROM ticket_session s
          JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
          JOIN booking_space sp ON sp.id = e.space_id AND sp.company_id = s.company_id
          JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
         WHERE s.id = ${sessionId}::uuid`)[0]
      if (!row) return 'missing'
      const fingerprint = fingerprintOf(row)
      const synced = (await tx.$queryRaw`SELECT fingerprint FROM ticket_session_calendar_sync WHERE session_id = ${sessionId}::uuid`)[0]
      if (synced?.fingerprint === fingerprint) return 'current'
      const existing = await tx.calendarEvent.findMany({ where: { sourceModule: SOURCE, sourceEntityId: row.id }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      // The event's team calendar (same per-space calendar Reservaciones shares with members).
      const calendar = await calendarFor(tx, { id: row.space_id, name: row.space_name, companyId: row.company_id }, { label: 'Boletos' })
      let outcome
      if (!calendar) outcome = 'no-calendar'
      else {
        const data = { calendarId: calendar.id, color: COLOR, allDay: false, sourceModule: SOURCE, sourceEntityId: row.id, ...sessionEventOf(row) }
        const [keep, ...dupes] = existing
        if (keep) await tx.calendarEvent.update({ where: { id: keep.id }, data })
        else await tx.calendarEvent.create({ data })
        if (dupes.length) await tx.calendarEvent.deleteMany({ where: { id: { in: dupes.map((d) => d.id) } } })
        outcome = keep ? 'updated' : 'created'
      }
      await tx.$executeRaw`
        INSERT INTO ticket_session_calendar_sync (session_id, company_id, fingerprint, synced_at) VALUES (${row.id}::uuid, ${row.company_id}::uuid, ${fingerprint}, now())
        ON CONFLICT (session_id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, synced_at = now()`
      return outcome
    }, { maxWait: 15000, timeout: 30000 })
  }

  async function projectQuietly(sessionId) {
    try { return await project(sessionId) } catch (error) { log('[runly.ticketing] calendar sync failed:', error?.message ?? error); return 'error' }
  }
  async function projectEvent(eventId) {
    const sessions = await prisma.$queryRaw`SELECT id FROM ticket_session WHERE event_id = ${eventId}::uuid`
    for (const { id } of sessions) await projectQuietly(id)
  }

  // Worker: functions never projected, or of recently changed events (fingerprints decide).
  async function syncDue({ limit = 200 } = {}) {
    const due = await prisma.$queryRaw`
      SELECT s.id FROM ticket_session s
        JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
        JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
        LEFT JOIN ticket_session_calendar_sync c ON c.session_id = s.id
       WHERE c.session_id IS NULL OR greatest(s.updated_at, e.updated_at, b.updated_at) > c.synced_at
       ORDER BY s.created_at LIMIT ${limit}`
    const counts = { processed: due.length, failed: 0 }
    for (const { id } of due) {
      const outcome = await projectQuietly(id)
      const k = outcome === 'error' ? 'failed' : outcome
      counts[k] = (counts[k] ?? 0) + 1
    }
    return counts
  }

  return { project, projectQuietly, projectEvent, syncDue }
}
