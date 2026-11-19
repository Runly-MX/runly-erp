// runly.bookings configuration: spaces, members, resources, services, weekly
// hours and exceptions. Every lookup is scoped by company; the composite foreign
// keys reject any cross-company reference that slipped past these checks.
import { BookingError, notFound, serializeBooking } from './bookings-core.js'

const pick = (input, map) => Object.fromEntries(Object.entries(map).filter(([key]) => input[key] !== undefined).map(([key, column]) => [column, input[key]]))

export function createBookingsConfigService({ prisma, cacheDel = null }) {
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
      await syncAccessGrant(tx, { companyId, userId, actorId: userId })
      return space
    }).catch(uniqueSlug)
  }

  async function updateSpace({ companyId, spaceId, input }) {
    if (input.timezone) await assertTimezone(input.timezone)
    const data = pick(input, { name: 'name', slug: 'slug', description: 'description', mode: 'mode', timezone: 'timezone', policy: 'policy', published: 'published', enabled: 'enabled' })
    const before = await prisma.bookingSpace.findFirst({ where: { id: spaceId, companyId }, select: { policy: true } })
    const result = await prisma.bookingSpace.updateMany({ where: { id: spaceId, companyId }, data }).catch(uniqueSlug)
    if (!result.count) throw notFound('Sistema de reservaciones')
    // Customers accepted the previous cut-offs: new policies need a new acceptance.
    if (input.policy && JSON.stringify(before?.policy ?? {}) !== JSON.stringify(input.policy)) {
      await prisma.bookingPage.updateMany({ where: { companyId, spaceId }, data: { policyVersion: { increment: 1 } } })
    }
    return prisma.bookingSpace.findFirst({ where: { id: spaceId, companyId } })
  }

  async function listMembers({ companyId, spaceId }) {
    return prisma.$queryRaw`
      SELECT m.user_id AS "userId", m.role, u.display_name AS "displayName"
        FROM booking_space_member m JOIN user_profile u ON u.id = m.user_id
       WHERE m.company_id = ${companyId}::uuid AND m.space_id = ${spaceId}::uuid
       ORDER BY u.display_name`
  }

  // Space membership manages the per-user `bookings.access` grant (effective
  // permissions = role ∪ grants): added on the first space, removed with the last.
  async function syncAccessGrant(db, { companyId, userId, actorId }) {
    const permission = await db.permission.findUnique({ where: { key: 'bookings.access' }, select: { id: true } })
    if (!permission) return false
    const spaces = await db.bookingSpaceMember.count({ where: { companyId, userId } })
    if (spaces > 0) {
      await db.userPermissionGrant.upsert({
        where: { userId_companyId_permissionId: { userId, companyId, permissionId: permission.id } },
        update: {},
        create: { userId, companyId, permissionId: permission.id, grantedById: actorId ?? null },
      })
    } else {
      await db.userPermissionGrant.deleteMany({ where: { userId, companyId, permissionId: permission.id } })
    }
    return true
  }

  async function invalidateUser(userId) {
    if (!cacheDel) return
    const profile = await prisma.userProfile.findUnique({ where: { id: userId }, select: { authUserId: true } })
    if (profile?.authUserId) await cacheDel(`user_ctx:${profile.authUserId}`)
  }

  async function setMember({ companyId, spaceId, userId, role, actorId = null }) {
    const member = await prisma.membership.findFirst({ where: { companyId, userId, enabled: true }, select: { id: true } })
    if (!member) throw new BookingError('La persona no pertenece a esta empresa.', 422, 'NOT_COMPANY_MEMBER')
    const row = await prisma.$transaction(async (tx) => {
      const saved = await tx.bookingSpaceMember.upsert({
        where: { spaceId_userId: { spaceId, userId } },
        update: { role },
        create: { companyId, spaceId, userId, role },
      })
      await syncAccessGrant(tx, { companyId, userId, actorId })
      return saved
    })
    await invalidateUser(userId)
    return row
  }

  async function removeMember({ companyId, spaceId, userId }) {
    const admins = await prisma.bookingSpaceMember.count({ where: { companyId, spaceId, role: 'admin', userId: { not: userId } } })
    const target = await prisma.bookingSpaceMember.findFirst({ where: { companyId, spaceId, userId }, select: { role: true } })
    if (target?.role === 'admin' && admins === 0) throw new BookingError('El sistema necesita al menos un administrador.', 409, 'LAST_ADMIN')
    await prisma.$transaction(async (tx) => {
      await tx.bookingSpaceMember.deleteMany({ where: { companyId, spaceId, userId } })
      await syncAccessGrant(tx, { companyId, userId })
    })
    await invalidateUser(userId)
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

  async function listServices({ companyId, spaceId }) {
    const services = await prisma.bookingService.findMany({ where: { companyId, spaceId }, orderBy: { name: 'asc' } })
    const links = await prisma.bookingServiceResource.findMany({ where: { companyId, serviceId: { in: services.map((s) => s.id) } }, select: { serviceId: true, resourceId: true } })
    return services.map((s) => ({ ...s, resourceIds: links.filter((l) => l.serviceId === s.id).map((l) => l.resourceId) }))
  }

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
      SELECT weekday, to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime",
             to_char(valid_from, 'YYYY-MM-DD') AS "validFrom", to_char(valid_to, 'YYYY-MM-DD') AS "validTo"
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
          INSERT INTO booking_schedule_rule (company_id, space_id, resource_id, weekday, start_time, end_time, valid_from, valid_to)
          VALUES (${companyId}::uuid, ${spaceId}::uuid, ${resourceId}::uuid, ${rule.weekday}, ${rule.startTime}::time, ${rule.endTime}::time,
                  ${rule.validFrom ?? null}::date, ${rule.validTo ?? null}::date)`
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

  // Search inside one space. resourceId matches the active allocation or, for
  // session bookings, the session's resource.
  async function listBookings({ companyId, spaceId, from, to, status, serviceId, resourceId, q, limit = 1000, offset = 0 }) {
    const like = q ? `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%` : null
    const rows = await prisma.$queryRaw`
      SELECT b.*, COALESCE(array_agg(a.resource_id ORDER BY a.resource_id) FILTER (WHERE a.id IS NOT NULL), '{}') AS resource_ids,
             s.resource_id AS session_resource_id, count(*) OVER () AS total
        FROM booking b
        LEFT JOIN booking_allocation a ON a.booking_id = b.id AND a.active
        LEFT JOIN booking_session s ON s.id = b.session_id
       WHERE b.company_id = ${companyId}::uuid AND b.space_id = ${spaceId}::uuid
         AND (${from ?? null}::timestamptz IS NULL OR b.ends_at > ${from ?? null}::timestamptz)
         AND (${to ?? null}::timestamptz IS NULL OR b.starts_at < ${to ?? null}::timestamptz)
         AND (${status ?? null}::booking_status IS NULL OR b.status = ${status ?? null}::booking_status)
         AND (${serviceId ?? null}::uuid IS NULL OR b.service_id = ${serviceId ?? null}::uuid)
         AND (${resourceId ?? null}::uuid IS NULL OR s.resource_id = ${resourceId ?? null}::uuid
              OR EXISTS (SELECT 1 FROM booking_allocation x WHERE x.booking_id = b.id AND x.resource_id = ${resourceId ?? null}::uuid
                           AND (x.active OR b.status NOT IN ('PENDING', 'CONFIRMED'))))
         AND (${like}::text IS NULL OR b.guest_name ILIKE ${like} OR b.guest_email ILIKE ${like} OR b.guest_phone ILIKE ${like} OR b.notes ILIKE ${like})
       GROUP BY b.id, s.resource_id ORDER BY b.starts_at, b.id LIMIT ${limit} OFFSET ${offset}`
    return {
      items: rows.map((row) => serializeBooking(row, row.resource_ids.length ? row.resource_ids : row.session_resource_id ? [row.session_resource_id] : [])),
      total: rows.length ? Number(rows[0].total) : 0,
    }
  }

  async function spaceSummary({ companyId, spaceId, now = new Date() }) {
    const [counts, upcoming, services, resources] = await Promise.all([
      prisma.$queryRaw`
        SELECT status, count(*)::int AS n FROM booking
         WHERE company_id = ${companyId}::uuid AND space_id = ${spaceId}::uuid AND ends_at > ${now}
         GROUP BY status`,
      listBookings({ companyId, spaceId, from: now, limit: 5 }),
      prisma.bookingService.count({ where: { companyId, spaceId, enabled: true } }),
      prisma.bookingSpaceResource.count({ where: { companyId, spaceId } }),
    ])
    return { upcomingByStatus: Object.fromEntries(counts.map((c) => [c.status, c.n])), next: upcoming.items.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status)), services, resources }
  }

  async function listSpaceResourceIds({ companyId, spaceId }) {
    return (await prisma.bookingSpaceResource.findMany({ where: { companyId, spaceId }, select: { resourceId: true } })).map((r) => r.resourceId)
  }

  async function listServiceResourceIds({ companyId, serviceId }) {
    return (await prisma.bookingServiceResource.findMany({ where: { companyId, serviceId }, select: { resourceId: true } })).map((r) => r.resourceId)
  }

  const isAnySpaceMember = async ({ companyId, userId }) => (await prisma.bookingSpaceMember.count({ where: { companyId, userId } })) > 0

  async function myRoles({ companyId, userId }) {
    const rows = await prisma.bookingSpaceMember.findMany({ where: { companyId, userId }, select: { spaceId: true, role: true } })
    return Object.fromEntries(rows.map((r) => [r.spaceId, r.role]))
  }

  async function bookingSpaceId({ companyId, bookingId }) {
    const row = await prisma.booking.findFirst({ where: { id: bookingId, companyId }, select: { spaceId: true } })
    if (!row) throw notFound('Reservación')
    return row.spaceId
  }

  // ---- Public pages (phase 3) ----------------------------------------------------
  const POLICY_FIELDS = ['cancellationPolicy', 'reschedulePolicy', 'punctualityPolicy', 'privacyNotice']
  const pageData = (input) => pick(input, {
    slug: 'slug', title: 'title', description: 'description', location: 'location', instructions: 'instructions', serviceIds: 'serviceIds',
    published: 'published', allowResourceChoice: 'allowResourceChoice', requirePhone: 'requirePhone', cancellationPolicy: 'cancellationPolicy',
    reschedulePolicy: 'reschedulePolicy', punctualityPolicy: 'punctualityPolicy', privacyNotice: 'privacyNotice', accentColor: 'accentColor', enabled: 'enabled',
  })
  const slugTaken = (error) => {
    if (error?.code === 'P2002') throw new BookingError('Esa dirección ya está en uso. Elige otra.', 409, 'SLUG_TAKEN')
    throw error
  }

  async function assertServices(companyId, spaceId, serviceIds = []) {
    const found = await prisma.bookingService.count({ where: { companyId, spaceId, id: { in: serviceIds } } })
    if (found !== new Set(serviceIds).size) throw notFound('Servicio')
  }

  const listPages = ({ companyId, spaceId }) => prisma.bookingPage.findMany({ where: { companyId, spaceId, enabled: true }, orderBy: { createdAt: 'asc' } })

  async function getPageRow({ companyId, pageId }) {
    const page = await prisma.bookingPage.findFirst({ where: { id: pageId, companyId } })
    if (!page) throw notFound('Página')
    return page
  }

  async function createPage({ companyId, spaceId, input }) {
    await assertServices(companyId, spaceId, input.serviceIds)
    return prisma.bookingPage.create({ data: { companyId, spaceId, ...pageData(input) } }).catch(slugTaken)
  }

  // Changing any customer-facing policy text asks customers to accept it again.
  async function updatePage({ companyId, pageId, input }) {
    const current = await getPageRow({ companyId, pageId })
    if (input.serviceIds) await assertServices(companyId, current.spaceId, input.serviceIds)
    const bump = POLICY_FIELDS.some((key) => input[key] !== undefined && (input[key] ?? null) !== (current[key] ?? null))
    await prisma.bookingPage.updateMany({ where: { id: pageId, companyId }, data: { ...pageData(input), ...(bump ? { policyVersion: { increment: 1 } } : {}) } }).catch(slugTaken)
    return getPageRow({ companyId, pageId })
  }

  const history = ({ companyId, bookingId }) => prisma.$queryRaw`
    SELECT h.id, h.action, h.from_status AS "fromStatus", h.to_status AS "toStatus", h.before, h.after, h.created_at AS "createdAt",
           h.actor_kind AS "actorKind", h.actor_id AS "actorId", u.display_name AS "actorName"
      FROM booking_history h LEFT JOIN user_profile u ON u.id = h.actor_id
     WHERE h.company_id = ${companyId}::uuid AND h.booking_id = ${bookingId}::uuid
     ORDER BY h.created_at, h.id`

  return {
    listSpaces, createSpace, updateSpace, listMembers, setMember, removeMember,
    listResources, createResource, updateResource, setSpaceResources,
    listServices, getService, createService, updateService, setServiceResources,
    getSchedule, setSchedule, listExceptions, createException, getException, deleteException,
    listSessions, getSession, listBookings, bookingSpaceId, history,
    spaceSummary, listSpaceResourceIds, listServiceResourceIds, isAnySpaceMember, myRoles,
    listPages, getPageRow, createPage, updatePage,
  }
}
