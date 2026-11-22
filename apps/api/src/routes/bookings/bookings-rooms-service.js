// Room and equipment reservations by employees (v1.2 R1). A "resources" space owns one
// hidden internal service; every reservation is an engine booking on it with the
// resource pinned and the length chosen by the employee, so the exclusion constraint on
// booking_allocation is the only guard against overlaps (as for every other booking).
// Title, organizer and participants are written in the engine transaction (sideEffect).
import { BookingError, loadResourceWindows, notFound } from './bookings-core.js'

const M = 60000
const MAX_AGENDA_DAYS = 8

// Who may reserve in a resources space: its members, and (policy.reservers = company,
// the default) anybody of the company who reached these routes (bookings.reserve or .access).
export function roomAccess(space, { isAdmin = false } = {}) {
  const role = isAdmin ? 'admin' : space.member_role ?? null
  const reservers = space.policy?.reservers ?? 'company'
  return { role, canReserve: Boolean(role) || reservers === 'company', canManage: role === 'admin' || role === 'agent' }
}

export function createBookingsRoomsService({ prisma, commands, now = () => Date.now() }) {
  async function loadRoomSpace(companyId, spaceId, userId, isAdmin) {
    const space = (await prisma.$queryRaw`
      SELECT s.*, m.role AS member_role FROM booking_space s
        LEFT JOIN booking_space_member m ON m.space_id = s.id AND m.company_id = s.company_id AND m.user_id = ${userId}::uuid
       WHERE s.id = ${spaceId}::uuid AND s.company_id = ${companyId}::uuid AND s.purpose = 'resources'`)[0]
    if (!space) throw notFound('Sistema de salas y recursos')
    const access = roomAccess(space, { isAdmin })
    if (!access.canReserve) throw notFound('Sistema de salas y recursos')
    if (!space.enabled) throw new BookingError('Este sistema de reservaciones está desactivado.', 409, 'SPACE_DISABLED')
    return { space, ...access }
  }

  const resourcesOf = (companyId, spaceId) => prisma.$queryRaw`
    SELECT r.id, r.name, r.type, r.capacity FROM booking_resource r
      JOIN booking_space_resource sr ON sr.resource_id = r.id AND sr.company_id = r.company_id AND sr.space_id = ${spaceId}::uuid
     WHERE r.company_id = ${companyId}::uuid AND r.enabled ORDER BY r.name, r.id`

  async function listRooms({ companyId, userId, isAdmin }) {
    const spaces = await prisma.$queryRaw`
      SELECT s.*, m.role AS member_role FROM booking_space s
        LEFT JOIN booking_space_member m ON m.space_id = s.id AND m.company_id = s.company_id AND m.user_id = ${userId}::uuid
       WHERE s.company_id = ${companyId}::uuid AND s.purpose = 'resources' AND s.enabled ORDER BY s.name`
    const out = []
    for (const space of spaces) {
      const access = roomAccess(space, { isAdmin })
      if (!access.canReserve) continue
      out.push({ id: space.id, name: space.name, timezone: space.timezone, maxMinutes: Number(space.policy?.maxMinutes ?? 480), role: access.role, canManage: access.canManage, resources: await resourcesOf(companyId, space.id) })
    }
    return out
  }

  // Busy blocks of each resource in [from, to): from every space that shares the resource.
  // Details only for people involved (organizer, participants, managers of this space).
  async function agenda({ companyId, userId, isAdmin, spaceId, from, to }) {
    const { space, canManage } = await loadRoomSpace(companyId, spaceId, userId, isAdmin)
    if (to <= from || to - from > MAX_AGENDA_DAYS * 86400000) throw new BookingError(`Consulta hasta ${MAX_AGENDA_DAYS} días a la vez.`, 422, 'RANGE')
    const resources = await resourcesOf(companyId, space.id)
    const ids = resources.map((r) => r.id)
    const windows = ids.length ? await loadResourceWindows(prisma, { companyId, space, resourceIds: ids, from: new Date(from), to: new Date(to) }) : new Map()
    const busy = ids.length ? await prisma.$queryRaw`
      SELECT a.resource_id, lower(a.during) AS starts_at, upper(a.during) AS ends_at, b.id AS booking_id, b.space_id, b.status::text AS status,
             b.title, b.organizer_id, p.display_name AS organizer_name, b.session_id IS NOT NULL OR a.session_id IS NOT NULL AS is_session,
             EXISTS (SELECT 1 FROM booking_participant bp WHERE bp.booking_id = b.id AND bp.user_id = ${userId}::uuid) AS participant
        FROM booking_allocation a
        LEFT JOIN booking b ON b.id = a.booking_id
        LEFT JOIN user_profile p ON p.id = b.organizer_id
       WHERE a.company_id = ${companyId}::uuid AND a.active AND a.resource_id = ANY(${ids}::uuid[])
         AND a.during && tstzrange(${new Date(from)}::timestamptz, ${new Date(to)}::timestamptz, '[)')
       ORDER BY lower(a.during)` : []
    return {
      space: { id: space.id, name: space.name, timezone: space.timezone, maxMinutes: Number(space.policy?.maxMinutes ?? 480), canManage },
      resources: resources.map((r) => ({
        ...r,
        hours: (windows.get(r.id) ?? []).map((w) => ({ start: new Date(w.start), end: new Date(w.end) })),
        busy: busy.filter((b) => b.resource_id === r.id).map((b) => {
          const mine = b.organizer_id === userId || b.participant
          const visible = mine || (canManage && b.space_id === space.id)
          return {
            start: b.starts_at, end: b.ends_at, status: b.status, mine,
            ...(visible ? { bookingId: b.booking_id, title: b.title } : {}),
            label: visible && b.title ? b.title : 'Reservado',
            organizerName: b.organizer_name ?? null,
          }
        }),
      })),
    }
  }

  async function assertPeople(companyId, ids) {
    if (!ids.length) return
    const found = (await prisma.$queryRaw`
      SELECT count(*)::int AS n FROM membership m JOIN user_profile p ON p.id = m.user_id
       WHERE m.company_id = ${companyId}::uuid AND m.enabled AND NOT p.is_bot AND m.user_id = ANY(${ids}::uuid[])`)[0].n
    if (found !== ids.length) throw new BookingError('Alguna persona no pertenece a esta empresa.', 422, 'NOT_COMPANY_MEMBER')
  }

  function lengthMinutes(space, startsAt, endsAt) {
    const minutes = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / M
    const max = Number(space.policy?.maxMinutes ?? 480)
    if (minutes < 15) throw new BookingError('La reservación dura al menos 15 minutos.', 422, 'DURATION')
    if (minutes > max) throw new BookingError(`La reservación dura como máximo ${max / 60 >= 1 && max % 60 === 0 ? `${max / 60} h` : `${max} min`}.`, 422, 'DURATION')
    return minutes
  }

  async function create({ companyId, actorId, isAdmin, spaceId, input, idempotencyKey }) {
    const { space, canManage } = await loadRoomSpace(companyId, spaceId, actorId, isAdmin)
    const organizerId = input.organizerId ?? actorId
    if (organizerId !== actorId && !canManage) throw new BookingError('Solo quien administra el sistema puede reservar a nombre de otra persona.', 403, 'FORBIDDEN')
    const participantIds = [...new Set(input.participantIds ?? [])].filter((id) => id !== organizerId)
    await assertPeople(companyId, [...new Set([organizerId, ...participantIds])])
    const durationMinutes = lengthMinutes(space, input.startsAt, input.endsAt)
    const partySize = Math.max(input.headcount ?? 1, 1 + participantIds.length)
    // The engine only says "not eligible" for a pinned resource that is too small; say why.
    const resource = (await resourcesOf(companyId, space.id)).find((r) => r.id === input.resourceId)
    if (!resource) throw new BookingError('Ese recurso no pertenece a este sistema.', 422, 'RESOURCE_NOT_ELIGIBLE')
    if (resource.capacity != null && partySize > resource.capacity) throw new BookingError(`«${resource.name}» tiene lugar para ${resource.capacity} personas.`, 422, 'NO_CAPACITY')
    const service = (await prisma.$queryRaw`SELECT id FROM booking_service WHERE company_id = ${companyId}::uuid AND space_id = ${space.id}::uuid AND internal`)[0]
    if (!service) throw new BookingError('Este sistema no tiene configurada la reservación de recursos.', 409, 'NO_INTERNAL_SERVICE')
    const organizer = (await prisma.$queryRaw`SELECT display_name FROM user_profile WHERE id = ${organizerId}::uuid`)[0]
    const result = await commands.create({
      companyId, actorId, spaceId: space.id, idempotencyKey, channel: 'backoffice',
      input: {
        serviceId: service.id, resourceId: input.resourceId, startsAt: new Date(input.startsAt).toISOString(), durationMinutes,
        partySize, guestName: organizer?.display_name ?? null, notes: input.notes ?? null,
        // In the hash so a reused key with other people or another motive is refused.
        title: input.title, organizerId, participantIds,
      },
      sideEffect: async (tx, row) => {
        await tx.$executeRaw`UPDATE booking SET title = ${input.title}, organizer_id = ${organizerId}::uuid WHERE id = ${row.id}::uuid`
        for (const userId of participantIds) {
          await tx.$executeRaw`INSERT INTO booking_participant (company_id, booking_id, user_id) VALUES (${companyId}::uuid, ${row.id}::uuid, ${userId}::uuid) ON CONFLICT DO NOTHING`
        }
      },
    })
    return { reservation: await view(companyId, result.booking.id), replayed: result.replayed }
  }

  // Organizer or a manager of the reservation's space; others never learn it exists.
  async function loadOwned(companyId, actorId, isAdmin, bookingId) {
    const row = (await prisma.$queryRaw`
      SELECT b.id, b.space_id, b.organizer_id, b.starts_at, b.ends_at FROM booking b JOIN booking_space s ON s.id = b.space_id AND s.company_id = b.company_id
       WHERE b.id = ${bookingId}::uuid AND b.company_id = ${companyId}::uuid AND s.purpose = 'resources'`)[0]
    if (!row) throw notFound('Reservación')
    const { space, canManage } = await loadRoomSpace(companyId, row.space_id, actorId, isAdmin).catch(() => { throw notFound('Reservación') })
    if (row.organizer_id !== actorId && !canManage) throw notFound('Reservación')
    return { row, space }
  }

  async function cancel({ companyId, actorId, isAdmin, bookingId, reason = null, idempotencyKey }) {
    await loadOwned(companyId, actorId, isAdmin, bookingId)
    await commands.transition({ companyId, actorId, bookingId, to: 'CANCELLED', input: { reason }, idempotencyKey })
    return view(companyId, bookingId)
  }

  async function reschedule({ companyId, actorId, isAdmin, bookingId, input, idempotencyKey }) {
    const { space } = await loadOwned(companyId, actorId, isAdmin, bookingId)
    const durationMinutes = lengthMinutes(space, input.startsAt, input.endsAt)
    const current = (await prisma.$queryRaw`SELECT resource_id FROM booking_allocation WHERE booking_id = ${bookingId}::uuid AND active LIMIT 1`)[0]
    await commands.reschedule({ companyId, actorId, bookingId, idempotencyKey, input: { startsAt: new Date(input.startsAt).toISOString(), durationMinutes, resourceId: input.resourceId ?? current?.resource_id } })
    return view(companyId, bookingId)
  }

  async function viewMany(companyId, ids) {
    if (!ids.length) return []
    const rows = await prisma.$queryRaw`
      SELECT b.id, b.reference, b.status::text AS status, b.starts_at, b.ends_at, b.title, b.party_size, b.notes, b.organizer_id, b.space_id, b.version,
             s.name AS space_name, s.timezone, p.display_name AS organizer_name, res.id AS resource_id, res.name AS resource_name,
             COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.display_name) ORDER BY u.display_name)
                         FROM booking_participant bp JOIN user_profile u ON u.id = bp.user_id WHERE bp.booking_id = b.id), '[]'::json) AS participants
        FROM booking b JOIN booking_space s ON s.id = b.space_id LEFT JOIN user_profile p ON p.id = b.organizer_id
        LEFT JOIN LATERAL (SELECT r.id, r.name FROM booking_allocation a JOIN booking_resource r ON r.id = a.resource_id
                            WHERE a.booking_id = b.id ORDER BY a.active DESC, a.id DESC LIMIT 1) res ON true
       WHERE b.id = ANY(${ids}::uuid[]) AND b.company_id = ${companyId}::uuid
       ORDER BY b.starts_at`
    return rows.map((r) => ({
      id: r.id, reference: r.reference, status: r.status, startsAt: r.starts_at, endsAt: r.ends_at, title: r.title, headcount: r.party_size, notes: r.notes,
      organizerId: r.organizer_id, organizerName: r.organizer_name, spaceId: r.space_id, spaceName: r.space_name, timezone: r.timezone,
      resourceId: r.resource_id, resourceName: r.resource_name, participants: r.participants, version: r.version,
    }))
  }
  async function view(companyId, bookingId) {
    const [r] = await viewMany(companyId, [bookingId])
    if (!r) throw notFound('Reservación')
    return r
  }

  // Upcoming reservations where I organize or take part.
  async function mine({ companyId, userId }) {
    const rows = await prisma.$queryRaw`
      SELECT b.id FROM booking b JOIN booking_space s ON s.id = b.space_id AND s.company_id = b.company_id AND s.purpose = 'resources'
       WHERE b.company_id = ${companyId}::uuid AND b.status IN ('PENDING', 'CONFIRMED') AND b.ends_at > ${new Date(now())}
         AND (b.organizer_id = ${userId}::uuid OR EXISTS (SELECT 1 FROM booking_participant bp WHERE bp.booking_id = b.id AND bp.user_id = ${userId}::uuid))
       ORDER BY b.starts_at LIMIT 100`
    return (await viewMany(companyId, rows.map((r) => r.id))).map((r) => ({ ...r, isOrganizer: r.organizerId === userId }))
  }

  return { listRooms, agenda, create, cancel, reschedule, mine, view }
}

