// inventory-scope.js - which inventory areas a user may see/edit.
// Scoping is opt-in per company (InstanceConfig `inventory.areas.enabled:<companyId>`); when off,
// or for admins / holders of inventory.scope.all, the scope is `{ all: true }` (no filtering).
// Own items: a limited user also sees items they created or that are assigned to them (read-only;
// writes stay area-based) unless `inventory.areas.includeOwn:<companyId>` is 'false' (default true).
import { Prisma } from '@prisma/client';

const RANK = { viewer: 1, editor: 2, manager: 3 };
const best = (a, b) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

export const SCOPE_ALL_PERMISSION = 'inventory.scope.all';
export const areasEnabledKey = (companyId) => `inventory.areas.enabled:${companyId}`;
export const includeOwnKey = (companyId) => `inventory.areas.includeOwn:${companyId}`;

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

// { createdById } / { assignedToId } clauses of the viewer's own items.
function identityClauses({ userId, employeeIds = [] } = {}) {
  return [
    ...(userId ? [{ createdById: userId }] : []),
    ...(employeeIds.length ? [{ assignedToId: { in: employeeIds } }] : []),
  ];
}

// Prisma where-fragment for inv_item, or null when unrestricted. Own clauses are OR-ed with the areas.
export function scopeWhere(scope) {
  if (!scope || scope.all) return null;
  const areas = { areaId: { in: [...scope.roles.keys()] } };
  const own = identityClauses(scope.own ?? undefined);
  return own.length ? { OR: [areas, ...own] } : areas;
}

// Raw SQL equivalent of scopeWhere for inv_item; `alias` is the table prefix ('' or 't.').
export function scopeSql(scope, alias = '') {
  if (!scope || scope.all) return Prisma.sql`TRUE`;
  const col = (name) => Prisma.raw(`${alias}${name}`);
  const parts = [Prisma.sql`${col('area_id')} = ANY(${[...scope.roles.keys()]}::uuid[])`];
  const { userId, employeeIds = [] } = scope.own ?? {};
  if (userId) parts.push(Prisma.sql`${col('created_by_id')} = ${userId}::uuid`);
  if (employeeIds.length) parts.push(Prisma.sql`${col('assigned_to_id')} = ANY(${employeeIds}::uuid[])`);
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

// "Mios" filter (everyone): created by me or assigned to me. No identity -> matches nothing.
export function mineWhere(mine) {
  const clauses = identityClauses(mine ?? undefined);
  return clauses.length ? { OR: clauses } : { id: { in: [] } };
}

export const canViewArea = (scope, areaId) => Boolean(scope?.all || (areaId && scope?.roles?.has(areaId)));
// Item-level read access: its area, or an own item (created by / assigned to the viewer).
export function canViewItem(scope, item) {
  if (!item) return false;
  if (canViewArea(scope, item.areaId)) return true;
  const { userId, employeeIds = [] } = scope?.own ?? {};
  return Boolean((userId && item.createdById === userId) || (item.assignedToId && employeeIds.includes(item.assignedToId)));
}
export const canWriteArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.editor));
export const canManageArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.manager));

export function createInventoryScope({ prisma }) {
  async function isEnabled(companyId) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: areasEnabledKey(companyId) } });
    return row?.value === 'true';
  }
  async function includeOwn(companyId) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: includeOwnKey(companyId) } });
    return row?.value !== 'false';
  }
  // Guest (external supplier) scope: only the areas it is a member of (plus descendants), whether or
  // not the company turned area scoping on, never `own` items, and never above editor.
  async function resolveGuest({ companyId, guestId }) {
    const [areas, members] = await Promise.all([
      prisma.invArea.findMany({ where: { companyId, enabled: true }, select: { id: true, parentId: true } }),
      prisma.invAreaMember.findMany({ where: { guestId, area: { companyId, enabled: true } }, select: { areaId: true, role: true } }),
    ]);
    const capped = members.map((m) => ({ areaId: m.areaId, role: m.role === 'editor' ? 'editor' : 'viewer' }));
    return { all: false, companyId, roles: expandAreaRoles(areas, capped), own: null, guest: { id: guestId } };
  }
  // Viewer identity for own items / "Mios": profile id plus the employee records linked to it.
  async function resolveMine({ companyId, userId }) {
    const employees = userId ? await prisma.hrEmployee.findMany({ where: { companyId, userProfileId: userId }, select: { id: true } }) : [];
    return { userId, employeeIds: employees.map((e) => e.id) };
  }
  // input: { companyId, userId (profile id), userContext } as set by the auth middleware.
  // `mine` may be a resolved identity or a function returning one (lets a request memoize it).
  async function resolve({ companyId, userId, userContext, mine = null }) {
    if (userContext?.isAdmin || userContext?.permissionSet?.has?.(SCOPE_ALL_PERMISSION)) return { all: true };
    if (!(await isEnabled(companyId))) return { all: true };
    const [areas, members, withOwn] = await Promise.all([
      prisma.invArea.findMany({ where: { companyId, enabled: true }, select: { id: true, parentId: true } }),
      prisma.invAreaMember.findMany({ where: { userId, area: { companyId, enabled: true } }, select: { areaId: true, role: true } }),
      includeOwn(companyId),
    ]);
    const identity = typeof mine === 'function' ? await mine() : mine;
    const own = withOwn ? (identity ?? (await resolveMine({ companyId, userId }))) : null;
    return { all: false, userId, companyId, roles: expandAreaRoles(areas, members), own };
  }
  // Viewer identity, resolved once per request.
  async function mineFromContext(c) {
    const cached = c.get('invMine');
    if (cached) return cached;
    const mine = await resolveMine({ companyId: c.get('companyId'), userId: c.get('userId') });
    c.set('invMine', mine);
    return mine;
  }
  // Per-request memo so several guards in one request resolve once.
  async function fromContext(c) {
    const cached = c.get('invScope');
    if (cached) return cached;
    const scope = await resolve({ companyId: c.get('companyId'), userId: c.get('userId'), userContext: c.get('userContext'), mine: () => mineFromContext(c) });
    c.set('invScope', scope);
    return scope;
  }
  return { resolve, resolveGuest, fromContext, mineFromContext, resolveMine, isEnabled, includeOwn };
}
