// Supplier invitation management: who may invite/resend/revoke, the members listing with guests, and that
// the invite routes live inside the real inventory router (permission-guarded like the area routes).
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryGuestInviteRouter } from '../guest-invite-routes.js';
import { createInventoryGuestService } from '../../../services/inventory-guest-service.js';
import { createInventoryAreaService } from '../../../services/inventory-area-service.js';
import { InventoryServiceError } from '../../../services/inventory-guards.js';
import { createFakeDb } from '../../../services/__tests__/inventory-guest-fake.js';
import { createInventoryRouter } from '../index.js';

const CO = '01900000-0000-7000-8000-00000000c001';
const AREA_X = '01900000-0000-7000-8000-0000000000aa';
const AREA_Y = '01900000-0000-7000-8000-0000000000bb';
const USERS = {
  admin: { id: 'u-admin', isAdmin: true, perms: [], roles: [] },
  manager: { id: 'u-mgr', perms: [], roles: [[AREA_X, 'manager']] },
  editor: { id: 'u-edit', perms: [], roles: [[AREA_X, 'editor']] },
  holder: { id: 'u-holder', perms: ['inventory.area.manage'], roles: [] },
};

function build() {
  const db = createFakeDb({
    company: [{ id: CO, name: 'Acme' }],
    contact: [{ id: '01900000-0000-7000-8000-0000000000c1', companyId: CO }],
    invArea: [{ id: AREA_X, companyId: CO, name: 'X', enabled: true }, { id: AREA_Y, companyId: CO, name: 'Y', enabled: true }],
  });
  const sent = [];
  const guestService = createInventoryGuestService({
    prisma: db, sendMail: async (m) => { sent.push(m); }, buildMail: (a) => ({ subject: 's', html: 'h', text: a.inviteUrl }), appBaseUrl: () => 'https://app.example.com',
  });
  const requirePermission = () => async (c, next) => {
    const user = USERS[c.req.header('x-user')];
    c.set('companyId', CO);
    c.set('userId', user.id);
    c.set('userContext', { isAdmin: Boolean(user.isAdmin), permissionSet: new Set(user.perms) });
    return next();
  };
  const inventoryScope = {
    fromContext: async (c) => {
      const user = USERS[c.req.header('x-user')];
      return user.isAdmin || user.perms.includes('inventory.scope.all') ? { all: true } : { all: false, roles: new Map(user.roles) };
    },
  };
  const app = new Hono();
  app.route('/', createInventoryGuestInviteRouter({ requirePermission, inventoryScope, guestService, InventoryServiceError }));
  const request = (user, method, path, body) => app.request(path, { method, headers: { 'x-user': user, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { db, request, sent, guestService };
}

describe('supplier invitation routes', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('an area manager and an inventory.area.manage holder invite suppliers; editors and other areas are denied', async () => {
    const body = { email: 'prov@example.com', name: 'Prov', role: 'editor' };
    const ok = await t.request('manager', 'POST', `/inventory/areas/${AREA_X}/guests`, body);
    assert.equal(ok.status, 201);
    const data = (await ok.json()).data;
    assert.match(data.link, /\/app\/p\/inventory\/[A-Za-z0-9_-]{43}$/);
    assert.equal(data.sent, true);
    assert.equal(data.guest.role, 'editor');
    assert.equal((await t.request('holder', 'POST', `/inventory/areas/${AREA_Y}/guests`, body)).status, 201);
    assert.equal((await t.request('manager', 'POST', `/inventory/areas/${AREA_Y}/guests`, body)).status, 403);
    assert.equal((await t.request('editor', 'POST', `/inventory/areas/${AREA_X}/guests`, body)).status, 403);
    assert.equal((await t.request('holder', 'POST', `/inventory/areas/${AREA_X}/guests`, { ...body, role: 'manager' })).status, 400);
    assert.equal((await t.request('holder', 'POST', `/inventory/areas/${AREA_X}/guests`, { ...body, email: 'bad' })).status, 400);
  });

  it('links an existing company contact and rejects one from elsewhere', async () => {
    const ok = await t.request('admin', 'POST', `/inventory/areas/${AREA_X}/guests`, { email: 'a@b.co', contactId: '01900000-0000-7000-8000-0000000000c1' });
    assert.equal(ok.status, 201);
    assert.equal((await t.request('admin', 'POST', `/inventory/areas/${AREA_X}/guests`, { email: 'c@b.co', contactId: '01900000-0000-7000-8000-0000000000c9' })).status, 400);
  });

  it('lists, resends, removes and revokes', async () => {
    const created = (await (await t.request('admin', 'POST', `/inventory/areas/${AREA_X}/guests`, { email: 'a@b.co' })).json()).data;
    const list = (await (await t.request('manager', 'GET', `/inventory/areas/${AREA_X}/guests`)).json()).data;
    assert.deepEqual(list.map((g) => [g.email, g.status, g.kind]), [['a@b.co', 'pending', 'guest']]);
    assert.equal((await t.request('editor', 'GET', `/inventory/areas/${AREA_X}/guests`)).status, 403);

    const resent = await t.request('manager', 'POST', `/inventory/guests/${created.guest.id}/resend`, {});
    assert.equal(resent.status, 200);
    assert.notEqual((await resent.json()).data.link, created.link);
    assert.equal(t.sent.length, 2);

    // Invited to a second area: the manager of X alone cannot revoke the supplier everywhere.
    await t.request('holder', 'POST', `/inventory/areas/${AREA_Y}/guests`, { email: 'a@b.co' });
    assert.equal((await t.request('manager', 'POST', `/inventory/guests/${created.guest.id}/revoke`)).status, 403);
    assert.equal((await t.request('manager', 'DELETE', `/inventory/areas/${AREA_X}/guests/${created.guest.id}`)).status, 200);
    assert.equal((await t.request('holder', 'POST', `/inventory/guests/${created.guest.id}/revoke`)).status, 200);
    assert.equal(t.db.invGuest.rows[0].enabled, false);
    assert.equal((await t.request('holder', 'POST', `/inventory/guests/not-a-uuid/revoke`)).status, 400);
  });
});

describe('members listing includes guests', () => {
  it('flags users and guests and hides bots and disabled guests', async () => {
    const db = createFakeDb({ invArea: [{ id: AREA_X, companyId: CO, name: 'X', enabled: true }] });
    db.invAreaMember.findMany = async ({ where }) => {
      assert.deepEqual(where.OR, [{ user: { isBot: false } }, { guest: { enabled: true } }]);
      return [{ id: 'm1', areaId: AREA_X, userId: 'u1', guestId: null, user: { id: 'u1' }, guest: null }, { id: 'm2', areaId: AREA_X, userId: null, guestId: 'g1', user: null, guest: { id: 'g1', email: 'a@b.co' } }];
    };
    const rows = await createInventoryAreaService({ prisma: db }).listMembers(CO, AREA_X);
    assert.deepEqual(rows.map((r) => r.kind), ['user', 'guest']);
  });

  it('the real inventory router exposes the invitation routes behind the scope-guarded permission', async () => {
    const t = build();
    const requirePermission = () => async (c, next) => c.json({ guarded: true, path: c.req.path }, 401);
    const router = createInventoryRouter({
      prisma: t.db, requirePermission, inventoryService: {}, InventoryServiceError, inventoryNotifSvc: {}, CommentsServiceError: class extends Error {},
      commentsService: {}, guestService: t.guestService, inventoryScope: { fromContext: async () => ({ all: true }) },
    });
    const res = await router.request(`/inventory/areas/${AREA_X}/guests`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 401, 'goes through requirePermission, never anonymous');
  });
});
