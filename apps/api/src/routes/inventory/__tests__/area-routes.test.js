import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryAreaRouter } from '../area-routes.js';
import { createInventoryAreaService } from '../../../services/inventory-area-service.js';
import { InventoryServiceError } from '../../../services/inventory-service.js';

const CO = '01900000-0000-7000-8000-000000000001';
const X = '01900000-0000-7000-8000-0000000000aa';
const Y = '01900000-0000-7000-8000-0000000000bb';
const U = '01900000-0000-7000-8000-00000000d001';

function build() {
  const state = { areas: [{ id: X, companyId: CO, parentId: null, enabled: true, name: 'X' }, { id: Y, companyId: CO, parentId: null, enabled: true, name: 'Y' }], config: {}, members: [] };
  const prisma = {
    invArea: {
      findFirst: async ({ where }) => state.areas.find((a) => a.id === where.id && a.enabled) ?? null,
      findMany: async () => state.areas,
      update: async ({ where, data }) => Object.assign(state.areas.find((a) => a.id === where.id), data),
    },
    membership: { findFirst: async () => ({ id: 'm1' }) },
    invAreaMember: { upsert: async ({ create }) => { state.members.push(create); return create; } },
    instanceConfig: {
      findUnique: async ({ where }) => (state.config[where.key] ? { value: state.config[where.key] } : null),
      upsert: async ({ where, create }) => { state.config[where.key] = create.value; return create; },
    },
    role: { findMany: async () => [{ id: 'r1', name: 'Almacen' }] },
  };
  const users = {
    manager: { perms: [], scope: { all: false, roles: new Map([[X, 'manager']]) } },
    viewer: { perms: [], scope: { all: false, roles: new Map([[X, 'viewer']]) } },
    areaAdmin: { perms: ['inventory.area.manage'], scope: { all: true } },
  };
  const requirePermission = (key) => async (c, next) => {
    const u = users[c.req.header('x-user')];
    if (!u.perms.includes(key) && !(key === 'inventory.item.read')) return c.json({ error: 'Sin permiso.' }, 403);
    c.set('companyId', CO);
    c.set('userId', U);
    c.set('userContext', { permissionSet: new Set(u.perms) });
    c.set('scope', u.scope);
    return next();
  };
  const app = new Hono();
  app.route('/', createInventoryAreaRouter({
    prisma, requirePermission, InventoryServiceError,
    inventoryScope: { fromContext: async (c) => c.get('scope') },
    inventoryAreaService: createInventoryAreaService({ prisma }),
  }));
  const request = (user, method, path, body) => app.request(path, { method, headers: { 'x-user': user, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { request, state };
}

describe('inventory area routes', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('a non-manager cannot create an area', async () => {
    assert.equal((await t.request('manager', 'POST', '/inventory/areas', { name: 'Nueva' })).status, 403);
  });

  it('an area manager administers members of their own area only', async () => {
    const own = await t.request('manager', 'PUT', `/inventory/areas/${X}/members/${U}`, { role: 'editor' });
    assert.equal(own.status, 200);
    assert.deepEqual(t.state.members.map((m) => m.role), ['editor']);
    assert.equal((await t.request('manager', 'PUT', `/inventory/areas/${Y}/members/${U}`, { role: 'editor' })).status, 403);
    assert.equal((await t.request('viewer', 'PUT', `/inventory/areas/${X}/members/${U}`, { role: 'editor' })).status, 403);
  });

  it('rejects moving an area into its own descendant', async () => {
    t.state.areas.push({ id: '01900000-0000-7000-8000-0000000000cc', companyId: CO, parentId: X, enabled: true, name: 'child' });
    const res = await t.request('areaAdmin', 'PATCH', `/inventory/areas/${X}`, { parentId: '01900000-0000-7000-8000-0000000000cc' });
    assert.equal(res.status, 400);
  });

  it('toggles the setting and lists the roles to warn about when enabling', async () => {
    const on = await (await t.request('areaAdmin', 'PUT', '/inventory/areas-settings', { enabled: true })).json();
    assert.equal(on.data.enabled, true);
    assert.deepEqual(on.data.affectedRoles, [{ id: 'r1', name: 'Almacen' }]);
    assert.deepEqual((await (await t.request('manager', 'GET', '/inventory/areas-settings')).json()).data, { enabled: true, includeOwn: true });
    const off = await (await t.request('areaAdmin', 'PUT', '/inventory/areas-settings', { enabled: false })).json();
    assert.deepEqual(off.data, { enabled: false, includeOwn: true });
    const own = await (await t.request('areaAdmin', 'PUT', '/inventory/areas-settings', { includeOwn: false })).json();
    assert.deepEqual(own.data, { enabled: false, includeOwn: false });
    assert.equal((await t.request('areaAdmin', 'PUT', '/inventory/areas-settings', {})).status, 400);
    assert.equal((await t.request('manager', 'PUT', '/inventory/areas-settings', { enabled: true })).status, 403);
  });
});
