// POS <-> Booking Engine: per-outlet activation (preview, activate, rollback), the
// professionals of an appointments outlet and which tables can take a reservation.
import { Hono } from 'hono'
import { z } from 'zod'
import { createBookingsCalendarProjection } from '../bookings/bookings-calendar.js'
import { engineLink } from './pos-bookings-adapter.js'
import { createPosBookingsLinkService } from './pos-bookings-link-service.js'
import { getActorId, getCompanyId, PosServiceError } from './service-helpers.js'

const READ = ['pos.orders.read', 'pos.caja.read', 'pos.comandas.read', 'pos.admin.read']
const M = 60000
const linkSchema = z.object({
  outletId: z.string().uuid(),
  kind: z.enum(['tables', 'appointments']),
  timezone: z.string().trim().min(1).max(64).optional(),
  professionals: z.array(z.object({ name: z.string().trim().min(1).max(120), userId: z.string().uuid().nullable().optional() }).strict()).max(50).optional(),
}).strict()
const tablesSchema = z.object({
  outletId: z.string().uuid(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(720).optional(),
  partySize: z.coerce.number().int().min(1).max(50).optional(),
})

export function createPosBookingsRoutes({ prisma, requirePermission, requireAnyPermission }) {
  const app = new Hono()
  const links = createPosBookingsLinkService({ prisma, onChanged: createBookingsCalendarProjection({ prisma }).projectQuietly })
  const ctx = (c) => ({ companyId: getCompanyId(c), actorId: getActorId(c) })
  const read = requireAnyPermission ? requireAnyPermission(READ) : requirePermission('pos.orders.read')
  const admin = requirePermission('pos.settings.manage')
  const run = (fn, fallback) => async (c) => {
    try { return await fn(c) } catch (error) {
      if (error instanceof PosServiceError) return c.json({ error: error.message, ...(error.report ? { report: error.report } : {}) }, error.status)
      if (error?.name === 'ZodError') return c.json({ error: error.issues?.[0]?.message ?? 'Datos inválidos.' }, 400)
      console.error('[runly.pos] bookings', error?.message ?? error)
      return c.json({ error: fallback }, 500)
    }
  }
  const body = async (c, schema) => schema.parse(await c.req.json().catch(() => ({})))

  app.get('/pos/bookings/links', read, run(async (c) => c.json({ data: await links.links({ ...ctx(c), outletId: z.string().uuid().parse(c.req.query('outletId')) }) }), 'No se pudo consultar la configuración.'))
  app.post('/pos/bookings/links/preview', admin, run(async (c) => c.json({ data: await links.preview({ ...ctx(c), ...(await body(c, linkSchema)) }) }), 'No se pudo revisar la activación.'))
  app.post('/pos/bookings/links/activate', admin, run(async (c) => c.json({ data: await links.activate({ ...ctx(c), ...(await body(c, linkSchema)) }) }), 'No se pudo activar el sistema de reservaciones.'))
  app.post('/pos/bookings/links/rollback', admin, run(async (c) => {
    const { outletId, kind } = await body(c, linkSchema.pick({ outletId: true, kind: true }))
    return c.json({ data: await links.rollback({ ...ctx(c), outletId, kind }) })
  }, 'No se pudo volver al modo anterior.'))

  app.get('/pos/bookings/professionals', read, run(async (c) => {
    const { companyId } = ctx(c)
    const l = await engineLink(prisma, companyId, z.string().uuid().parse(c.req.query('outletId')), 'appointments')
    if (!l) return c.json({ data: [] })
    const rows = await prisma.$queryRaw`
      SELECT r.id, r.name FROM booking_resource r JOIN booking_space_resource sr ON sr.resource_id = r.id AND sr.space_id = ${l.spaceId}::uuid
       WHERE r.company_id = ${companyId}::uuid AND r.enabled ORDER BY r.name`
    return c.json({ data: rows })
  }, 'No se pudieron cargar los profesionales.'))

  // Advisory view for choosing a table: seats, physical state now and whether the engine
  // already holds that time. Creating the reservation re-validates everything.
  app.get('/pos/reservations/tables', read, run(async (c) => {
    const { companyId } = ctx(c)
    const q = tablesSchema.parse(c.req.query())
    const l = await engineLink(prisma, companyId, q.outletId, 'tables')
    if (!l) return c.json({ data: [], engine: false })
    const service = await prisma.bookingService.findUnique({ where: { id: l.serviceId } })
    const start = new Date(q.scheduledAt), minutes = q.durationMinutes ?? service.durationMinutes
    const from = new Date(start.getTime() - service.bufferBeforeMinutes * M), to = new Date(start.getTime() + (minutes + service.bufferAfterMinutes) * M)
    const turnover = start.getTime() < Date.now() + service.durationMinutes * M
    const rows = await prisma.$queryRaw`
      SELECT t.id, t.name, t.capacity, t.status::text AS status,
             EXISTS (SELECT 1 FROM booking_allocation a LEFT JOIN booking b ON b.id = a.booking_id
                      WHERE a.resource_id = pbt.resource_id AND a.active AND a.during && tstzrange(${from}::timestamptz, ${to}::timestamptz, '[)')
                        AND NOT COALESCE(b.status = 'PENDING' AND b.hold_expires_at < now(), false)) AS reserved,
             (t.status IN ('OCCUPIED', 'BILL_REQUESTED', 'DIRTY') OR EXISTS (SELECT 1 FROM pos_order o WHERE o.table_id = t.id AND o.status NOT IN ('PAID', 'CANCELLED', 'REFUNDED'))) AS occupied
        FROM pos_table t JOIN pos_booking_table pbt ON pbt.table_id = t.id
        JOIN booking_space_resource sp ON sp.resource_id = pbt.resource_id AND sp.space_id = ${l.spaceId}::uuid
       WHERE t.company_id = ${companyId}::uuid AND t.enabled
       ORDER BY t.capacity, t.name`
    const party = q.partySize ?? 1
    return c.json({ engine: true, data: rows.map((t) => {
      const reason = t.capacity < party ? 'capacity' : t.reserved ? 'reserved' : turnover && t.occupied ? 'occupied' : null
      return { id: t.id, name: t.name, capacity: t.capacity, status: t.status, available: !reason, reason }
    }) })
  }, 'No se pudieron revisar las mesas.'))

  return app
}
