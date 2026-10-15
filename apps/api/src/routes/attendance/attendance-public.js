import { Hono } from 'hono'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { AttendanceError, verifySelfRequest } from './attendance-core.js'
import { createAttendanceHours } from './attendance-hours-service.js'
import { createAttendanceEvents } from './attendance-events.js'
import { createAttendanceKioskService } from './attendance-kiosk-service.js'

function fail(c, error, fallback) {
  if (error instanceof AttendanceError) return c.json({ error: error.message, code: error.code }, error.status)
  if (process.env.NODE_ENV !== 'production') console.error('[runly.attendance:public]', error)
  return c.json({ error: fallback }, 500)
}

const clientKey = (c) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
const deviceToken = (c) => (c.req.header('authorization') ?? '').replace(/^Kiosk\s+/i, '') || null

// /public/attendance/* — path-scoped and unauthenticated. The kiosk link only
// starts a pairing; roster and sync require the approved device token.
export function createAttendancePublicRouter({ prisma, getSettings = null, supabaseAdmin = null, bucket = null, service = null, events = null, limiter = createTokenBucketLimiter({ capacity: 60, refillPerSecond: 2 }), strictLimiter = createTokenBucketLimiter({ capacity: 8, refillPerSecond: 0.1 }) }) {
  const app = new Hono()
  const kiosks = service ?? createAttendanceKioskService({ prisma })
  const readSettings = getSettings ?? (async (companyId) => {
    const row = await prisma.attSettings.findUnique({ where: { companyId } })
    return { evidenceRetentionDays: 30, requirePhotoForQr: true, timezone: 'America/Mexico_City', dailyThresholdMinutes: 480, overtimeRoundingMinutes: 0, requireOvertimeApproval: false, allowCorrections: true, ...(row ?? {}) }
  })
  const live = events ?? createAttendanceEvents({})
  const hours = createAttendanceHours({ prisma, getSettings: readSettings })

  // Resolve the caller from a signed request: the person's own enrolled key is the credential.
  async function authenticateSelf(c, action, extraOf = () => []) {
    const body = await c.req.json().catch(() => ({}))
    const person = body.personId ? await prisma.attPerson.findFirst({ where: { id: String(body.personId), enabled: true } }) : null
    const keys = person ? await prisma.attCredential.findMany({ where: { personId: person.id, type: 'device_key', status: 'active' } }) : []
    const check = person && keys.length ? verifySelfRequest({ action, personId: person.id, ts: body.ts, signature: body.signature, jwks: keys.map((k) => k.publicKey), extra: extraOf(body) }) : { ok: false, reason: 'unknown' }
    if (!check.ok) throw new AttendanceError(check.reason === 'expired' ? 'La solicitud caducó. Vuelve a intentarlo.' : 'Este teléfono no está autorizado. Pide una nueva invitación a tu administrador.', 403, 'BAD_SIGNATURE')
    return { person, body }
  }

  app.use('/public/attendance/*', async (c, next) => {
    const result = limiter.consume(clientKey(c))
    if (!result.allowed) return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }, 429)
    return next()
  })

  app.get('/public/attendance/kiosk/:link', async (c) => {
    try {
      const kiosk = await kiosks.kioskByLink(c.req.param('link'))
      return c.json({ data: { name: kiosk.name, paired: Boolean(kiosk.deviceTokenHash), revoked: Boolean(kiosk.revokedAt) } })
    } catch (error) { return fail(c, error, 'No se pudo abrir el kiosko.') }
  })

  app.post('/public/attendance/kiosk/:link/pair', async (c) => {
    try {
      if (!strictLimiter.consume(`pair:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos de emparejamiento.' }, 429)
      const body = await c.req.json().catch(() => ({}))
      const data = await kiosks.requestPairing(c.req.param('link'), body.label)
      live.changed((await kiosks.kioskByLink(c.req.param('link'))).companyId, 'kiosks')
      return c.json({ data })
    } catch (error) { return fail(c, error, 'No se pudo solicitar el emparejamiento.') }
  })

  app.get('/public/attendance/kiosk/:link/pair-status', async (c) => {
    try {
      const data = await kiosks.pairingStatus(c.req.param('link'), c.req.header('x-pair-secret'))
      if (data.status === 'paired') live.changed((await kiosks.kioskByLink(c.req.param('link'))).companyId, 'kiosks')
      return c.json({ data })
    } catch (error) { return fail(c, error, 'No se pudo consultar el emparejamiento.') }
  })

  app.get('/public/attendance/kiosk/:link/roster', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      return c.json({ data: await kiosks.roster(kiosk) })
    } catch (error) { return fail(c, error, 'No se pudo cargar el kiosko.') }
  })

  app.post('/public/attendance/kiosk/:link/sync', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      const data = await kiosks.sync(kiosk, await c.req.json().catch(() => ({})))
      if (data.accepted?.length) live.changed(kiosk.companyId, 'punches')
      return c.json({ data })
    } catch (error) { return fail(c, error, 'No se pudieron sincronizar las checadas.') }
  })

  app.post('/public/attendance/kiosk/:link/punches/:punchId/selfie', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      const form = await c.req.formData()
      const file = form.get('file')
      if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') throw new AttendanceError('Adjunta una imagen.', 400)
      const data = await kiosks.attachSelfie(kiosk, c.req.param('punchId'), file, { supabaseAdmin, bucket })
      live.changed(kiosk.companyId, 'punches')
      return c.json({ data }, 201)
    } catch (error) { return fail(c, error, 'No se pudo guardar la selfie.') }
  })

  app.get('/public/attendance/kiosk/:link/recent', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      return c.json({ data: await kiosks.recent(kiosk, c.req.query('since')) })
    } catch (error) { return fail(c, error, 'No se pudo consultar la actividad.') }
  })

  // Single cheap poll for the kiosk screen: phone punches it received + roster fingerprint.
  app.get('/public/attendance/kiosk/:link/changes', async (c) => {
    try {
      const kiosk = await kiosks.authenticate(c.req.param('link'), deviceToken(c))
      return c.json({ data: await kiosks.changes(kiosk, c.req.query('since')) })
    } catch (error) { return fail(c, error, 'No se pudo consultar la actividad.') }
  })

  // The phone scans the kiosk's QR and posts it here (no kiosk device token: the
  // proof is the kiosk MAC in the challenge plus the phone's own signature).
  app.post('/public/attendance/phone-punch', async (c) => {
    try {
      if (!strictLimiter.consume(`phone:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos. Espera un momento.' }, 429)
      const { companyId, ...data } = await kiosks.phonePunch(await c.req.json().catch(() => ({})))
      live.changed(companyId, 'punches')
      return c.json({ data }, 201)
    } catch (error) { return fail(c, error, 'No se pudo registrar la checada.') }
  })

  // "Mis horas": the phone asks for its owner's summary, signed with the enrolled key.
  app.post('/public/attendance/me', async (c) => {
    try {
      if (!strictLimiter.consume(`me:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos. Espera un momento.' }, 429)
      const { person } = await authenticateSelf(c, 'me')
      return c.json({ data: { name: [person.firstName, person.lastName].filter(Boolean).join(' '), code: person.code, ...(await hours.mySummary(person.companyId, person.id)) } })
    } catch (error) { return fail(c, error, 'No se pudo cargar tu información.') }
  })

  // "I forgot to punch": creates a pending request an admin resolves.
  app.post('/public/attendance/me/correction', async (c) => {
    try {
      if (!strictLimiter.consume(`corr:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos. Espera un momento.' }, 429)
      const { person, body } = await authenticateSelf(c, 'corr', (b) => [String(b.direction), String(b.occurredAt)])
      const row = await hours.createCorrection({ companyId: person.companyId, personId: person.id, direction: body.direction, occurredAt: body.occurredAt, reason: body.reason })
      await live.correctionRequested({ companyId: person.companyId, correction: row, person })
      return c.json({ data: { id: row.id, status: row.status } }, 201)
    } catch (error) { return fail(c, error, 'No se pudo enviar la solicitud.') }
  })

  app.post('/public/attendance/enroll', async (c) => {
    try {
      if (!strictLimiter.consume(`enroll:${clientKey(c)}`).allowed) return c.json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429)
      const { companyId, ...data } = await kiosks.enrollPhone(await c.req.json().catch(() => ({})))
      live.changed(companyId, 'people')
      return c.json({ data }, 201)
    } catch (error) { return fail(c, error, 'No se pudo enrolar el teléfono.') }
  })

  return app
}
