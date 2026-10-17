// /public/lms/share/:token/* — course share links for external guests. No user
// auth: the link token is in the path and the guest sends `Authorization: Guest <token>`.
// Rate limited per client IP: one bucket for every guest call, a stricter one for /join.

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

// guest: createLmsGuestService. fail(c, error, fallback) maps LmsError to its status.
export function registerLmsSharePublicRoutes(app, { guest, limiter, joinLimiter, clientKey, fail }) {
  const base = '/public/lms/share/:token'
  const token = (c) => c.req.param('token')
  const auth = (c) => c.req.header('authorization')
  const body = (c) => c.req.json().catch(() => ({}))
  const run = (fallback, fn, status = 200) => async (c) => {
    c.header('Cache-Control', 'no-store')
    try { return c.json({ data: await fn(c) }, status) } catch (error) { return fail(c, error, fallback) }
  }

  app.use('/public/lms/share/*', limit(limiter, clientKey))

  app.get(base, run('No se pudo abrir el curso.', (c) => guest.summary(token(c))))
  app.post(`${base}/join`, limit(joinLimiter, clientKey), run('No se pudo entrar al curso.', async (c) => guest.join(token(c), await body(c), auth(c))))
  app.get(`${base}/me`, run('No se pudo cargar el curso.', (c) => guest.me(token(c), auth(c))))
  app.get(`${base}/lessons/:lessonId`, run('No se pudo abrir la lección.', (c) => guest.openLesson(token(c), auth(c), c.req.param('lessonId'))))
  app.post(`${base}/lessons/:lessonId/progress`, run('No se pudo guardar el avance.', async (c) => guest.saveProgress(token(c), auth(c), c.req.param('lessonId'), await body(c))))

  app.get(`${base}/lessons/:lessonId/quiz`, run('No se pudo cargar el examen.', (c) => guest.getQuiz(token(c), auth(c), c.req.param('lessonId'))))
  app.post(`${base}/lessons/:lessonId/attempts`, async (c) => {
    c.header('Cache-Control', 'no-store')
    try {
      const { attempt, resumed } = await guest.startAttempt(token(c), auth(c), c.req.param('lessonId'))
      return c.json({ data: attempt }, resumed ? 200 : 201)
    } catch (error) { return fail(c, error, 'No se pudo iniciar el intento.') }
  })
  app.get(`${base}/attempts/:attemptId`, run('No se pudo cargar el intento.', (c) => guest.getAttempt(token(c), auth(c), c.req.param('attemptId'))))
  app.put(`${base}/attempts/:attemptId/answers`, run('No se pudieron guardar las respuestas.', async (c) => guest.saveAnswers(token(c), auth(c), c.req.param('attemptId'), await body(c))))
  app.post(`${base}/attempts/:attemptId/submit`, run('No se pudo enviar el examen.', async (c) => guest.submitAttempt(token(c), auth(c), c.req.param('attemptId'), await body(c))))
}
