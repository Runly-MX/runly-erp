import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryAdminService, legacyStatusReason } from '../inventory-admin-service.js';

const COMPANY = '01900000-0000-7000-8000-000000000001';
const ITEM = '01900000-0000-7000-8000-0000000000aa';

function setup(item = {}, acts = null) {
  const state = {
    item: { id: ITEM, companyId: COMPANY, name: 'Laptop', assetTag: 'INV-1', enabled: true, adminStatus: 'registered', status: 'assigned', deregistrationReason: null, ...item },
    events: [],
    closedAssignments: 0,
    notified: [],
  };
  const tx = {
    invItem: {
      findFirst: async ({ where }) => (where.id === state.item.id ? state.item : null),
      update: async ({ data }) => Object.assign(state.item, data),
    },
    invAssignment: { updateMany: async () => { state.closedAssignments += 1; return { count: 1 }; } },
    invItemAdminEvent: { create: async ({ data }) => { state.events.push(data); return data; } },
  };
  const prisma = { ...tx, $transaction: async (fn) => fn(tx), fileAsset: { findFirst: async () => ({ id: 'f' }) }, $queryRaw: async () => [{ id: 'batch-1' }] };
  const service = createInventoryAdminService({
    prisma,
    activityBridge: { logAndPublish: async () => {} },
    notifier: { notifyDeregistrationProposed: async (args) => state.notified.push(args) },
    acts,
  });
  return { state, service };
}

const all = () => true;

test('propose -> approve closes the assignment and records the reason', async () => {
  const { state, service } = setup();
  await service.transition({ itemId: ITEM, action: 'propose_deregistration', payload: { reason: 'damage' }, companyId: COMPANY, actorId: 'u1', can: all });
  assert.equal(state.item.adminStatus, 'deregistration_proposed');
  assert.equal(state.notified.length, 1);
  await service.transition({ itemId: ITEM, action: 'approve_deregistration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u2', can: all });
  assert.equal(state.item.adminStatus, 'deregistered');
  assert.equal(state.item.status, 'available');
  assert.equal(state.item.assignedToId, null);
  assert.equal(state.item.deregistrationReason, 'damage');
  assert.equal(state.closedAssignments, 1);
  assert.deepEqual(state.events.map((e) => e.action), ['propose_deregistration', 'approve_deregistration']);
});

test('wrong source state is a 409 and missing payload a 400', async () => {
  const { service } = setup();
  await assert.rejects(
    service.transition({ itemId: ITEM, action: 'approve_deregistration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u', can: all }),
    (err) => err.status === 409,
  );
  await assert.rejects(
    service.transition({ itemId: ITEM, action: 'propose_deregistration', payload: {}, companyId: COMPANY, actorId: 'u', can: all }),
    (err) => err.status === 400,
  );
});

test('approving without the deregister permission is refused', async () => {
  const { service } = setup({ adminStatus: 'deregistration_proposed' });
  await assert.rejects(
    service.transition({ itemId: ITEM, action: 'approve_deregistration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u', can: (key) => key !== 'inventory.item.deregister' }),
    (err) => err.status === 403,
  );
});

test('reject and revert require a comment and clear the reason', async () => {
  const { state, service } = setup({ adminStatus: 'deregistered', deregistrationReason: 'loss', deregisteredAt: new Date() });
  await assert.rejects(service.transition({ itemId: ITEM, action: 'revert_deregistration', payload: {}, companyId: COMPANY, actorId: 'u', can: all }), (err) => err.status === 400);
  await service.transition({ itemId: ITEM, action: 'revert_deregistration', payload: { comment: 'Apareció' }, companyId: COMPANY, actorId: 'u', can: all });
  assert.equal(state.item.adminStatus, 'registered');
  assert.equal(state.item.deregistrationReason, null);
  assert.equal(state.item.deregisteredAt, null);
});

test('bulk returns a per-id result', async () => {
  const { service } = setup({ adminStatus: 'registration_pending' });
  const result = await service.bulkTransition({ ids: [ITEM, 'missing-id'], action: 'confirm_registration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u', can: all });
  assert.equal(result.applied, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results[1].ok, false);
});

