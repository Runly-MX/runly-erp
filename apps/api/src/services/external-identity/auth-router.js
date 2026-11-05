// HTTP surface of External Identity. A consumer module mounts this router wherever its public pages live
// and supplies resolveRealm(c): the realm this request belongs to (or null). The session is an httpOnly
// cookie set by that same host, never a bearer token, so no ERP route can ever accept it.
import { Hono } from 'hono'
import { z } from 'zod'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createTokenBucketLimiter } from '../../lib/token-bucket-limiter.js'
import { ExternalIdentityError, PASSWORD_MAX, PASSWORD_MIN, publicAccount } from './identity-service.js'

const email = z.string().trim().email().max(254)
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)
const name = z.string().trim().min(1).max(120)
const phone = z.string().trim().max(40).nullable().optional()
export const externalAuthSchemas = {
  register: z.object({ email, password, displayName: name, phone, turnstileToken: z.string().max(4096).optional() }).strict(),
  login: z.object({ email, password: z.string().min(1).max(PASSWORD_MAX) }).strict(),
  profile: z.object({ displayName: name.optional(), phone }).strict(),
  passwordChange: z.object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: password }).strict(),
  token: z.object({ token: z.string().min(16).max(200) }).strict(),
  forgot: z.object({ email }).strict(),
  reset: z.object({ token: z.string().min(16).max(200), password }).strict(),
}

const clientIp = (c) => c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local'
const isHttps = (c) => new URL(c.req.url).protocol === 'https:' || c.req.header('x-forwarded-proto') === 'https'
// __Host- pins the cookie to this exact host over HTTPS; plain http (local dev) cannot use the prefix.
const cookieName = (c) => isHttps(c) ? '__Host-rx_session' : 'rx_session'
export const readSessionCookie = (c) => getCookie(c, '__Host-rx_session') ?? getCookie(c, 'rx_session') ?? null

function writeSessionCookie(c, { token, maxAgeSeconds }) {
  setCookie(c, cookieName(c), token, { httpOnly: true, secure: isHttps(c), sameSite: 'Lax', path: '/', maxAge: maxAgeSeconds })
}
function clearSessionCookie(c) {
  for (const n of ['__Host-rx_session', 'rx_session']) deleteCookie(c, n, { path: '/', secure: n.startsWith('__Host-') })
}

// Sets c.get('externalAccount') / c.get('externalSession') / c.get('externalRealm'); 401 otherwise.
// Other modules use it to protect their own visitor routes behind the same realm.
export function requireExternalAccount({ identity, resolveRealm }) {
  return async (c, next) => {
    const realm = await resolveRealm(c)
    if (!realm) return c.json({ error: 'Recurso no encontrado.', code: 'NOT_FOUND' }, 404)
    const found = await identity.sessionFromToken({ realm, token: readSessionCookie(c) })
    if (!found) return c.json({ error: 'Inicia sesión para continuar.', code: 'UNAUTHENTICATED' }, 401)
    c.set('externalRealm', realm); c.set('externalAccount', found.account); c.set('externalSession', found.session)
    return next()
  }
}

