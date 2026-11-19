// runly.bookings internal API (/bookings/*). Thin: validation, tenant + per-space
// role checks, then the services. Roles: viewer reads, agent operates bookings,
// admin configures the space; bookings.spaces.manage owns company resources.
import { Hono } from 'hono'
import {
  bookingAvailabilityQuerySchema, bookingCreateSchema, bookingExceptionCreateSchema, bookingListQuerySchema,
  bookingMemberSchema, bookingResourceCreateSchema, bookingResourceIdsSchema, bookingResourceUpdateSchema,
  bookingRescheduleSchema, bookingScheduleSchema, bookingServiceCreateSchema, bookingServiceUpdateSchema,
  bookingSearchQuerySchema, bookingSessionCreateSchema, bookingSpaceCreateSchema, bookingSpaceUpdateSchema, bookingTransitionSchema,
} from '@runly/validators'
import { bookingsWorkbook } from './bookings-export.js'
import { bookingPageCreateSchema, bookingPageUpdateSchema } from '@runly/validators'
import { pageUrl, previewToken } from './bookings-links.js'
import { BookingError, canManageCatalog, isBookingsAdmin, requireSpaceRole } from './bookings-core.js'
import { createBookingsAvailabilityService } from './bookings-availability-service.js'
import { createBookingsCommandService } from './bookings-command-service.js'
import { createBookingsConfigService } from './bookings-config-service.js'

const TRANSITION_PATHS = { confirm: 'CONFIRMED', reject: 'REJECTED', cancel: 'CANCELLED', complete: 'COMPLETED', 'no-show': 'NO_SHOW' }

