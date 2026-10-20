// inventory-scope.js - which inventory areas a user may see/edit.
// Scoping is opt-in per company (InstanceConfig `inventory.areas.enabled:<companyId>`); when off,
// or for admins / holders of inventory.scope.all, the scope is `{ all: true }` (no filtering).
const RANK = { viewer: 1, editor: 2, manager: 3 };
const best = (a, b) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

export const SCOPE_ALL_PERMISSION = 'inventory.scope.all';
export const areasEnabledKey = (companyId) => `inventory.areas.enabled:${companyId}`;

// areas: enabled areas [{ id, parentId }]; memberships: [{ areaId, role }] of one user.
// Returns Map(areaId -> role) including descendants of every member area.
export function expandAreaRoles(areas, memberships) {
  const ids = new Set(areas.map((a) => a.id));
  const children = new Map();
  const roots = [];
  for (const a of areas) {
    if (a.parentId && ids.has(a.parentId)) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a.id]);
    else roots.push(a.id);
  }
  const direct = new Map(memberships.map((m) => [m.areaId, m.role]));
  const roles = new Map();
  const seen = new Set();
  const visit = (id, inherited) => {
    if (seen.has(id)) return;
    seen.add(id);
    const role = direct.has(id) ? (inherited ? best(inherited, direct.get(id)) : direct.get(id)) : inherited;
    if (role) roles.set(id, role);
    for (const child of children.get(id) ?? []) visit(child, role);
  };
  roots.forEach((id) => visit(id, null));
  return roles;
}

// Prisma where-fragment for inv_item, or null when unrestricted.
export function scopeWhere(scope) {
  if (!scope || scope.all) return null;
  return { areaId: { in: [...scope.roles.keys()] } };
}

export const canViewArea = (scope, areaId) => Boolean(scope?.all || (areaId && scope?.roles?.has(areaId)));
export const canWriteArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.editor));
export const canManageArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.manager));

export function createInventoryScope({ prisma }) {
  async function isEnabled(companyId) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: areasEnabledKey(companyId) } });
    return row?.value === 'true';
  }
  // input: { companyId, userId (profile id), userContext } as set by the auth middleware.
  async function resolve({ companyId, userId, userContext }) {
    if (userContext?.isAdmin || userContext?.permissionSet?.has?.(SCOPE_ALL_PERMISSION)) return { all: true };
    if (!(await isEnabled(companyId))) return { all: true };
    const [areas, members] = await Promise.all([
      prisma.invArea.findMany({ where: { companyId, enabled: true }, select: { id: true, parentId: true } }),
      prisma.invAreaMember.findMany({ where: { userId, area: { companyId, enabled: true } }, select: { areaId: true, role: true } }),
    ]);
    return { all: false, userId, companyId, roles: expandAreaRoles(areas, members) };
  }
  // Per-request memo so several guards in one request resolve once.
  async function fromContext(c) {
    const cached = c.get('invScope');
    if (cached) return cached;
    const scope = await resolve({ companyId: c.get('companyId'), userId: c.get('userId'), userContext: c.get('userContext') });
    c.set('invScope', scope);
    return scope;
  }
  return { resolve, fromContext, isEnabled };
}
