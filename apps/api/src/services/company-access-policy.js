// Identity authentication survives membership loss; business authorization does
// not. Recovery/bootstrap endpoints remain reachable with an existing account.
const BOOTSTRAP = new Set(['/user/me', '/memberships/me', '/companies/deletions', '/collaboration/invitations/accept'])

export function createCompanyAccessPolicy({ prisma }) {
  return async function authorizeIdentity(c, authUserId) {
    const path = c.req.path
    if (BOOTSTRAP.has(path) || /^\/companies\/[0-9a-f-]+\/deletion(?:\/cancel)?$/.test(path)) return null
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId },
      include: { memberships: { where: { enabled: true, company: { enabled: true } }, include: { role: true } } },
    })
    const memberships = profile?.enabled ? profile.memberships.filter(m => m.role?.enabled !== false && (!m.role?.companyId || m.role.companyId === m.companyId)) : []
    if (!memberships.length) return c.json({ error: 'no_active_company', message: 'Tu cuenta no tiene acceso a ninguna empresa. Contacta al administrador.' }, 403)
    const companyId = c.req.header('X-Runly-Company-Id')
    if (companyId && !memberships.some(m => m.companyId === companyId)) return c.json({ error: 'company_not_member', message: 'No tienes acceso a esta empresa.' }, 403)
    // A global schema/package mutation could recreate data or snapshots while
    // a tenant is frozen. Reads and unrelated business activity remain usable.
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method) && /^\/(modules|module-builder|builder|catalog\/modules)(\/|$)/.test(path)) {
      const [pending] = await prisma.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM runly_lifecycle.company_deletion WHERE state IN ('PENDING','PURGING','FAILED')) AS found")
      if (pending.found) return c.json({ error: 'company_deletion_in_progress', message: 'Hay una eliminación de empresa pendiente. Los cambios de módulos estarán disponibles al terminar o cancelarla.' }, 409)
    }
    return null
  }
}