export function createBookingsRouter({ prisma, requirePermission, commands = null, cacheDel = null, env = process.env, onChanged = null }) {
  const app = new Hono()
  const config = createBookingsConfigService({ prisma, cacheDel })
  const availability = createBookingsAvailabilityService({ prisma })
  const cmd = commands ?? createBookingsCommandService({ prisma, onChanged })
  const access = requirePermission('bookings.access')

  const companyId = (c) => c.get('companyId')
  const userId = (c) => c.get('userContext')?.profile?.id ?? c.get('userId') ?? null
  const ctx = (c) => c.get('userContext')
  const idempotencyKey = (c) => c.req.header('Idempotency-Key') || null

  async function parse(c, schema, source = 'json') {
    const raw = source === 'query' ? c.req.query() : await c.req.json().catch(() => ({}))
    const result = schema.safeParse(raw)
    if (!result.success) throw new BookingError(result.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'VALIDATION')
    return result.data
  }

  const space = (c, spaceId, min) => requireSpaceRole(prisma, { companyId: companyId(c), spaceId, userId: userId(c), ctx: ctx(c), min })
  const catalog = (c) => {
    if (!canManageCatalog(ctx(c))) throw new BookingError('No tienes permiso para administrar los recursos de reservaciones.', 403, 'FORBIDDEN')
  }
  const bookingRole = async (c, min) => space(c, await config.bookingSpaceId({ companyId: companyId(c), bookingId: c.req.param('id') }), min)

  const run = (fn) => async (c) => {
    try {
      return await fn(c)
    } catch (error) {
      if (error instanceof BookingError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      console.error('[runly.bookings]', error?.message ?? error)
      return c.json({ error: 'No se pudo completar la operación de reservaciones.' }, 500)
    }
  }
  const written = (c, result) => c.json({ data: result.booking, replayed: result.replayed }, result.replayed ? 200 : 201)
  const changed = (c, result) => c.json({ data: result.booking, replayed: result.replayed })

  // Company resources are visible to catalog managers and to members of any space.
  const resourceReader = async (c) => {
    if (canManageCatalog(ctx(c)) || await config.isAnySpaceMember({ companyId: companyId(c), userId: userId(c) })) return
    throw new BookingError('No tienes acceso a los recursos de reservaciones.', 403, 'FORBIDDEN')
  }

  // What the caller can do: drives the UI only; every route re-checks on its own.
  app.get('/bookings/me', access, run(async (c) => c.json({
    data: { isAdmin: isBookingsAdmin(ctx(c)), canManageCatalog: canManageCatalog(ctx(c)), roles: await config.myRoles({ companyId: companyId(c), userId: userId(c) }) },
  })))

  // Spaces and members
  app.get('/bookings/spaces', access, run(async (c) => {
    const admin = isBookingsAdmin(ctx(c))
    const [spaces, roles] = await Promise.all([
      config.listSpaces({ companyId: companyId(c), userId: userId(c), all: admin }),
      config.myRoles({ companyId: companyId(c), userId: userId(c) }),
    ])
    return c.json({ data: spaces.map((s) => ({ ...s, role: admin ? 'admin' : roles[s.id] ?? null })) })
  }))
  app.get('/bookings/spaces/:spaceId/summary', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await config.spaceSummary({ companyId: companyId(c), spaceId: c.req.param('spaceId') }) })
  }))
  app.get('/bookings/spaces/:spaceId/resources', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await config.listSpaceResourceIds({ companyId: companyId(c), spaceId: c.req.param('spaceId') }) })
  }))
  app.post('/bookings/spaces', access, run(async (c) => {
    catalog(c)
    return c.json({ data: await config.createSpace({ companyId: companyId(c), userId: userId(c), input: await parse(c, bookingSpaceCreateSchema) }) }, 201)
  }))
  app.get('/bookings/spaces/:spaceId', access, run(async (c) => {
    const { space: row, role } = await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: { id: row.id, name: row.name, slug: row.slug, description: row.description, mode: row.mode, timezone: row.timezone, published: row.published, policy: row.policy, enabled: row.enabled, role } })
  }))
  app.patch('/bookings/spaces/:spaceId', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    return c.json({ data: await config.updateSpace({ companyId: companyId(c), spaceId: c.req.param('spaceId'), input: await parse(c, bookingSpaceUpdateSchema) }) })
  }))
  app.get('/bookings/spaces/:spaceId/members', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await config.listMembers({ companyId: companyId(c), spaceId: c.req.param('spaceId') }) })
  }))
  app.put('/bookings/spaces/:spaceId/members/:userId', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    const { role } = await parse(c, bookingMemberSchema)
    return c.json({ data: await config.setMember({ companyId: companyId(c), spaceId: c.req.param('spaceId'), userId: c.req.param('userId'), role, actorId: userId(c) }) })
  }))
  app.delete('/bookings/spaces/:spaceId/members/:userId', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    await config.removeMember({ companyId: companyId(c), spaceId: c.req.param('spaceId'), userId: c.req.param('userId') })
    return c.json({ ok: true })
  }))

  // Company resources (shared between spaces)
  app.get('/bookings/resources', access, run(async (c) => {
    await resourceReader(c)
    return c.json({ data: await config.listResources({ companyId: companyId(c) }) })
  }))
  app.post('/bookings/resources', access, run(async (c) => {
    catalog(c)
    return c.json({ data: await config.createResource({ companyId: companyId(c), input: await parse(c, bookingResourceCreateSchema) }) }, 201)
  }))
  app.patch('/bookings/resources/:resourceId', access, run(async (c) => {
    catalog(c)
    return c.json({ data: await config.updateResource({ companyId: companyId(c), resourceId: c.req.param('resourceId'), input: await parse(c, bookingResourceUpdateSchema) }) })
  }))
  app.get('/bookings/resources/:resourceId/schedule', access, run(async (c) => {
    await resourceReader(c)
    return c.json({ data: await config.getSchedule({ companyId: companyId(c), resourceId: c.req.param('resourceId') }) })
  }))
  app.put('/bookings/resources/:resourceId/schedule', access, run(async (c) => {
    catalog(c)
    const { rules } = await parse(c, bookingScheduleSchema)
    return c.json({ data: await config.setSchedule({ companyId: companyId(c), resourceId: c.req.param('resourceId'), rules }) })
  }))
  app.put('/bookings/spaces/:spaceId/resources', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    const { resourceIds } = await parse(c, bookingResourceIdsSchema)
    return c.json({ data: await config.setSpaceResources({ companyId: companyId(c), spaceId: c.req.param('spaceId'), resourceIds }) })
  }))

  // Services, hours, exceptions
  app.get('/bookings/spaces/:spaceId/services', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await config.listServices({ companyId: companyId(c), spaceId: c.req.param('spaceId') }) })
  }))
  app.post('/bookings/spaces/:spaceId/services', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    return c.json({ data: await config.createService({ companyId: companyId(c), spaceId: c.req.param('spaceId'), input: await parse(c, bookingServiceCreateSchema) }) }, 201)
  }))
  app.patch('/bookings/services/:serviceId', access, run(async (c) => {
    const service = await config.getService({ companyId: companyId(c), serviceId: c.req.param('serviceId') })
    await space(c, service.spaceId, 'admin')
    return c.json({ data: await config.updateService({ companyId: companyId(c), serviceId: service.id, input: await parse(c, bookingServiceUpdateSchema) }) })
  }))
  app.get('/bookings/services/:serviceId/resources', access, run(async (c) => {
    const service = await config.getService({ companyId: companyId(c), serviceId: c.req.param('serviceId') })
    await space(c, service.spaceId, 'viewer')
    return c.json({ data: await config.listServiceResourceIds({ companyId: companyId(c), serviceId: service.id }) })
  }))
  app.put('/bookings/services/:serviceId/resources', access, run(async (c) => {
    const service = await config.getService({ companyId: companyId(c), serviceId: c.req.param('serviceId') })
    await space(c, service.spaceId, 'admin')
    const { resourceIds } = await parse(c, bookingResourceIdsSchema)
    return c.json({ data: await config.setServiceResources({ companyId: companyId(c), serviceId: service.id, resourceIds }) })
  }))
  app.get('/bookings/spaces/:spaceId/schedule', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await config.getSchedule({ companyId: companyId(c), spaceId: c.req.param('spaceId') }) })
  }))
  app.put('/bookings/spaces/:spaceId/schedule', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    const { rules } = await parse(c, bookingScheduleSchema)
    return c.json({ data: await config.setSchedule({ companyId: companyId(c), spaceId: c.req.param('spaceId'), rules }) })
  }))
  app.get('/bookings/spaces/:spaceId/exceptions', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    const { from, to } = await parse(c, bookingListQuerySchema, 'query')
    return c.json({ data: await config.listExceptions({ companyId: companyId(c), spaceId: c.req.param('spaceId'), from, to }) })
  }))
  app.post('/bookings/exceptions', access, run(async (c) => {
    const input = await parse(c, bookingExceptionCreateSchema)
    if (input.spaceId) await space(c, input.spaceId, 'admin')
    else catalog(c)
    return c.json({ data: await config.createException({ companyId: companyId(c), input }) }, 201)
  }))
  app.delete('/bookings/exceptions/:exceptionId', access, run(async (c) => {
    const row = await config.getException({ companyId: companyId(c), exceptionId: c.req.param('exceptionId') })
    if (row.spaceId) await space(c, row.spaceId, 'admin')
    else catalog(c)
    await config.deleteException({ companyId: companyId(c), exceptionId: row.id })
    return c.json({ ok: true })
  }))

  // Sessions and availability
  app.get('/bookings/spaces/:spaceId/sessions', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    const { from, to } = await parse(c, bookingListQuerySchema, 'query')
    return c.json({ data: await config.listSessions({ companyId: companyId(c), spaceId: c.req.param('spaceId'), from, to }) })
  }))
  app.post('/bookings/spaces/:spaceId/sessions', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    return c.json({ data: await cmd.createSession({ companyId: companyId(c), spaceId: c.req.param('spaceId'), input: await parse(c, bookingSessionCreateSchema) }) }, 201)
  }))
  app.post('/bookings/sessions/:sessionId/cancel', access, run(async (c) => {
    const session = await config.getSession({ companyId: companyId(c), sessionId: c.req.param('sessionId') })
    await space(c, session.spaceId, 'admin')
    return c.json({ data: await cmd.cancelSession({ companyId: companyId(c), sessionId: session.id }) })
  }))
  app.get('/bookings/spaces/:spaceId/availability', access, run(async (c) => {
    const { space: row } = await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: await availability.availability({ companyId: companyId(c), space: row, query: await parse(c, bookingAvailabilityQuerySchema, 'query') }) })
  }))

  // Bookings
  app.get('/bookings/spaces/:spaceId/reservations', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    const result = await config.listBookings({ companyId: companyId(c), spaceId: c.req.param('spaceId'), ...(await parse(c, bookingSearchQuerySchema, 'query')) })
    return c.json({ data: result.items, total: result.total })
  }))
  app.get('/bookings/spaces/:spaceId/reservations/export', access, run(async (c) => {
    const { space: row } = await space(c, c.req.param('spaceId'), 'viewer')
    const query = await parse(c, bookingSearchQuerySchema, 'query')
    const [result, services, resources] = await Promise.all([
      config.listBookings({ companyId: companyId(c), spaceId: row.id, ...query, limit: 5000, offset: 0 }),
      config.listServices({ companyId: companyId(c), spaceId: row.id }),
      config.listResources({ companyId: companyId(c) }),
    ])
    const buffer = await bookingsWorkbook({ space: row, items: result.items, services, resources })
    return new Response(buffer, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reservaciones-${row.slug}.xlsx"`,
    } })
  }))
  app.post('/bookings/spaces/:spaceId/reservations', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'agent')
    const input = await parse(c, bookingCreateSchema)
    return written(c, await cmd.create({ companyId: companyId(c), actorId: userId(c), spaceId: c.req.param('spaceId'), input, idempotencyKey: idempotencyKey(c) }))
  }))
  app.get('/bookings/reservations/:id', access, run(async (c) => {
    await bookingRole(c, 'viewer')
    return c.json({ data: await cmd.view(companyId(c), c.req.param('id')) })
  }))
  app.get('/bookings/reservations/:id/history', access, run(async (c) => {
    await bookingRole(c, 'viewer')
    return c.json({ data: await config.history({ companyId: companyId(c), bookingId: c.req.param('id') }) })
  }))
  app.post('/bookings/reservations/:id/reschedule', access, run(async (c) => {
    await bookingRole(c, 'agent')
    const input = await parse(c, bookingRescheduleSchema)
    return changed(c, await cmd.reschedule({ companyId: companyId(c), actorId: userId(c), bookingId: c.req.param('id'), input, idempotencyKey: idempotencyKey(c) }))
  }))
  // Revokes the customer's manage link and emails a new one.
  app.post('/bookings/reservations/:id/manage-link', access, run(async (c) => {
    await bookingRole(c, 'agent')
    return c.json({ data: await cmd.rotateManageLink({ companyId: companyId(c), actorId: userId(c), bookingId: c.req.param('id') }) })
  }))

  // Live pages of the company for the Website editor's Reservaciones block. Only what is
  // already public (title, slug, services); readable by site editors without bookings access.
  app.get('/bookings/pages/published', run(async (c) => {
    const user = ctx(c)
    if (!user?.isAdmin && !['bookings.access', 'website.pages.update'].some((key) => user?.permissionSet?.has(key))) {
      throw new BookingError('No tienes acceso a las páginas de reservaciones.', 403, 'FORBIDDEN')
    }
    const rows = await prisma.$queryRaw`
      SELECT p.slug, p.title, s.name AS space_name, sv.id AS service_id, sv.name AS service_name
        FROM booking_page p JOIN booking_space s ON s.id = p.space_id AND s.company_id = p.company_id
        LEFT JOIN booking_service sv ON sv.company_id = p.company_id AND sv.space_id = p.space_id AND sv.enabled AND sv.id = ANY(p.service_ids)
       WHERE p.company_id = ${companyId(c)}::uuid AND p.enabled AND p.published AND s.enabled AND s.published
       ORDER BY s.name, p.title, sv.name`
    const pages = new Map()
    for (const r of rows) {
      if (!pages.has(r.slug)) pages.set(r.slug, { slug: r.slug, title: r.title, spaceName: r.space_name, url: pageUrl(r.slug, env), services: [] })
      if (r.service_id) pages.get(r.slug).services.push({ id: r.service_id, name: r.service_name })
    }
    return c.json({ data: [...pages.values()] })
  }))

  // Public pages of a space (phase 3).
  const pageOut = (p) => ({ ...p, url: pageUrl(p.slug, env) })
  app.get('/bookings/spaces/:spaceId/pages', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'viewer')
    return c.json({ data: (await config.listPages({ companyId: companyId(c), spaceId: c.req.param('spaceId') })).map(pageOut) })
  }))
  app.post('/bookings/spaces/:spaceId/pages', access, run(async (c) => {
    await space(c, c.req.param('spaceId'), 'admin')
    return c.json({ data: pageOut(await config.createPage({ companyId: companyId(c), spaceId: c.req.param('spaceId'), input: await parse(c, bookingPageCreateSchema) })) }, 201)
  }))
  app.patch('/bookings/pages/:pageId', access, run(async (c) => {
    const page = await config.getPageRow({ companyId: companyId(c), pageId: c.req.param('pageId') })
    await space(c, page.spaceId, 'admin')
    return c.json({ data: pageOut(await config.updatePage({ companyId: companyId(c), pageId: page.id, input: await parse(c, bookingPageUpdateSchema) })) })
  }))
  // Short-lived link that shows an unpublished page read-only.
  app.post('/bookings/pages/:pageId/preview', access, run(async (c) => {
    const page = await config.getPageRow({ companyId: companyId(c), pageId: c.req.param('pageId') })
    await space(c, page.spaceId, 'admin')
    return c.json({ data: { url: `${pageUrl(page.slug, env)}?vista=${encodeURIComponent(previewToken(page.id, env))}` } })
  }))

  for (const [path, to] of Object.entries(TRANSITION_PATHS)) {
    app.post(`/bookings/reservations/:id/${path}`, access, run(async (c) => {
      await bookingRole(c, 'agent')
      const input = await parse(c, bookingTransitionSchema)
      return changed(c, await cmd.transition({ companyId: companyId(c), actorId: userId(c), bookingId: c.req.param('id'), to, input, idempotencyKey: idempotencyKey(c) }))
    }))
  }

  return app
}
