import { computeScopedPermissions, isSystemAdminMembership } from '../lib/tenant-context.js';
import { createCompanyModuleService } from '../services/company-module-service.js';
import { insist } from './config.js';
import { createMcpState } from './state.js';

// With a cache, identity/company/module lookups are computed once per MCP HTTP
// request. Transactions (approval, commit, consent) build an uncached access so
// permissions are re-read inside the locked transaction.
export function createMcpAccess(prisma, cache = null) {
  const memo = (key, load) => {
    if (!cache) return load();
    if (!cache.has(key)) cache.set(key, load().catch(error => { cache.delete(key); throw error; }));
    return cache.get(key);
  };
  function identity(authUserId) {
    return memo(`identity:${authUserId}`, async () => {
      const profile = await prisma.userProfile.findUnique({ where: { authUserId } });
      insist(profile?.enabled, 'invalid_token', 'La cuenta ya no está activa.', 401);
      const rows = await prisma.membership.findMany({ where: { userId: profile.id, enabled: true, company: { enabled: true }, role: { enabled: true } },
        include: { company: { select: { id: true, name: true, enabled: true } }, role: { include: { permissions: { where: { permission: { active: true } }, include: { permission: true } } } } } });
      const memberships = rows.filter(m => !m.role.companyId || m.role.companyId === m.companyId);
      insist(memberships.length, 'membership_revoked', 'No tienes una membresía activa.', 403);
      return { profile, memberships };
    });
  }
  async function company(authUserId, companyId, permission = null) {
    const actx = await memo(`company:${authUserId}:${companyId}`, async () => {
      const actor = await identity(authUserId);
      const membership = actor.memberships.find(m => m.companyId === companyId);
      insist(membership, 'company_not_member', 'No tienes acceso a esta empresa.', 403);
      const grants = await prisma.userPermissionGrant.findMany({ where: { userId: actor.profile.id, companyId, permission: { active: true } }, include: { permission: true } });
      const access = computeScopedPermissions({ activeMembership: membership, grantKeysForCompany: grants.map(g => g.permission.key), isSystemAdmin: isSystemAdminMembership(actor.memberships) });
      const isAdmin = access.isCompanyAdmin || isSystemAdminMembership(actor.memberships);
      const can = key => isAdmin || access.permissionSet.has(key);
      return { ...actor, companyId, can, permissionSet: access.permissionSet, isAdmin, actorProfileId: actor.profile.id, actorAuthUserId: authUserId, prisma };
    });
    insist(!permission || actx.can(permission), 'permission_denied', 'No tienes el permiso requerido.', 403);
    return actx;
  }
  async function modules(actx) {
    const rows = await memo(`modules:${actx.companyId}`, async () => {
      const disabled = await createCompanyModuleService({ prisma }).listDisabledModuleIds(actx.companyId);
      const installed = await prisma.runlyModule.findMany({ where: { enabled: true, status: 'INSTALLED' }, orderBy: { key: 'asc' } });
      return installed.filter(m => !disabled.has(m.id));
    });
    return rows.filter(m => typeof m.manifest?.acl?.module === 'string' && actx.can(m.manifest.acl.module));
  }
  async function module(actx, moduleKey) {
    const row = (await modules(actx)).find(m => m.key === moduleKey || m.key === moduleKey.replace(/^runly\./, 'atlas.'));
    insist(row, 'module_unavailable', 'El módulo no está habilitado o autorizado para esta empresa.', 403);
    return row;
  }
  return { identity, company, modules, module };
}

// Request-scoped access attached by oauth.authenticate. Falls back to a fresh,
// uncached access for transaction clients or callers without an MCP request.
export function accessFor(auth, db, prisma) {
  return db === prisma && auth?.access ? auth.access : createMcpAccess(db);
}

// The grant was validated by oauth.authenticate earlier in this same request;
// reuse it there. Transactions and proposal replays re-read the stored grant.
export async function liveGrant(auth, db, prisma) {
  if (db === prisma && auth?.access) return { payload: auth };
  return createMcpState(db).get('grant', auth.grantId);
}