// verifyHuman({ c, realm, token }) -> boolean, optional (website: Turnstile when the site has a key).
export function createExternalAuthRouter({
  identity, resolveRealm, verifyHuman = null,
  limiters = {
    login: createTokenBucketLimiter({ capacity: 10, refillPerSecond: 10 / 60 }),
    register: createTokenBucketLimiter({ capacity: 5, refillPerSecond: 5 / 60 }),
    email: createTokenBucketLimiter({ capacity: 3, refillPerSecond: 3 / 60 }),
  },
}) {
  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof ExternalIdentityError) return c.json({ error: error.message, code: error.code }, error.status)
    console.error('[external-identity] request failed', error?.name ?? 'Error')
    return c.json({ error: 'No se pudo completar la solicitud.', code: 'INTERNAL' }, 500)
  })

  // Every route lives inside a realm. Mutations must be JSON from the same origin: with SameSite=Lax this
  // closes cross-site form posts, which cannot send application/json without a CORS preflight.
  app.use('*', async (c, next) => {
    const realm = await resolveRealm(c)
    if (!realm?.enabled) return c.json({ error: 'Recurso no encontrado.', code: 'NOT_FOUND' }, 404)
    if (c.req.method !== 'GET') {
      if (!c.req.header('content-type')?.includes('application/json')) return c.json({ error: 'Solicitud no válida.', code: 'VALIDATION_ERROR' }, 415)
      const origin = c.req.header('origin')
      if (origin && new URL(origin).host !== c.req.header('host')) return c.json({ error: 'Origen no permitido.', code: 'FORBIDDEN' }, 403)
    }
    c.set('externalRealm', realm)
    return next()
  })

  const limit = (bucket, key) => async (c, next) => {
    const result = limiters[bucket].consume(`${c.get('externalRealm').id}:${key(c)}`)
    if (!result.allowed) { c.header('Retry-After', String(result.retryAfter)); return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' }, 429) }
    return next()
  }
  const body = (schema) => async (c, next) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Revisa los datos enviados.', code: 'VALIDATION_ERROR', details: parsed.error.flatten().fieldErrors }, 422)
    c.set('body', parsed.data); return next()
  }
  const signedIn = async (c, next) => {
    const found = await identity.sessionFromToken({ realm: c.get('externalRealm'), token: readSessionCookie(c) })
    if (!found) { clearSessionCookie(c); return c.json({ error: 'Inicia sesión para continuar.', code: 'UNAUTHENTICATED' }, 401) }
    c.set('externalAccount', found.account); c.set('externalSession', found.session); return next()
  }
  const ua = (c) => c.req.header('user-agent') ?? null
  // Email links point back to the host the visitor used (a site can have several names).
  const requestContext = (c) => ({ origin: `${isHttps(c) ? 'https' : 'http'}://${c.req.header('host')}` })

  app.post('/register', limit('register', clientIp), body(externalAuthSchemas.register), async (c) => {
    const realm = c.get('externalRealm'), { turnstileToken, ...data } = c.get('body')
    if (verifyHuman && !(await verifyHuman({ c, realm, token: turnstileToken }))) return c.json({ error: 'No pudimos verificar que eres una persona.', code: 'CHALLENGE_FAILED' }, 403)
    const result = await identity.register({ realm, ...data, userAgent: ua(c), context: requestContext(c) })
    if (result.session) writeSessionCookie(c, result.session)
    return c.json(result.session ? { account: result.account } : { verificationRequired: true }, 201)
  })

  app.post('/login', limit('login', clientIp), body(externalAuthSchemas.login), async (c) => {
    const realm = c.get('externalRealm'), { email: mail, password: pass } = c.get('body')
    const perEmail = limiters.login.consume(`${realm.id}:email:${mail.toLowerCase()}`)
    if (!perEmail.allowed) { c.header('Retry-After', String(perEmail.retryAfter)); return c.json({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' }, 429) }
    const result = await identity.login({ realm, email: mail, password: pass, userAgent: ua(c) })
    writeSessionCookie(c, result.session)
    return c.json({ account: result.account })
  })

  app.post('/logout', async (c) => {
    await identity.logout({ token: readSessionCookie(c) })
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  app.get('/me', signedIn, (c) => c.json({ account: publicAccount(c.get('externalAccount')) }))
  app.patch('/me', signedIn, body(externalAuthSchemas.profile), async (c) =>
    c.json({ account: await identity.updateProfile({ account: c.get('externalAccount'), ...c.get('body') }) }))
  app.post('/me/password', signedIn, body(externalAuthSchemas.passwordChange), async (c) => {
    await identity.changePassword({ account: c.get('externalAccount'), session: c.get('externalSession'), ...c.get('body') })
    return c.body(null, 204)
  })

  app.post('/verify-email/request', limit('email', clientIp), signedIn, async (c) => {
    await identity.requestEmailVerification({ realm: c.get('externalRealm'), account: c.get('externalAccount'), context: requestContext(c) })
    return c.body(null, 204)
  })
  app.post('/verify-email', limit('login', clientIp), body(externalAuthSchemas.token), async (c) =>
    c.json({ account: await identity.verifyEmail({ realm: c.get('externalRealm'), token: c.get('body').token }) }))

  app.post('/password/forgot', limit('email', clientIp), body(externalAuthSchemas.forgot), async (c) => {
    await identity.requestPasswordReset({ realm: c.get('externalRealm'), email: c.get('body').email, context: requestContext(c) })
    return c.body(null, 204)
  })
  app.post('/password/reset', limit('login', clientIp), body(externalAuthSchemas.reset), async (c) => {
    await identity.resetPassword({ realm: c.get('externalRealm'), ...c.get('body') })
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  return app
}
