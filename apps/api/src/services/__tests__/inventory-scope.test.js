import test from 'node:test';
import assert from 'node:assert/strict';
import { expandAreaRoles, scopeWhere, canViewArea, canWriteArea, createInventoryScope } from '../inventory-scope.js';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b'; // child of A
const C = '01900000-0000-7000-8000-00000000000c'; // child of B
const D = '01900000-0000-7000-8000-00000000000d'; // unrelated root
const areas = [{ id: A, parentId: null }, { id: B, parentId: A }, { id: C, parentId: B }, { id: D, parentId: null }];

test('membership on a parent covers descendants and the strongest role wins', () => {
  const roles = expandAreaRoles(areas, [{ areaId: A, role: 'viewer' }, { areaId: C, role: 'editor' }]);
  assert.equal(roles.get(A), 'viewer'); assert.equal(roles.get(B), 'viewer'); assert.equal(roles.get(C), 'editor');
  assert.equal(roles.has(D), false);
});

test('a child whose parent is disabled (absent) is treated as a root', () => {
  const roles = expandAreaRoles([{ id: B, parentId: A }], [{ areaId: B, role: 'manager' }]);
  assert.equal(roles.get(B), 'manager');
});

test('scopeWhere: all -> null; limited -> area filter; empty -> matches nothing', () => {
  assert.equal(scopeWhere({ all: true }), null);
  assert.deepEqual(scopeWhere({ all: false, roles: new Map([[A, 'viewer']]) }), { areaId: { in: [A] } });
  assert.deepEqual(scopeWhere({ all: false, roles: new Map() }), { areaId: { in: [] } });
});

test('view/write checks', () => {
  const s = { all: false, roles: new Map([[A, 'viewer'], [B, 'editor']]) };
  assert.equal(canViewArea(s, A), true); assert.equal(canViewArea(s, null), false); assert.equal(canViewArea(s, D), false);
  assert.equal(canWriteArea(s, A), false); assert.equal(canWriteArea(s, B), true);
  assert.equal(canViewArea({ all: true }, null), true); assert.equal(canWriteArea({ all: true }, null), true);
});

test('resolve: feature off or scope.all -> all; otherwise memberships', async () => {
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => (where.key.endsWith(':co1') ? { value: 'true' } : null) },
    invArea: { findMany: async () => areas.map((a) => ({ ...a, companyId: 'co1' })) },
    invAreaMember: { findMany: async () => [{ areaId: A, role: 'viewer' }] },
  };
  const scope = createInventoryScope({ prisma });
  const ctx = (extra) => ({ isAdmin: false, permissionSet: new Set(extra) });
  assert.equal((await scope.resolve({ companyId: 'co2', userId: 'u', userContext: ctx([]) })).all, true);
  assert.equal((await scope.resolve({ companyId: 'co1', userId: 'u', userContext: ctx(['inventory.scope.all']) })).all, true);
  assert.equal((await scope.resolve({ companyId: 'co1', userId: 'u', userContext: { isAdmin: true, permissionSet: new Set() } })).all, true);
  const limited = await scope.resolve({ companyId: 'co1', userId: 'u', userContext: ctx([]) });
  assert.equal(limited.all, false); assert.deepEqual([...limited.roles.keys()].sort(), [A, B, C].sort());
});
