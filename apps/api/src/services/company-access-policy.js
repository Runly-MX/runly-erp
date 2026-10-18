// Identity authentication survives membership loss; business authorization does
// not. Recovery/bootstrap endpoints remain reachable with an existing account.
const BOOTSTRAP = new Set(['/user/me', '/memberships/me', '/companies/deletions', '/collaboration/invitations/accept'])

// loadContext (optional): the API's per-request user context loader. When
// given, the check reuses its active memberships (same filters: enabled
// profile, membership, company and role, role of the same company) and keeps
// the context on the request, instead of loading the same rows twice.
export function createCompanyAccessPolicy({ prisma, loadContext = null }) {
  async function activeMemberships(c, authUserId) {
    if (loadContext) {
      const context = await loadContext(authUserId)
      if (context) c.set('userContext', context)
      return context?.memberships ?? []
    }
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId },
      include: { memberships: { where: { enabled: true, company: { enabled: true } }, include: { role: true } } },
    })
    return profile?.enabled ? profile.memberships.filter(m => m.role?.enabled !== false && (!m.role?.companyId || m.role.companyId === m.companyId)) : []
  }

  return async function authorizeIdentity(c, authUserId) {
    const path = c.req.path
    if (BOOTSTRAP.has(path) || /^\/companies\/[0-9a-f-]+\/deletion(?:\/cancel)?$/.test(path)) return null
    const memberships = await activeMemberships(c, authUserId)
    if (!memberships.length) return c.json({ error: 'no_active_company', message: 'Tu cuenta no tiene acceso a ninguna empresa. Contacta al administrador.' }, 403)
    const companyId = c.req.header('X-Runly-Company-Id')
    if (companyId && !memberships.some(m => m.companyId === companyId)) return c.json({ error: 'company_not_member', message: 'No tienes acceso a esta empresa.' }, 403)
    // A global schema/package mutation could recreate data or snapshots while a
    // tenant is being purged. During the recovery window (PENDING) it is allowed:
    // write guards cover new tables on the next lifecycle tick. Reads and
    // unrelated business activity remain usable.
    if (!['GET','HEAD','OPTIONS'].includes(c.req.method) && /^\/(modules|module-builder|builder|catalog\/modules)(\/|$)/.test(path)) {
      const [pending] = await prisma.$queryRawUnsafe("SELECT EXISTS(SELECT 1 FROM runly_lifecycle.company_deletion WHERE state IN ('PURGING','FAILED')) AS found")
      if (pending.found) return c.json({ error: 'company_deletion_in_progress', message: 'Hay un borrado definitivo de empresa en curso. Los cambios de módulos estarán disponibles al terminar.' }, 409)
    }
    return null
  }
}
