import { Hono } from 'hono'
import { CompanyDeletionError } from '../services/company-deletion-service.js'
import { createTokenBucketLimiter } from '../lib/token-bucket-limiter.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createCompanyDeletionRouter({ service, authMiddleware, supabaseAnon }) {
  const app = new Hono()
  const limiter = createTokenBucketLimiter({ capacity: 5, refillPerSecond: 1 / 60 })
  app.get('/companies/deletions', authMiddleware, async c => c.json({ data: await service.list(c.get('authUserId')) }))
  async function handle(c, cancel) {
    const companyId = c.req.param('companyId')
    if (!UUID.test(companyId)) return c.json({ error: 'Empresa inválida.' }, 422)
    try {
      const body = await c.req.json()
      if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'Solicitud inválida.' }, 422)
      if (!cancel) {
        const rate = limiter.consume(c.get('authUserId'))
        if (!rate.allowed) return c.json({ error: 'Demasiados intentos. Intenta más tarde.' }, 429)
        // Verify through Auth with an isolated client (no server session).
        const { data, error } = await supabaseAnon.auth.getUser(c.req.header('Authorization').slice(7))
        if (error || !data.user?.email || typeof body.password !== 'string') return c.json({ error: 'Confirma tu contraseña.' }, 401)
        const verified = await supabaseAnon.auth.signInWithPassword({ email: data.user.email, password: body.password })
        if (verified.error || verified.data.user?.id !== c.get('authUserId')) return c.json({ error: 'No se pudo confirmar tu contraseña.' }, 401)
      }
      const data = await service[cancel ? 'cancel' : 'request']({ companyId, authUserId: c.get('authUserId'), confirmation: body.confirmation })
      return c.json({ data })
    } catch (error) {
      if (error instanceof CompanyDeletionError) return c.json({ error: error.message }, error.status)
      if (error instanceof SyntaxError) return c.json({ error: 'Solicitud inválida.' }, 422)
      throw error
    }
  }
  app.post('/companies/:companyId/deletion', authMiddleware, c => handle(c, false))
  app.post('/companies/:companyId/deletion/cancel', authMiddleware, c => handle(c, true))
  return app
}
