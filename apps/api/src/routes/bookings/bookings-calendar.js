// Mirror of runly.bookings onto runly.calendar (same contract as the POS and fleet
// bridges: source_module + source_entity_id). Calendar is only a projection: the
// engine never reads it, so editing or deleting an event never changes availability.
// Each booking is projected from its current row (never from an event payload), under
// a per-booking advisory lock and a version check, so replays, out-of-order or
// concurrent runs converge on one event, and duplicates found are removed.
const SOURCE = 'runly.bookings'
const SHOWN = new Set(['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'])
const COLOR = '#0F766E'
const PREFIX = { PENDING: 'Pendiente · ' }
const SUFFIX = { COMPLETED: ' (completada)', NO_SHOW: ' (no se presentó)' }
const STATUS = { PENDING: 'Pendiente de confirmación', CONFIRMED: 'Confirmada', COMPLETED: 'Completada', NO_SHOW: 'No se presentó' }
const CHANNEL = { backoffice: 'Backoffice', portal: 'Portal de reservaciones', website: 'Sitio web', pos: 'Punto de venta', api: 'API' }

// Title and description carry no email, phone or notes: calendar viewers only
// need what and when (the backoffice keeps the customer's details).
export function calendarEventOf(row) {
  return {
    title: `${PREFIX[row.status] ?? ''}${row.service_name} · ${row.guest_name || 'Sin nombre'}${SUFFIX[row.status] ?? ''}`,
    description: [`Folio: ${row.reference}`, `Estado: ${STATUS[row.status]}`, row.party_size > 1 ? `Personas: ${row.party_size}` : null, `Canal: ${CHANNEL[row.channel] ?? row.channel}`].filter(Boolean).join('\n'),
    startAt: new Date(row.starts_at),
    endAt: new Date(row.ends_at),
  }
}

export function createBookingsCalendarProjection({ prisma, log = console.error }) {
  const configKey = (spaceId) => `bookings.calendarId.${spaceId}`

  // One calendar per space, owned by a space admin and shared (viewer) with the
  // space's current members only; whoever leaves the space loses it.
  async function calendarFor(tx, space) {
    const members = await tx.bookingSpaceMember.findMany({ where: { companyId: space.companyId, spaceId: space.id }, orderBy: { createdAt: 'asc' }, select: { userId: true, role: true } })
    const owner = (members.find((m) => m.role === 'admin') ?? members[0])?.userId
    if (!owner) return null
    const cfg = await tx.instanceConfig.findUnique({ where: { key: configKey(space.id) } })
    let calendar = cfg?.value ? await tx.calendarCalendar.findFirst({ where: { id: cfg.value, companyId: space.companyId, enabled: true }, select: { id: true, ownerId: true } }) : null
    if (!calendar) {
      calendar = await tx.calendarCalendar.create({ data: { ownerId: owner, companyId: space.companyId, name: `Reservaciones · ${space.name}`, color: COLOR, icon: 'CalendarCheck', isDefault: false }, select: { id: true, ownerId: true } })
      await tx.instanceConfig.upsert({ where: { key: configKey(space.id) }, update: { value: calendar.id }, create: { key: configKey(space.id), value: calendar.id } })
    } else if (!members.some((m) => m.userId === calendar.ownerId)) {
      calendar = await tx.calendarCalendar.update({ where: { id: calendar.id }, data: { ownerId: owner }, select: { id: true, ownerId: true } })
    }
    const wanted = new Set(members.map((m) => m.userId).filter((id) => id !== calendar.ownerId))
    const have = new Set((await tx.calendarShare.findMany({ where: { calendarId: calendar.id }, select: { userId: true } })).map((s) => s.userId))
    const gone = [...have].filter((id) => !wanted.has(id))
    if (gone.length) await tx.calendarShare.deleteMany({ where: { calendarId: calendar.id, userId: { in: gone } } })
    const added = [...wanted].filter((id) => !have.has(id))
    if (added.length) await tx.calendarShare.createMany({ data: added.map((userId) => ({ calendarId: calendar.id, userId, role: 'VIEWER' })), skipDuplicates: true })
    return calendar
  }

  async function project(bookingId) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bookings.calendar:${bookingId}`}, 0))::text`
      const row = (await tx.$queryRaw`
        SELECT b.id, b.company_id, b.status::text AS status, b.starts_at, b.ends_at, b.party_size, b.reference, b.channel, b.guest_name, b.version,
               sv.name AS service_name, s.id AS space_id, s.name AS space_name
          FROM booking b
          JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
          JOIN booking_space s ON s.id = b.space_id AND s.company_id = b.company_id
         WHERE b.id = ${bookingId}::uuid`)[0]
      if (!row) return 'missing'
      const synced = (await tx.$queryRaw`SELECT version FROM booking_calendar_sync WHERE booking_id = ${bookingId}::uuid`)[0]
      if (synced && synced.version >= row.version) return 'current'
      const existing = await tx.calendarEvent.findMany({ where: { sourceModule: SOURCE, sourceEntityId: row.id }, orderBy: { createdAt: 'asc' }, select: { id: true } })
      let outcome = 'removed'
      if (SHOWN.has(row.status)) {
        // shortcut: a space without members has no calendar owner; its bookings are marked
        // synced and appear once they change again after someone joins the space.
        const calendar = await calendarFor(tx, { id: row.space_id, name: row.space_name, companyId: row.company_id })
        if (calendar) {
          const data = { calendarId: calendar.id, color: COLOR, allDay: false, sourceModule: SOURCE, sourceEntityId: row.id, ...calendarEventOf(row) }
          if (existing[0]) await tx.calendarEvent.update({ where: { id: existing[0].id }, data })
          else await tx.calendarEvent.create({ data })
          if (existing.length > 1) await tx.calendarEvent.deleteMany({ where: { id: { in: existing.slice(1).map((e) => e.id) } } })
          outcome = existing[0] ? 'updated' : 'created'
        } else outcome = 'no-calendar'
      } else if (existing.length) {
        await tx.calendarEvent.deleteMany({ where: { sourceModule: SOURCE, sourceEntityId: row.id } })
      }
      await tx.$executeRaw`
        INSERT INTO booking_calendar_sync (booking_id, company_id, version, synced_at) VALUES (${row.id}::uuid, ${row.company_id}::uuid, ${row.version}, now())
        ON CONFLICT (booking_id) DO UPDATE SET version = EXCLUDED.version, synced_at = now()`
      return outcome
    }, { maxWait: 15000, timeout: 30000 })
  }

  // Best effort right after a command commits; never throws into the caller.
  async function projectQuietly(bookingId) {
    try { return await project(bookingId) } catch (error) { log('[runly.bookings] calendar sync failed:', error?.message ?? error); return 'error' }
  }

  // Worker: everything not yet mirrored at its current version (holds expired by the
  // engine, crashes between commit and projection, bookings from before phase 4).
  async function syncDue({ limit = 200 } = {}) {
    const due = await prisma.$queryRaw`
      SELECT b.id FROM booking b LEFT JOIN booking_calendar_sync s ON s.booking_id = b.id
       WHERE b.updated_at > now() - interval '35 days' AND (s.booking_id IS NULL OR s.version < b.version)
       ORDER BY b.updated_at LIMIT ${limit}`
    const counts = { processed: due.length, created: 0, updated: 0, removed: 0, failed: 0 }
    for (const { id } of due) {
      const outcome = await projectQuietly(id)
      if (outcome === 'error') counts.failed++
      else if (counts[outcome] !== undefined) counts[outcome]++
    }
    return counts
  }

  return { project, projectQuietly, syncDue }
}
