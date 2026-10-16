import { computeScopedPermissions, isSystemAdminMembership } from '../lib/tenant-context.js';
import { createCompanyModuleService } from '../services/company-module-service.js';
import { insist } from './config.js';

export function createMcpAccess(prisma) {
  async function identity(authUserId) {
    const profile = await prisma.userProfile.findUnique({ where: { authUserId } });
    insist(profile?.enabled, 'invalid_token', 'La cuenta ya no está activa.', 401);
    const rows = await prisma.membership.findMany({ where: { userId: profile.id, enabled: true, company: { enabled: true }, role: { enabled: true } },
      include: { company: { select: { id: true, name: true, enabled: true } }, role: { include: { permissions: { where: { permission: { active: true } }, include: { permission: true } } } } } });
    const memberships = rows.filter(m => !m.role.companyId || m.role.companyId === m.companyId);
    insist(memberships.length, 'membership_revoked', 'No tienes una membresía activa.', 403);
    return { profile, memberships };
  }
  async function company(authUserId, companyId, permission = null) {
    const actor = await identity(authUserId);
    const membership = actor.memberships.find(m => m.companyId === companyId);
    insist(membership, 'company_not_member', 'No tienes acceso a esta empresa.', 403);
    const grants = await prisma.userPermissionGrant.findMany({ where: { userId: actor.profile.id, companyId, permission: { active: true } }, include: { permission: true } });
    const access = computeScopedPermissions({ activeMembership: membership, grantKeysForCompany: grants.map(g => g.permission.key), isSystemAdmin: isSystemAdminMembership(actor.memberships) });
    const isAdmin = access.isCompanyAdmin || isSystemAdminMembership(actor.memberships);
    const can = key => isAdmin || access.permissionSet.has(key);
    insist(!permission || can(permission), 'permission_denied', 'No tienes el permiso requerido.', 403);
    return { ...actor, companyId, can, actorProfileId: actor.profile.id, actorAuthUserId: authUserId, prisma };
  }
  async function modules(actx) {
    const disabled = await createCompanyModuleService({ prisma }).listDisabledModuleIds(actx.companyId);
    const rows = await prisma.runlyModule.findMany({ where: { enabled: true, status: 'INSTALLED' }, orderBy: { key: 'asc' } });
    return rows.filter(m => !disabled.has(m.id) && typeof m.manifest?.acl?.module === 'string' && actx.can(m.manifest.acl.module));
  }
  async function module(actx, moduleKey) {
    const row = (await modules(actx)).find(m => m.key === moduleKey || (moduleKey === 'runly.inventory' && m.key === 'atlas.inventory'));
    insist(row, 'module_unavailable', 'El módulo no está habilitado o autorizado para esta empresa.', 403);
    return row;
  }
  return { identity, company, modules, module };
}
