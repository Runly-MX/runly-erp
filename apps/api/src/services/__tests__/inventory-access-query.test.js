// Focused coverage for the two reusable inventory helpers the MirAI capability
// (routes/inventory/inventory-mirai-queries.js, mirai-actions.js) depends on.
// Previously exercised inside inventory-assistant-service.test.js, which was
// removed with the inventory assistant it tested (2026-09-30-mirai-inventory-
// capability).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryAccess } from '../inventory-access.js';
import { buildInventoryWhere, inventoryDayStart } from '../inventory-query.js';

const COMPANY = '01900000-0000-7000-8000-000000000001';
const ACTOR = '01900000-0000-7000-8000-000000000002';
const OTHER_COMPANY = '01900000-0000-7000-8000-000000000004';

test('fresh access checks never combine permission grants from multiple companies', async () => {
  const grants = [];
  let memberships = [{ companyId: COMPANY, company: { enabled: true }, role: { key: 'viewer', permissions: [{ permission: { key: 'inventory.item.read' } }] } }];
  const access = createInventoryAccess({ prisma: {
    membership: { findMany: async (q) => { assert.equal(q.where.userId, ACTOR); assert.equal(q.where.enabled, true); return memberships; } },
    userPermissionGrant: { findMany: async (q) => { grants.push(q); return []; } },
  } });
  await access.assertCurrent({ companyId: COMPANY, actorId: ACTOR });
  await assert.rejects(access.assertCurrent({ companyId: COMPANY, actorId: ACTOR }, ['inventory.item.create']), (e) => e.status === 403);
  await assert.rejects(access.assertCurrent({ companyId: OTHER_COMPANY, actorId: ACTOR }), (e) => e.status === 403);
  assert.ok(grants.every((q) => q.where.companyId === COMPANY));
  memberships = [];
  await assert.rejects(access.assertCurrent({ companyId: COMPANY, actorId: ACTOR }), (e) => e.status === 403);
});

test('inventory query keeps search, optional filters and missing-serial checks conjunctive', () => {
  const where = buildInventoryWhere(COMPANY, { search: 'Laptop', missingSerial: true, status: 'available' });
  assert.equal(where.companyId, COMPANY); assert.equal(where.enabled, true); assert.equal(where.status, 'available');
  assert.equal(where.OR.length, 3); assert.equal(where.AND[0].OR.length, 2);
  assert.throws(() => buildInventoryWhere(null));
});

test('inventory day boundaries use the configured time zone, including daylight-saving transitions', () => {
  assert.equal(inventoryDayStart('2026-09-01', 0, 'America/Mexico_City').getTime(), Date.parse('2026-09-01T06:00:00Z'));
  const start = inventoryDayStart('2026-03-08', 0, 'America/New_York');
  const end = inventoryDayStart('2026-03-08', 1, 'America/New_York');
  assert.equal(end - start, 23 * 60 * 60 * 1000);
});

test('inventory query composes the area scope into AND and ignores unrestricted scopes', () => {
  const limited = { all: false, roles: new Map([['a1', 'viewer']]) };
  const where = buildInventoryWhere(COMPANY, { missingSerial: true }, limited);
  assert.equal(where.AND.length, 2);
  assert.deepEqual(where.AND[1], { areaId: { in: ['a1'] } });
  assert.deepEqual(buildInventoryWhere(COMPANY, {}, { all: true }), buildInventoryWhere(COMPANY, {}));
  assert.deepEqual(buildInventoryWhere(COMPANY, {}, null), buildInventoryWhere(COMPANY, {}));
  // A user with no areas matches nothing.
  assert.deepEqual(buildInventoryWhere(COMPANY, {}, { all: false, roles: new Map() }).AND, [{ areaId: { in: [] } }]);
});
