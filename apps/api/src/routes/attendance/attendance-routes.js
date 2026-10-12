import { Hono } from 'hono'
import { AttendanceError } from './attendance-core.js'
import { createAttendanceService } from './attendance-service.js'
import { createAttendanceHours } from './attendance-hours-service.js'
import { createAttendanceExport } from './attendance-export.js'
import { createGeocoder } from '../canvas/canvas-geocoder.js'
import { IMPORT_FIELDS, createAttendanceImport, isTemplate, parseImportFile, suggestMapping } from './attendance-import.js'

const companyId = (c) => c.get('companyId')
const actorId = (c) => c.get('userContext')?.profile?.id ?? null

function fail(c, error, fallback) {
  if (error instanceof AttendanceError) return c.json({ error: error.message, code: error.code }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.attendance]', error)
  return c.json({ error: fallback }, 500)
}

export function createAttendanceRouter({ prisma, requirePermission, requireAnyPermission = null, broadcaster = null, service = null, geocoder = createGeocoder(), signFile = null }) {
  const app = new Hono()
  const svc = service ?? createAttendanceService({ prisma, signFile })
  const importer = createAttendanceImport({ prisma })
  const hours = createAttendanceHours({ prisma, getSettings: (companyId) => svc.getSettings(companyId) })
  const exporter = createAttendanceExport({ prisma, service: svc, hours })
  const view = requirePermission('attendance.view')
  const people = requirePermission('attendance.people.manage')
  const punches = requirePermission('attendance.punch.manage')
  const config = requirePermission('attendance.config.manage')
  // Attendance data on the HR employee screen: attendance.view or hr.employee.read.
  const employeeView = requireAnyPermission ? requireAnyPermission(['attendance.view', 'hr.employee.read']) : view
  const run = (fallback, fn) => async (c) => {
    try { return await fn(c) } catch (error) { return fail(c, error, fallback) }
  }
  const changed = (c, action) => broadcaster?.broadcastToChannel?.(`attendance:${companyId(c)}`, 'attendance.changed', { action }).catch(() => {})

  // Address search for the site location picker (same Nominatim proxy as Canvas maps).
  app.get('/attendance/geocode', config, run('Error al buscar la dirección.', async (c) => {
    try { return c.json({ data: await geocoder.search(c.req.query('q')) }) } catch (error) {
      if (Number.isInteger(error?.status)) return c.json({ error: error.message }, error.status)
      throw error
    }
  }))

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

  app.get('/attendance/hr-suggestions', people, run('Error al buscar en RH.', async (c) => c.json({ data: await svc.hrSuggestions(companyId(c), c.req.query()) })))
  app.post('/attendance/people/from-hr', people, run('Error al crear desde RH.', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    return c.json({ data: await svc.personFromHr(companyId(c), body.hrEmployeeId) }, 201)
  }))
  app.post('/attendance/people/:id/link-hr', people, run('Error al vincular con RH.', async (c) => c.json({ data: await svc.linkHr(companyId(c), c.req.param('id'), await c.req.json().catch(() => ({}))) })))
  app.delete('/attendance/people/:id/link-hr', people, run('Error al desvincular de RH.', async (c) => c.json({ data: await svc.unlinkHr(companyId(c), c.req.param('id')) })))
  app.get('/attendance/employees/:hrEmployeeId', employeeView, run('Error al cargar la asistencia del colaborador.', async (c) => c.json({ data: await svc.employeeAttendance(companyId(c), c.req.param('hrEmployeeId')) })))

  // ---- bulk import (template, parse, preview, commit) -----------------
  app.get('/attendance/people/import/template', people, run('Error al generar la plantilla.', async (c) => {
    const file = await importer.template(companyId(c))
    return new Response(file, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="plantilla-personas-asistencia.xlsx"' } })
  }))
  app.post('/attendance/people/import/parse', people, run('Error al leer el archivo.', async (c) => {
    const form = await c.req.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new AttendanceError('Adjunta un archivo.', 400)
    const parsed = await parseImportFile(Buffer.from(await file.arrayBuffer()), file.name)
    const template = isTemplate(parsed.headers)
    return c.json({ data: { fileName: file.name, headers: parsed.headers, rows: parsed.rows, truncated: parsed.truncated, fields: IMPORT_FIELDS.map(({ aliases, ...f }) => f), suggestedMapping: suggestMapping(parsed.headers), templateDetected: template } })
  }))
  app.post('/attendance/people/import/preview', people, run('Error al validar la importación.', async (c) => c.json({ data: await importer.preview(companyId(c), await c.req.json().catch(() => ({}))) })))
  app.post('/attendance/people/import/commit', people, run('Error al importar.', async (c) => {
    const data = await importer.commit(companyId(c), await c.req.json().catch(() => ({})))
    changed(c, 'people')
    return c.json({ data })
  }))

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

  // ---- xlsx exports (tz offset in minutes keeps dates in the caller's local time) ----
  const xlsx = (buffer, name) => new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"` } })
  app.get('/attendance/export/people', view, run('Error al exportar.', async (c) => xlsx(await exporter.people(companyId(c)), 'personas-asistencia')))
  app.get('/attendance/export/punches', view, run('Error al exportar.', async (c) => xlsx(await exporter.punches(companyId(c), c.req.query()), 'checadas')))
  app.get('/attendance/export/days', view, run('Error al exportar.', async (c) => xlsx(await exporter.daily(companyId(c), c.req.query()), 'horas-por-dia')))
  app.get('/attendance/export/hours', view, run('Error al exportar.', async (c) => xlsx(await exporter.hours(companyId(c), c.req.query()), 'horas-trabajadas')))

  // ---- daily hours, overtime review and corrections ----
  app.get('/attendance/reports/days', view, run('Error al calcular las horas.', async (c) => c.json({ data: await hours.report(companyId(c), c.req.query()) })))
  app.post('/attendance/days/review', punches, run('Error al guardar la revisión.', async (c) => {
    const data = await hours.reviewDay(companyId(c), actorId(c), await c.req.json().catch(() => ({})))
    changed(c, 'review')
    return c.json({ data })
  }))
  app.get('/attendance/corrections', view, run('Error al cargar las solicitudes.', async (c) => c.json({ data: await hours.listCorrections(companyId(c), c.req.query()), meta: { pending: await hours.pendingCorrectionCount(companyId(c)) } })))
  app.post('/attendance/corrections/:id/resolve', punches, run('Error al resolver la solicitud.', async (c) => {
    const data = await hours.resolveCorrection(companyId(c), actorId(c), c.req.param('id'), await c.req.json().catch(() => ({})))
    changed(c, 'punch')
    return c.json({ data })
  }))

  // ---- company policy (evidence retention, photo for QR punches) ----
  app.get('/attendance/settings', view, run('Error al cargar la configuración.', async (c) => c.json({ data: { ...(await svc.getSettings(companyId(c))), retentionChoices: svc.RETENTION_CHOICES } })))
  app.patch('/attendance/settings', config, run('Error al guardar la configuración.', async (c) => c.json({ data: await svc.saveSettings(companyId(c), await c.req.json().catch(() => ({}))) })))

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
