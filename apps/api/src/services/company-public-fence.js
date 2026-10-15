import { createHash } from 'node:crypto'

// Public capabilities bypass identity auth. Match their stored tokens/IDs to
// frozen owners before handing control to public routers (including WOPI).
export function createPublicCompanyFence({ prisma }) {
  return async function publicCompanyFence(c, next) {
    if (c.req.method === 'OPTIONS' || !/^\/(public|calls\/guest|wopi|office\/wopi)(\/|$)/.test(c.req.path)) return next()
    const [pending] = await prisma.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM runly_lifecycle.company_deletion WHERE state IN ('PENDING','PURGING','FAILED')) AS found")
    if (!pending.found) return next()
    const companySlug = c.req.header('X-Runly-Company')
    if (companySlug) {
      const [company] = await prisma.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM public.company c JOIN runly_lifecycle.company_deletion d ON d.company_id=c.id
        WHERE c.slug=$1 AND d.state<>'CANCELLED') AS blocked`, companySlug)
      if (company.blocked) return c.json({ error: 'company_pending_deletion' }, 410)
    }
    const url = new URL(c.req.url)
    const values = [...url.pathname.split('/').map(v => decodeURIComponent(v)), ...url.searchParams.values(), c.req.header('X-Runly-Company'), c.req.header('X-Runly-Company-Id'), c.req.header('Authorization')?.replace(/^Bearer /i,'')]
    values.push(...Array.from(url.pathname.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig), m => m[0]))
    // Phone enrollment and self-service capabilities are supplied in JSON.
    if (c.req.header('content-type')?.includes('application/json') && Number(c.req.header('content-length') ?? 0) < 65536) {
      const body = await c.req.raw.clone().json().catch(() => null)
      function collect(value, depth = 0) {
        if (typeof value === 'string' && value.length <= 256) values.push(value)
        else if (value && typeof value === 'object' && depth < 4) Object.values(value).forEach(v => collect(v, depth + 1))
      }
      collect(body)
    }
    const keys = [...new Set(values.filter(v => typeof v === 'string' && v.length > 0 && v.length <= 256))]
    // Guest sessions and phone credentials store SHA-256 hashes, not tokens.
    const hashes = keys.map(v => createHash('sha256').update(v).digest('hex'))
    const [blocked] = await prisma.$queryRawUnsafe('SELECT runly_lifecycle.blocked_capability($1::text[]) AS found', [...keys, ...hashes])
    if (blocked.found) return c.json({ error: 'company_pending_deletion', message: 'Este recurso no está disponible.' }, 410)
    return next()
  }
}
