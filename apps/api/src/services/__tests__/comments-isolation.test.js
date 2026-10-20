import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommentsService } from '../comments-service.js';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
function fixture(scope = { all: true }, itemArea = null, itemExtra = {}) {
  const written = [];
  const prisma = {
    membership: { findFirst: async ({ where }) => where.companyId === 'company-a' && where.userId === ACTOR
      ? { role: { key: 'reader', permissions: [{ permission: { key: 'inventory.item.read', active: true } }] } } : null },
    userPermissionGrant: { findFirst: async () => null },
    userProfile: { findFirst: async () => ({ id: ACTOR }) },
    instanceConfig: { findUnique: async () => null },
    invItem: { findFirst: async ({ where }) => where.id === 'item-a' && where.companyId === 'company-a' ? { id: 'item-a', areaId: itemArea, ...itemExtra } : null },
    entityComment: {
      findMany: async () => [{ id: 'comment-a' }],
      findFirst: async ({ where }) => where.entityId === 'item-a' ? { id: 'comment-a', entityType: 'InvItem', entityId: 'item-a', authorId: ACTOR } : null,
      create: async ({ data }) => { written.push(data); return data; },
    },
  };
  return { prisma, written, service: createCommentsService({ prisma, inventoryAccess: { scopeFor: async () => scope } }) };
}

test('inventory comments accept authorized members and reject foreign item UUIDs', async () => {
  const { service } = fixture();
  assert.equal((await service.listComments('InvItem', 'item-a', 'company-a', ACTOR)).length, 1);
  await assert.rejects(service.listComments('InvItem', 'item-b', 'company-a', ACTOR), { status: 404 });
  await assert.rejects(service.listComments('InvItem', 'item-a', 'company-b', ACTOR), { status: 404 });
  await assert.rejects(service.updateComment('comment-a', 'auth', 'changed', 'company-a', 'item-b'), { status: 404 });
});

test('inventory comments respect the inventory area scope (read needs the area, write needs editor)', async () => {
  const roles = (role) => ({ all: false, roles: new Map([['area-a', role]]) });
  const outside = fixture(roles('viewer'), 'area-b');
  await assert.rejects(outside.service.listComments('InvItem', 'item-a', 'company-a', ACTOR), { status: 404 });
  const viewer = fixture(roles('viewer'), 'area-a');
  assert.equal((await viewer.service.listComments('InvItem', 'item-a', 'company-a', ACTOR)).length, 1);
  await assert.rejects(viewer.service.createComment('InvItem', 'item-a', 'auth', 'hola', 'company-a'), { status: 404 });
});

test('own items are readable in comments but not writable', async () => {
  const scope = { all: false, roles: new Map([['area-a', 'editor']]), own: { userId: ACTOR, employeeIds: [] } };
  const own = fixture(scope, 'area-b', { createdById: ACTOR });
  assert.equal((await own.service.listComments('InvItem', 'item-a', 'company-a', ACTOR)).length, 1);
  await assert.rejects(own.service.createComment('InvItem', 'item-a', 'auth', 'hola', 'company-a'), { status: 404 });
  const other = fixture(scope, 'area-b', { createdById: 'someone-else' });
  await assert.rejects(other.service.listComments('InvItem', 'item-a', 'company-a', ACTOR), { status: 404 });
});

test('inventory mentions require both membership and permission before persisting', async () => {
  const { service, prisma, written } = fixture();
  await service.createComment('InvItem', 'item-a', 'auth', 'valid comment', 'company-a');
  await assert.rejects(service.createComment('InvItem', 'item-a', 'auth', `@[${TARGET}:Target]`, 'company-a'), { status: 404 });
  prisma.membership.findFirst = async ({ where }) => ({ role: { key: 'member', permissions: where.userId === ACTOR
    ? [{ permission: { key: 'inventory.item.read', active: true } }] : [] } });
  await assert.rejects(service.createComment('InvItem', 'item-a', 'auth', `@[${TARGET}:Target]`, 'company-a'), { status: 404 });
  assert.equal(written.length, 1);
});
