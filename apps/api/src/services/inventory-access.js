import { computeScopedPermissions, isSystemAdminMembership, resolveActiveMembership } from '../lib/tenant-context.js';
import { InventoryServiceError } from './inventory-service.js';
import { createInventoryScope } from './inventory-scope.js';

export function createInventoryAccess({ prisma, inventoryScope = createInventoryScope({ prisma }) }) {
  async function assertCurrent({ companyId, actorId }, permissions = ['inventory.item.read']) {
    if (!companyId || !actorId) throw new InventoryServiceError('Sin empresa o usuario autorizado.', 403);
    const memberships = await prisma.membership.findMany({ where: { userId: actorId, enabled: true, user: { enabled: true }, role: { enabled: true } },
      include: { company: { select: { enabled: true } }, role: { include: { permissions: { where: { permission: { active: true } }, include: { permission: { select: { key: true } } } } } } } });
    const resolved = resolveActiveMembership({ memberships, requestedCompanyId: companyId });
    if (!resolved.ok || !resolved.membership) throw new InventoryServiceError('Ya no tienes acceso a esta empresa.', 403);
    const grants = await prisma.userPermissionGrant.findMany({ where: { userId: actorId, companyId, permission: { active: true } }, include: { permission: { select: { key: true } } } });
    const access = computeScopedPermissions({ activeMembership: resolved.membership, grantKeysForCompany: grants.map(g => g.permission.key) });
    const isAdmin = access.isCompanyAdmin || isSystemAdminMembership(memberships);
    if (!isAdmin && permissions.some(p => !access.permissionSet.has(p))) {
      throw new InventoryServiceError('Ya no tienes permiso para consultar o registrar este inventario.', 403);
    }
    // Same shape as the HTTP `userContext`, so the area scope can be resolved from it.
    return { isAdmin, permissionSet: access.permissionSet };
  }
  // Area scope of an actor outside an HTTP request (MirAI, MCP). The permission set is re-read
  // here; if the actor no longer has access, assertCurrent throws (fail closed).
  async function scopeFor({ companyId, actorId }, permissions) {
    const userContext = await assertCurrent({ companyId, actorId }, permissions);
    return inventoryScope.resolve({ companyId, userId: actorId, userContext });
  }
  // null = unrestricted; otherwise the area ids the actor can see (for raw SQL readers).
  async function areaIdsFor(identity, permissions) {
    const scope = await scopeFor(identity, permissions);
    return scope.all ? null : [...scope.roles.keys()];
  }
  return { assertCurrent, scopeFor, areaIdsFor };
}
