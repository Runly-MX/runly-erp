// scope-guard.js - area scoping for the inventory routes (spec 2026-10-20-inventory-areas-scoping).
//
// `withScopeGuard(requirePermission)` wraps the app's requirePermission so that, AFTER the
// tenant context exists (companyId / userContext are only set inside requirePermission), every
// route under /inventory/items/:id[/...] is checked against the caller's areas. Out-of-scope
// items answer 404 (never 403) so their existence is not revealed. Wrapping the factory, instead
// of `router.use(...)`, also protects the item routes of the sub-routers (admin, labels, ...).
//
// `rejectOutOfScope(c, ids, { write })` covers routes that carry item ids in the body/query.
import { canViewArea, canWriteArea } from '../../services/inventory-scope.js';

const ITEM_PATH = /^\/inventory\/items\/([^/]+)(?:\/|$)/;
// Literal segments that share the `/inventory/items/<x>` shape but are not item ids.
const NOT_AN_ID = new Set(['check-identifiers', 'bulk', 'validate-batch', 'admin-transition', 'by-employee', 'move']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const NOT_FOUND = { error: 'Item no encontrado.' };

export function itemIdFromPath(path) {
  const id = ITEM_PATH.exec(path)?.[1];
  return id && !NOT_AN_ID.has(id) ? id : null;
}

export function createScopeGuards({ prisma, inventoryScope }) {
  // Middleware: checks the item named in the path. Must run after requirePermission.
  const itemGuard = async (c, next) => {
    const id = itemIdFromPath(c.req.path);
    if (!id) return next();
    const scope = await inventoryScope.fromContext(c);
    if (scope.all) return next();
    const item = await prisma.invItem.findFirst({ where: { id, companyId: c.get('companyId'), enabled: true }, select: { areaId: true } });
    if (!item) return next(); // the handler answers its own 404
    const allowed = WRITE_METHODS.has(c.req.method) ? canWriteArea(scope, item.areaId) : canViewArea(scope, item.areaId);
    return allowed ? next() : c.json(NOT_FOUND, 404);
  };

  // Drop-in for `requirePermission`: permission check first, then the item guard.
  const withScopeGuard = (requirePermission) => (...args) => {
    const permission = requirePermission(...args);
    return (c, next) => permission(c, () => itemGuard(c, next));
  };

  // Item ids the caller may see (or write); the rest are filtered out.
  async function idsInScope(c, ids, { write = false } = {}) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'))];
    const scope = await inventoryScope.fromContext(c);
    if (scope.all || unique.length === 0) return unique;
    const rows = await prisma.invItem.findMany({ where: { id: { in: unique }, companyId: c.get('companyId') }, select: { id: true, areaId: true } });
    const allowed = rows.filter((row) => (write ? canWriteArea(scope, row.areaId) : canViewArea(scope, row.areaId)));
    return allowed.map((row) => row.id);
  }

  // -> null when every id is in scope, else a 404 Response (never a partial silent success).
  async function rejectOutOfScope(c, ids, options) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'))];
    const allowed = await idsInScope(c, unique, options);
    return allowed.length === unique.length ? null : c.json(NOT_FOUND, 404);
  }

  // Creating items: a limited user must choose an area where they can write (General needs scope.all).
  async function rejectUnwritableArea(c, areaId) {
    const scope = await inventoryScope.fromContext(c);
    if (scope.all || canWriteArea(scope, areaId || null)) return null;
    return c.json({ error: 'Elige un area donde puedas registrar items.' }, 403);
  }

  return { itemGuard, withScopeGuard, idsInScope, rejectOutOfScope, rejectUnwritableArea };
}
