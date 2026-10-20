import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryAreaService } from '../inventory-area-service.js';

const CO = '01900000-0000-7000-8000-0000000000c0';
const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b'; // child of A
const C = '01900000-0000-7000-8000-00000000000c'; // child of B
const U = '01900000-0000-7000-8000-0000000000f1';

function makePrisma(overrides = {}) {
  const calls = [];
  const areas = [
    { id: A, companyId: CO, parentId: null, name: 'A', enabled: true },
    { id: B, companyId: CO, parentId: A, name: 'B', enabled: true },
    { id: C, companyId: CO, parentId: B, name: 'C', enabled: true },
  ];
  const prisma = {
    calls,
    invArea: {
      findFirst: async ({ where }) => areas.find((a) => a.id === where.id && a.companyId === where.companyId && a.enabled) ?? null,
      findMany: async () => areas,
      create: async ({ data }) => ({ id: 'new', ...data }),
      update: async ({ where, data }) => { calls.push(['area.update', where.id, data]); return { id: where.id, ...data }; },
      updateMany: async (args) => { calls.push(['area.updateMany', args]); return { count: 1 }; },
    },
    invItem: {
      findMany: async () => [{ id: 'i1', areaId: A }, { id: 'i2', areaId: B }],
      updateMany: async (args) => { calls.push(['item.updateMany', args]); return { count: 2 }; },
    },
    membership: { findFirst: async () => null },
    invAreaMember: { upsert: async (args) => { calls.push(['member.upsert', args]); return args.create; } },
    $transaction: async (fn) => fn(prisma),
    ...overrides,
  };
  return prisma;
}

const status = (p) => p.then(() => null, (e) => e.status);

test('duplicate sibling name -> 409', async () => {
  const prisma = makePrisma();
  prisma.invArea.create = async () => { throw Object.assign(new Error('dup'), { code: 'P2002' }); };
  const svc = createInventoryAreaService({ prisma });
  assert.equal(await status(svc.createArea({ companyId: CO, name: 'A' })), 409);
});

test('moving an area under its own descendant -> 400; valid move works', async () => {
  const prisma = makePrisma();
  const svc = createInventoryAreaService({ prisma });
  assert.equal(await status(svc.updateArea({ companyId: CO, id: A, parentId: C })), 400);
  assert.equal(await status(svc.updateArea({ companyId: CO, id: A, parentId: A })), 400);
  await svc.updateArea({ companyId: CO, id: C, parentId: A });
  assert.deepEqual(prisma.calls.at(-1), ['area.update', C, { parentId: A }]);
});

test('moveItems requires write on source and destination areas', async () => {
  const svc = createInventoryAreaService({ prisma: makePrisma() });
  const scope = { all: false, roles: new Map([[A, 'editor'], [B, 'viewer']]) };
  // i2 lives in B where the scope is only viewer
  assert.equal(await status(svc.moveItems({ companyId: CO, itemIds: ['i1', 'i2'], areaId: A, scope })), 403);
  const onlyA = { all: false, roles: new Map([[A, 'editor']]) };
  assert.equal(await status(svc.moveItems({ companyId: CO, itemIds: ['i1', 'i2'], areaId: C, scope: onlyA })), 403);
});

test('moveItems with full scope updates and null means General', async () => {
  const prisma = makePrisma();
  const svc = createInventoryAreaService({ prisma });
  const res = await svc.moveItems({ companyId: CO, itemIds: ['i1', 'i2'], areaId: null, scope: { all: true } });
  assert.equal(res.moved, 2);
  assert.equal(prisma.calls.at(-1)[1].data.areaId, null);
});

test('setMember rejects a user outside the company', async () => {
  const svc = createInventoryAreaService({ prisma: makePrisma() });
  assert.equal(await status(svc.setMember({ companyId: CO, areaId: A, userId: U, role: 'viewer' })), 400);
});

test('setMember upserts for a company member', async () => {
  const prisma = makePrisma({ membership: { findFirst: async () => ({ id: 'm' }) } });
  const svc = createInventoryAreaService({ prisma });
  await svc.setMember({ companyId: CO, areaId: A, userId: U, role: 'editor', actorId: 'x' });
  assert.equal(prisma.calls.at(-1)[1].update.role, 'editor');
});

test('disableArea clears item areas, orphans children and disables inside a transaction', async () => {
  const prisma = makePrisma();
  const svc = createInventoryAreaService({ prisma });
  await svc.disableArea({ companyId: CO, id: B });
  assert.deepEqual(prisma.calls.map((c) => c[0]), ['item.updateMany', 'area.updateMany', 'area.update']);
  assert.deepEqual(prisma.calls[0][1], { where: { companyId: CO, areaId: B }, data: { areaId: null } });
  assert.deepEqual(prisma.calls[2][2], { enabled: false });
});