test('a bulk action stamps every event with the same lote; a single one has none', async () => {
  const { state, service } = setup({ adminStatus: 'registration_pending' });
  const bulk = await service.bulkTransition({ ids: [ITEM, 'missing-id'], action: 'confirm_registration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u', can: all });
  assert.equal(bulk.batchId, 'batch-1');
  assert.deepEqual([state.events[0].batchId, state.events[0].batchSize], ['batch-1', 2]);
  const single = setup({ adminStatus: 'registration_pending' });
  await single.service.bulkTransition({ ids: [ITEM], action: 'confirm_registration', payload: { effectiveDate: '2026-09-29' }, companyId: COMPANY, actorId: 'u', can: all });
  assert.equal(single.state.events[0].batchId, null);
});

test('legacy statuses map to baja reasons', () => {
  assert.equal(legacyStatusReason('retired'), 'obsolescence');
  assert.equal(legacyStatusReason('stolen'), 'theft');
  assert.equal(legacyStatusReason('available'), null);
});

test('dashboard month keys and series alignment', async () => {
  const { monthKeys, alignSeries } = await import('../inventory-dashboard-service.js');
  const keys = monthKeys(3, new Date('2026-01-15T12:00:00Z'), 'America/Mexico_City');
  assert.deepEqual(keys, ['2025-11', '2025-12', '2026-01']);
  assert.deepEqual(alignSeries(keys, [{ month: '2025-12', n: 4 }]), [0, 4, 0]);
});

test('dashboard week buckets start on Monday', async () => {
  const { bucketKeys } = await import('../inventory-dashboard-service.js');
  // 2026-09-30 is a Wednesday.
  assert.deepEqual(bucketKeys('week', 3, new Date('2026-09-30T18:00:00Z'), 'America/Mexico_City'), ['2026-09-14', '2026-09-21', '2026-09-28']);
  assert.deepEqual(bucketKeys('month', 2, new Date('2026-09-30T18:00:00Z'), 'America/Mexico_City'), ['2026-08-01', '2026-09-01']);
});

function fakeActs() {
  const created = [];
  return {
    created,
    prepareSignature: async (signature) => (signature ? Buffer.from('png') : null),
    snapshotItem: async (_tx, it) => ({ itemId: it.id, name: it.name }),
    createForApproval: async (args) => { created.push(args); return { id: 'act-1', folio: 'BAJA-2026-0001' }; },
  };
}
const approve = (service, payload, extra = {}) => service.transition({
  itemId: ITEM, action: 'approve_deregistration', payload, companyId: COMPANY, actorId: 'u2', can: all, ...extra,
});

test('approving with actas requires a signature or an explicit paper signature', async () => {
  const acts = fakeActs();
  const { state, service } = setup({ adminStatus: 'deregistration_proposed' }, acts);
  await assert.rejects(approve(service, { effectiveDate: '2026-10-21' }), /Firma el acta/);
  assert.equal(state.item.adminStatus, 'deregistration_proposed');
  const result = await approve(service, { effectiveDate: '2026-10-21', signature: { pngBase64: 'x' }, approverTitle: 'Gerente de administración', comment: 'Autorizada' });
  assert.equal(result.act.folio, 'BAJA-2026-0001');
  assert.equal(acts.created.length, 1);
  assert.equal(acts.created[0].approverTitle, 'Gerente de administración');
  assert.deepEqual(acts.created[0].entries[0].snapshot, { itemId: ITEM, name: 'Laptop' });
});

test('a failing acta never undoes the approval', async () => {
  const acts = { ...fakeActs(), createForApproval: async () => { throw new Error('boom'); } };
  const { state, service } = setup({ adminStatus: 'deregistration_proposed' }, acts);
  const result = await approve(service, { effectiveDate: '2026-10-21', signOnPaper: true });
  assert.equal(state.item.adminStatus, 'deregistered');
  assert.equal(result.act, null);
});

test('a bulk approval produces one acta for the whole lote', async () => {
  const acts = fakeActs();
  const { service } = setup({ adminStatus: 'deregistration_proposed' }, acts);
  const out = await service.bulkTransition({ ids: [ITEM, ITEM.replace(/aa$/, 'bb')], action: 'approve_deregistration', payload: { effectiveDate: '2026-10-21', signOnPaper: true }, companyId: COMPANY, actorId: 'u2', can: all });
  assert.equal(out.applied, 1);
  assert.equal(acts.created.length, 1);
  assert.equal(acts.created[0].batchId, 'batch-1');
});
