// /public/lms/evaluacion/:token/* (the public link: information, registration,
// access code, resume, overview, start) and /public/lms/evaluation-sessions/*
// (the running session) for external participants without a Runly account. The
// guest sends `Authorization: Guest <token>`; only sha256(token) is stored.
// Access is decided by the guest's enrollment in that evaluation, so a course
// guest token opens nothing here. Rate limited per client IP: registration and
// code checks have stricter buckets, material downloads their own.
import { LmsError } from './lms-error.js'
import { hashGuestToken, parseGuestAuthorization } from './lms-share-core.js'

function limit(limiter, clientKey) {
  return async (c, next) => {
    const result = limiter.consume(clientKey(c))
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfter))
      return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' }, 429)
    }
    return next()
  }
}

// sessions: createLmsSessionService({ participants: GUEST_PARTICIPANTS, ... }).
// link: createLmsAssessmentGuestService.
export function registerLmsAssessmentPublicRoutes(app, { prisma, sessions, link, limiter, joinLimiter, accessLimiter, downloadLimiter, clientKey, fail }) {
  const body = (c) => c.req.json().catch(() => ({}))
  const sid = (c) => c.req.param('sessionId')

  async function guestOf(c) {
    const raw = parseGuestAuthorization(c.req.header('authorization'))
    const learner = raw ? await prisma.lmsLearner.findUnique({ where: { guestTokenHash: hashGuestToken(raw) } }) : null
    if (!learner?.enabled) throw new LmsError('Tu acceso no es válido. Vuelve a entrar con tu enlace.', 401, 'GUEST_REQUIRED')
    return { learner }
  }
  // Every call runs with the company of the guest learner (never from the request).
  const run = (fallback, fn, status = 200) => async (c) => {
    c.header('Cache-Control', 'no-store')
    try {
      const guest = await guestOf(c)
      return c.json({ data: await fn(c, guest.learner.companyId, guest) }, status)
    } catch (error) { return fail(c, error, fallback) }
  }

  app.use('/public/lms/evaluacion/*', limit(limiter, clientKey))
  app.use('/public/lms/evaluation-sessions/*', limit(limiter, clientKey))

  // The link: the company comes from the link token, never from the request.
  const pub = (fallback, fn, status = 200) => async (c) => {
    c.header('Cache-Control', 'no-store')
    try { return c.json({ data: await fn(c) }, status) } catch (error) { return fail(c, error, fallback) }
  }
  const token = (c) => c.req.param('token')
  const auth = (c) => c.req.header('authorization')
  const linkBase = '/public/lms/evaluacion/:token'
  app.get(linkBase, pub('No se pudo abrir la evaluación.', (c) => link.summary(token(c))))
  app.post(`${linkBase}/register`, limit(joinLimiter, clientKey), pub('No se pudo completar el registro.', async (c) => link.register(token(c), await body(c), auth(c)), 201))
  app.post(`${linkBase}/access`, limit(accessLimiter, clientKey), pub('No se pudo validar tu código.', async (c) => link.access(token(c), await body(c))))
  app.post(`${linkBase}/resume`, limit(accessLimiter, clientKey), pub('No se pudo enviar el código.', async (c) => link.resume(token(c), await body(c))))
  app.get(`${linkBase}/me`, pub('No se pudo cargar la evaluación.', (c) => link.me(token(c), auth(c))))
  app.post(`${linkBase}/start`, pub('No se pudo iniciar la evaluación.', async (c) => {
    const { session, resumed } = await link.start(token(c), auth(c))
    return { ...session, resumed }
  }))

  const base = '/public/lms/evaluation-sessions/:sessionId'
  app.get(base, run('No se pudo cargar la evaluación.', (c, companyId, guest) => sessions.getSession(companyId, guest, sid(c))))
  app.post(`${base}/submit`, run('No se pudo entregar la evaluación.', (c, companyId, guest) => sessions.submit(companyId, guest, sid(c))))
  app.get(`${base}/attempts/:attemptId`, run('No se pudo cargar el cuestionario.', (c, companyId, guest) => sessions.getAttempt(companyId, guest, sid(c), c.req.param('attemptId'))))
  app.put(`${base}/attempts/:attemptId/answers`, run('No se pudieron guardar las respuestas.', async (c, companyId, guest) => sessions.saveAnswers(companyId, guest, sid(c), c.req.param('attemptId'), await body(c))))
  app.put(`${base}/activities/:activityId/draft`, run('No se pudo guardar la entrega.', async (c, companyId, guest) => sessions.saveDraft(companyId, guest, sid(c), c.req.param('activityId'), await body(c))))
  app.post(`${base}/uploads/presign`, run('No se pudo preparar la subida.', async (c, companyId, guest) => sessions.presignUpload(companyId, guest, sid(c), await body(c))))
  app.post(`${base}/uploads/:fileId/confirm`, run('No se pudo confirmar la subida.', (c, companyId, guest) => sessions.confirmUpload(companyId, guest, sid(c), c.req.param('fileId'))))
  app.delete(`${base}/files/:fileId`, run('No se pudo quitar el archivo.', (c, companyId, guest) => sessions.removeFile(companyId, guest, sid(c), c.req.param('fileId'))))
  app.post(`${base}/resources/:resourceId/download`, limit(downloadLimiter, clientKey), run('No se pudo preparar la descarga.', (c, companyId, guest) => sessions.downloadResource(companyId, guest, sid(c), c.req.param('resourceId'))))
}
