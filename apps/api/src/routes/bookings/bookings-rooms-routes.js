// /bookings/rooms/*: employees reserve rooms and equipment (v1.2 R1). Reachable with
// bookings.reserve or bookings.access; each space decides who may reserve (policy.reservers).
import { Hono } from 'hono'
import { roomReservationCreateSchema, roomReservationRescheduleSchema } from '@runly/validators'
import { BookingError, isBookingsAdmin } from './bookings-core.js'
import { createBookingsCommandService } from './bookings-command-service.js'
import { createBookingsRoomsService } from './bookings-rooms-service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createBookingsRoomsRouter({ prisma, requireAnyPermission, commands = null, onChanged = null }) {
  const app = new Hono()
  const rooms = createBookingsRoomsService({ prisma, commands: commands ?? createBookingsCommandService({ prisma, onChanged }) })
  const access = requireAnyPermission(['bookings.reserve', 'bookings.access'])
  const who = (c) => ({ companyId: c.get('companyId'), userId: c.get('userContext')?.profile?.id ?? c.get('userId') ?? null, isAdmin: isBookingsAdmin(c.get('userContext')) })
  const key = (c) => c.req.header('Idempotency-Key') || null
  async function parse(c, schema) {
    const result = schema.safeParse(await c.req.json().catch(() => ({})))
    if (!result.success) throw new BookingError(result.error.issues[0]?.message ?? 'Datos inválidos.', 400, 'VALIDATION')
    return result.data
  }
  const run = (fn) => async (c) => {
    try {
      for (const value of Object.values(c.req.param())) if (!UUID.test(value)) throw new BookingError('Registro no encontrado.', 404, 'NOT_FOUND')
      return await fn(c)
    } catch (error) {
      if (error instanceof BookingError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      console.error('[runly.bookings rooms]', error?.message ?? error)
      return c.json({ error: 'No se pudo completar la reservación.' }, 500)
    }
  }

  app.get('/bookings/rooms', access, run(async (c) => { const w = who(c); return c.json({ data: await rooms.listRooms({ companyId: w.companyId, userId: w.userId, isAdmin: w.isAdmin }) }) }))
  app.get('/bookings/rooms/mine', access, run(async (c) => { const w = who(c); return c.json({ data: await rooms.mine({ companyId: w.companyId, userId: w.userId }) }) }))
  app.get('/bookings/rooms/:spaceId/agenda', access, run(async (c) => {
    const w = who(c)
    const from = Date.parse(c.req.query('from') ?? ''), to = Date.parse(c.req.query('to') ?? '')
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new BookingError('Indica el rango (from, to).', 400, 'VALIDATION')
    return c.json({ data: await rooms.agenda({ ...w, spaceId: c.req.param('spaceId'), from, to }) })
  }))
  app.post('/bookings/rooms/:spaceId/reservations', access, run(async (c) => {
    const w = who(c)
    const result = await rooms.create({ companyId: w.companyId, actorId: w.userId, isAdmin: w.isAdmin, spaceId: c.req.param('spaceId'), input: await parse(c, roomReservationCreateSchema), idempotencyKey: key(c) })
    return c.json({ data: result.reservation, replayed: result.replayed }, result.replayed ? 200 : 201)
  }))
  app.post('/bookings/rooms/reservations/:id/cancel', access, run(async (c) => {
    const w = who(c)
    const body = await c.req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null
    return c.json({ data: await rooms.cancel({ companyId: w.companyId, actorId: w.userId, isAdmin: w.isAdmin, bookingId: c.req.param('id'), reason, idempotencyKey: key(c) }) })
  }))
  app.post('/bookings/rooms/reservations/:id/reschedule', access, run(async (c) => {
    const w = who(c)
    return c.json({ data: await rooms.reschedule({ companyId: w.companyId, actorId: w.userId, isAdmin: w.isAdmin, bookingId: c.req.param('id'), input: await parse(c, roomReservationRescheduleSchema), idempotencyKey: key(c) }) })
  }))
  return app
}
