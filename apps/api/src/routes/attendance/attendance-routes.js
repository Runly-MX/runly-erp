import { Hono } from 'hono'
import { AttendanceError } from './attendance-core.js'
import { createAttendanceService } from './attendance-service.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null

function fail(c, error, fallback) {
  if (error instanceof AttendanceError) return c.json({ error: error.message, code: error.code }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.attendance]', error)
  return c.json({ error: fallback }, 500)
}

export function createAttendanceRouter({ prisma, requirePermission, broadcaster = null, service = null }) {
  const app = new Hono()
  const svc = service ?? createAttendanceService({ prisma })
  const view = requirePermission('attendance.view')
  const people = requirePermission('attendance.people.manage')
  const punches = requirePermission('attendance.punch.manage')
  const config = requirePermission('attendance.config.manage')
  const run = (fallback, fn) => async (c) => {
    try { return await fn(c) } catch (error) { return fail(c, error, fallback) }
  }
  const changed = (c, action) => broadcaster?.broadcastToChannel?.(`attendance:${companyId(c)}`, 'attendance.changed', { action }).catch(() => {})

  // ---- catalogs: sites, groups, categories, shifts, quotas ------------
  for (const kind of svc.CATALOG_KINDS) {
    app.get(`/attendance/${kind}`, view, run('Error al cargar el catálogo.', async (c) => c.json({ data: await svc.catalogList(kind, companyId(c)) })))
    app.post(`/attendance/${kind}`, config, run('Error al guardar.', async (c) => c.json({ data: await svc.catalogSave(kind, companyId(c), null, await c.req.json().catch(() => ({}))) }, 201)))
    app.patch(`/attendance/${kind}/:id`, config, run('Error al guardar.', async (c) => c.json({ data: await svc.catalogSave(kind, companyId(c), c.req.param('id'), await c.req.json().catch(() => ({}))) })))
    app.delete(`/attendance/${kind}/:id`, config, run('Error al eliminar.', async (c) => c.json({ data: await svc.catalogRemove(kind, companyId(c), c.req.param('id')) })))
  }

  // ---- people ----------------------------------------------------------
  app.get('/attendance/people', view, run('Error al cargar personas.', async (c) => c.json({ data: await svc.listPeople(companyId(c), c.req.query()) })))
  app.post('/attendance/people', people, run('Error al crear la persona.', async (c) => c.json({ data: await svc.savePerson(companyId(c), null, await c.req.json().catch(() => ({}))) }, 201)))
  app.post('/attendance/people/import-hr', people, run('Error al importar desde RH.', async (c) => c.json({ data: await svc.importFromHr(companyId(c)) })))
  app.patch('/attendance/people/:id', people, run('Error al guardar la persona.', async (c) => c.json({ data: await svc.savePerson(companyId(c), c.req.param('id'), await c.req.json().catch(() => ({}))) })))
  app.post('/attendance/people/:id/enroll-invite', people, run('Error al crear la invitación.', async (c) => c.json({ data: await svc.createEnrollInvite(companyId(c), c.req.param('id')) })))
  app.post('/attendance/people/:id/cards', people, run('Error al asignar la tarjeta.', async (c) => c.json({ data: await svc.addCardCredential(companyId(c), c.req.param('id'), await c.req.json().catch(() => ({}))) }, 201)))
  app.post('/attendance/credentials/:id/revoke', people, run('Error al revocar.', async (c) => c.json({ data: await svc.setCredentialStatus(companyId(c), c.req.param('id'), 'revoked') })))

  // ---- punches ----------------------------------------------------------
  app.get('/attendance/punches', view, run('Error al cargar checadas.', async (c) => c.json({ data: await svc.listPunches(companyId(c), c.req.query()) })))
  app.post('/attendance/punches', punches, run('Error al registrar la checada.', async (c) => {
    const data = await svc.createManualPunch(companyId(c), actorId(c), await c.req.json().catch(() => ({})))
    changed(c, 'punch')
    return c.json({ data }, 201)
  }))
  app.post('/attendance/punches/:id/void', punches, run('Error al anular la checada.', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const data = await svc.voidPunch(companyId(c), actorId(c), c.req.param('id'), body.note)
    changed(c, 'punch')
    return c.json({ data })
  }))

  // ---- reports ----------------------------------------------------------
  app.get('/attendance/summary', view, run('Error al cargar el resumen.', async (c) => c.json({ data: await svc.summary(companyId(c)) })))
  app.get('/attendance/reports/presence', view, run('Error al cargar la presencia.', async (c) => c.json({ data: await svc.presence(companyId(c), c.req.query()) })))
  app.get('/attendance/reports/hours', view, run('Error al calcular horas.', async (c) => c.json({ data: await svc.hours(companyId(c), c.req.query()) })))
  app.get('/attendance/reports/compliance', view, run('Error al calcular el cumplimiento.', async (c) => c.json({ data: await svc.compliance(companyId(c), c.req.query()) })))

  // ---- kiosks -----------------------------------------------------------
  app.get('/attendance/kiosks', view, run('Error al cargar kioskos.', async (c) => c.json({ data: await svc.listKiosks(companyId(c)) })))
  app.post('/attendance/kiosks', config, run('Error al crear el kiosko.', async (c) => c.json({ data: await svc.saveKiosk(companyId(c), null, await c.req.json().catch(() => ({}))) }, 201)))
  app.patch('/attendance/kiosks/:id', config, run('Error al guardar el kiosko.', async (c) => c.json({ data: await svc.saveKiosk(companyId(c), c.req.param('id'), await c.req.json().catch(() => ({}))) })))
  app.post('/attendance/kiosks/:id/approve', config, run('Error al aprobar el kiosko.', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return c.json({ data: await svc.approveKiosk(companyId(c), c.req.param('id'), body.code) })
  }))
  app.post('/attendance/kiosks/:id/reset', config, run('Error al restablecer el kiosko.', async (c) => c.json({ data: await svc.resetKiosk(companyId(c), c.req.param('id')) })))
  app.post('/attendance/kiosks/:id/revoke', config, run('Error al revocar el kiosko.', async (c) => c.json({ data: await svc.revokeKiosk(companyId(c), c.req.param('id')) })))

  return app
}
