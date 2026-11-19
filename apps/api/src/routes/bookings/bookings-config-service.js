// runly.bookings configuration: spaces, members, resources, services, weekly
// hours and exceptions. Every lookup is scoped by company; the composite foreign
// keys reject any cross-company reference that slipped past these checks.
import { BookingError, notFound, serializeBooking } from './bookings-core.js'

const pick = (input, map) => Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]))

export function createBookingsConfigService({ prisma }) {
  async function assertTimezone(timezone) {
    const rows = await prisma.$queryRaw`SELECT 1 AS ok FROM pg_timezone_names WHERE name = ${timezone} LIMIT 1`
    if (!rows.length) throw new BookingError('La zona horaria no es válida (usa un nombre IANA, por ejemplo America/Mexico_City).', 422, 'INVALID_TIMEZONE')
  }

  function uniqueSlug(error) {
    if (error?.code === 'P2002') throw new BookingError('Ya existe un sistema con ese identificador.', 409, 'SLUG_TAKEN')
    throw error
  }

  async function listSpaces({ companyId, userId, all }) {
    return prisma.bookingSpace.findMany({
      where: { companyId, ...(all ? {} : { id: { in: (await prisma.bookingSpaceMember.findMany({ where: { companyId, userId }, select: { spaceId: true } })).map((m) => m.spaceId) } }) },
      orderBy: { name: 'asc' },
    })
  }

  async function createSpace({ companyId, userId, input }) {
    await assertTimezone(input.timezone)
    return prisma.$transaction(async (tx) => {
      const space = await tx.bookingSpace.create({ data: { companyId, name: input.name, slug: input.slug, description: input.description ?? null, mode: input.mode, timezone: input.timezone, policy: input.policy ?? {}, createdById: userId } })
      await tx.bookingSpaceMember.create({ data: { companyId, spaceId: space.id, userId, role: 'admin' } })
      return space
    }).catch(uniqueSlug)
  }

  async function updateSpace({ companyId, spaceId, input }) {
    if (input.timezone) await assertTimezone(input.timezone)
    const data = pick(input, { name: 'name', slug: 'slug', description: 'description', mode: 'mode', timezone: 'timezone', policy: 'policy', published: 'published', enabled: 'enabled' })
    const result = await prisma.bookingSpace.updateMany({ where: { id: spaceId, companyId }, data }).catch(uniqueSlug)
    if (!result.count) throw notFound('Sistema de reservaciones')
    return prisma.bookingSpace.findFirst({ where: { id: spaceId, companyId } })
  }

  async function listMembers({ companyId, spaceId }) {
    return prisma.$queryRaw`
      SELECT m.user_id AS "userId", m.role, u.display_name AS "displayName"
        FROM booking_space_member m JOIN user_profile u ON u.id = m.user_id
       WHERE m.company_id = ${companyId}::uuid AND m.space_id = ${spaceId}::uuid
       ORDER BY u.display_name`
  }

  async function setMember({ companyId, spaceId, userId, role }) {
    const member = await prisma.membership.findFirst({ where: { companyId, userId, enabled: true }, select: { id: true } })
    if (!member) throw new BookingError('La persona no pertenece a esta empresa.', 422, 'NOT_COMPANY_MEMBER')
    return prisma.bookingSpaceMember.upsert({
      where: { spaceId_userId: { spaceId, userId } },
      update: { role },
      create: { companyId, spaceId, userId, role },
    })
  }

  async function removeMember({ companyId, spaceId, userId }) {
    await prisma.bookingSpaceMember.deleteMany({ where: { companyId, spaceId, userId } })
  }

  const listResources = ({ companyId }) => prisma.bookingResource.findMany({ where: { companyId }, orderBy: { name: 'asc' } })

  async function assertUser(companyId, userId) {
    if (!userId) return
    const member = await prisma.membership.findFirst({ where: { companyId, userId, enabled: true }, select: { id: true } })
    if (!member) throw new BookingError('La persona no pertenece a esta empresa.', 422, 'NOT_COMPANY_MEMBER')
  }

  async function createResource({ companyId, input }) {
    await assertUser(companyId, input.userId)
    return prisma.bookingResource.create({ data: { companyId, name: input.name, type: input.type, userId: input.userId ?? null } })
  }

  async function updateResource({ companyId, resourceId, input }) {
    await assertUser(companyId, input.userId)
    const result = await prisma.bookingResource.updateMany({ where: { id: resourceId, companyId }, data: pick(input, { name: 'name', type: 'type', userId: 'userId', enabled: 'enabled' }) })
    if (!result.count) throw notFound('Recurso')
    return prisma.bookingResource.findFirst({ where: { id: resourceId, companyId } })
  }

  async function assertResources(companyId, resourceIds) {
    const found = await prisma.bookingResource.count({ where: { companyId, id: { in: resourceIds } } })
    if (found !== new Set(resourceIds).size) throw notFound('Recurso')
  }

  async function setSpaceResources({ companyId, spaceId, resourceIds }) {
    await assertResources(companyId, resourceIds)
    await prisma.$transaction([
      prisma.bookingSpaceResource.deleteMany({ where: { companyId, spaceId, resourceId: { notIn: resourceIds } } }),
      prisma.bookingSpaceResource.createMany({ data: [...new Set(resourceIds)].map((resourceId) => ({ companyId, spaceId, resourceId })), skipDuplicates: true }),
    ])
    return prisma.bookingSpaceResource.findMany({ where: { companyId, spaceId } })
  }

  const listServices = ({ companyId, spaceId }) => prisma.bookingService.findMany({ where: { companyId, spaceId }, orderBy: { name: 'asc' } })

  async function getService({ companyId, serviceId }) {
    const service = await prisma.bookingService.findFirst({ where: { id: serviceId, companyId } })
    if (!service) throw notFound('Servicio')
    return service
  }

  async function createService({ companyId, spaceId, input }) {
    return prisma.bookingService.create({ data: { companyId, spaceId, ...input, capacity: input.kind === 'session' ? input.capacity : 1 } })
  }

  async function updateService({ companyId, serviceId, input }) {
    const current = await getService({ companyId, serviceId })
    const next = { ...current, ...input }
    if (next.maxParty < next.minParty) throw new BookingError('El máximo de personas no puede ser menor al mínimo.', 422, 'PARTY_SIZE')
    await prisma.bookingService.updateMany({ where: { id: serviceId, companyId }, data: { ...input, ...(current.kind === 'appointment' ? { capacity: 1 } : {}) } })
    return getService({ companyId, serviceId })
  }

  async function setServiceResources({ companyId, serviceId, resourceIds }) {
    await getService({ companyId, serviceId })
    await assertResources(companyId, resourceIds)
    await prisma.$transaction([
      prisma.bookingServiceResource.deleteMany({ where: { companyId, serviceId, resourceId: { notIn: resourceIds } } }),
      prisma.bookingServiceResource.createMany({ data: [...new Set(resourceIds)].map((resourceId) => ({ companyId, serviceId, resourceId })), skipDuplicates: true }),
    ])
    return prisma.bookingServiceResource.findMany({ where: { companyId, serviceId } })
  }

  async function getSchedule({ companyId, spaceId = null, resourceId = null }) {
    return prisma.$queryRaw`
      SELECT weekday, to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
        FROM booking_schedule_rule
       WHERE company_id = ${companyId}::uuid AND (space_id = ${spaceId}::uuid OR resource_id = ${resourceId}::uuid)
       ORDER BY weekday, start_time`
  }

  // Replaces the weekly hours of one owner (space or resource) atomically.
  async function setSchedule({ companyId, spaceId = null, resourceId = null, rules }) {
    if (resourceId && !(await prisma.bookingResource.count({ where: { id: resourceId, companyId } }))) throw notFound('Recurso')
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM booking_schedule_rule WHERE company_id = ${companyId}::uuid AND (space_id = ${spaceId}::uuid OR resource_id = ${resourceId}::uuid)`
      for (const rule of rules) {
        await tx.$executeRaw`
          INSERT INTO booking_schedule_rule (company_id, space_id, resource_id, weekday, start_time, end_time)
          VALUES (${companyId}::uuid, ${spaceId}::uuid, ${resourceId}::uuid, ${rule.weekday}, ${rule.startTime}::time, ${rule.endTime}::time)`
      }
    })
    return getSchedule({ companyId, spaceId, resourceId })
  }

  async function listExceptions({ companyId, spaceId, from, to }) {
    return prisma.$queryRaw`
      SELECT e.id, e.space_id AS "spaceId", e.resource_id AS "resourceId", e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.kind, e.reason
        FROM booking_exception e
       WHERE e.company_id = ${companyId}::uuid
         AND (e.space_id = ${spaceId}::uuid OR e.resource_id IN (SELECT resource_id FROM booking_space_resource WHERE space_id = ${spaceId}::uuid))
         AND (${from ?? null}::timestamptz IS NULL OR e.ends_at > ${from ?? null}::timestamptz)
         AND (${to ?? null}::timestamptz IS NULL OR e.starts_at < ${to ?? null}::timestamptz)
       ORDER BY e.starts_at`
  }

  async function createException({ companyId, input }) {
    if (input.resourceId && !(await prisma.bookingResource.count({ where: { id: input.resourceId, companyId } }))) throw notFound('Recurso')
    return prisma.bookingException.create({ data: { companyId, spaceId: input.spaceId ?? null, resourceId: input.resourceId ?? null, startsAt: input.startsAt, endsAt: input.endsAt, kind: input.kind, reason: input.reason ?? null } })
  }

  async function getException({ companyId, exceptionId }) {
    const row = await prisma.bookingException.findFirst({ where: { id: exceptionId, companyId } })
    if (!row) throw notFound('Excepción')
    return row
  }

  const deleteException = ({ companyId, exceptionId }) => prisma.bookingException.deleteMany({ where: { id: exceptionId, companyId } })

  const listSessions = ({ companyId, spaceId, from, to }) => prisma.bookingSession.findMany({
    where: { companyId, spaceId, ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}) },
    orderBy: { startsAt: 'asc' },
  })

  async function getSession({ companyId, sessionId }) {
    const row = await prisma.bookingSession.findFirst({ where: { id: sessionId, companyId } })
    if (!row) throw notFound('Sesión')
    return row
  }

  async function listBookings({ companyId, spaceId, from, to, status }) {
    const rows = await prisma.$queryRaw`
      SELECT b.*, COALESCE(array_agg(a.resource_id ORDER BY a.resource_id) FILTER (WHERE a.id IS NOT NULL), '{}') AS resource_ids
        FROM booking b LEFT JOIN booking_allocation a ON a.booking_id = b.id AND a.active
       WHERE b.company_id = ${companyId}::uuid AND b.space_id = ${spaceId}::uuid
         AND (${from ?? null}::timestamptz IS NULL OR b.ends_at > ${from ?? null}::timestamptz)
         AND (${to ?? null}::timestamptz IS NULL OR b.starts_at < ${to ?? null}::timestamptz)
         AND (${status ?? null}::booking_status IS NULL OR b.status = ${status ?? null}::booking_status)
       GROUP BY b.id ORDER BY b.starts_at LIMIT 1000`
    return rows.map((row) => serializeBooking(row, row.resource_ids))
  }

  async function bookingSpaceId({ companyId, bookingId }) {
    const row = await prisma.booking.findFirst({ where: { id: bookingId, companyId }, select: { spaceId: true } })
    if (!row) throw notFound('Reservación')
    return row.spaceId
  }

  const history = ({ companyId, bookingId }) => prisma.bookingHistory.findMany({ where: { companyId, bookingId }, orderBy: { createdAt: 'asc' } })

  return {
    listSpaces, createSpace, updateSpace, listMembers, setMember, removeMember,
    listResources, createResource, updateResource, setSpaceResources,
    listServices, getService, createService, updateService, setServiceResources,
    getSchedule, setSchedule, listExceptions, createException, getException, deleteException,
    listSessions, getSession, listBookings, bookingSpaceId, history,
  }
}
