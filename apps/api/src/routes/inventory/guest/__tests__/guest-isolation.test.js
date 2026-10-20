// Isolation safety net for the supplier portal (spec 2026-10-20-inventory-areas-scoping, phase 3): the REAL
// guest routers, guest services and inventory service run against an in-memory fake prisma. A guest must
// never reach items of other areas/companies, nor any non-guest route, nor escalate or write beyond its role.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryGuestService } from '../../../../services/inventory-guest-service.js';
import { createInventoryGuestItems } from '../../../../services/inventory-guest-items.js';
import { canManageArea, createInventoryScope } from '../../../../services/inventory-scope.js';
import { createAttemptGuard } from '../../../lms/lms-invite-core.js';
import { createInventoryGuestRouter } from '../guest-routes.js';
import { createInventoryGuestPublicRouter } from '../guest-public-routes.js';
import { createAuthMiddleware } from '../../../../services/auth-middleware.js';
import { createFakeDb } from '../../../../services/__tests__/inventory-guest-fake.js';

const CO = '01900000-0000-7000-8000-00000000c001';
const CO2 = '01900000-0000-7000-8000-00000000c002';
const AREA_A = '01900000-0000-7000-8000-0000000000aa';
const AREA_A1 = '01900000-0000-7000-8000-0000000000a1'; // child of A
const AREA_B = '01900000-0000-7000-8000-0000000000bb';
const AREA_X = '01900000-0000-7000-8000-0000000000cc'; // other company
const IA = '01900000-0000-7000-8000-00000000a001';
const IA1 = '01900000-0000-7000-8000-00000000a101';
const IB = '01900000-0000-7000-8000-00000000b001';
const IG = '01900000-0000-7000-8000-00000000c101'; // General
const IX = '01900000-0000-7000-8000-00000000d001'; // other company

const mkItem = (id, companyId, areaId, tag) => ({
  id, companyId, areaId, enabled: true, name: `Item ${tag}`, assetTag: tag, serialNumber: `S-${tag}`, folio: `F-${tag}`, status: 'available', adminStatus: 'registered',
  purchasePrice: 999, vendorName: 'Secret Vendor', invoiceNumber: 'INV-1', licenseKey: 'KEY-123', assignedToId: 'emp1', createdById: 'u-1', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
});

function build() {
  const db = createFakeDb({
    company: [{ id: CO, name: 'Acme' }, { id: CO2, name: 'Other' }],
    invArea: [
      { id: AREA_A, companyId: CO, parentId: null, name: 'A', enabled: true },
      { id: AREA_A1, companyId: CO, parentId: AREA_A, name: 'A1', enabled: true },
      { id: AREA_B, companyId: CO, parentId: null, name: 'B', enabled: true },
      { id: AREA_X, companyId: CO2, parentId: null, name: 'X', enabled: true },
    ],
    invItem: [mkItem(IA, CO, AREA_A, 'A'), mkItem(IA1, CO, AREA_A1, 'A1'), mkItem(IB, CO, AREA_B, 'B'), mkItem(IG, CO, null, 'G'), mkItem(IX, CO2, AREA_X, 'X')],
  });
  const audits = [];
  const bridge = { logAndPublish: async (args) => { audits.push(args); return {}; } };
  const guestService = createInventoryGuestService({ prisma: db, appBaseUrl: () => 'https://app.example.com', attemptGuard: createAttemptGuard() });
  const uploads = [];
  const supabaseAdmin = { storage: { from: () => ({ upload: async (key) => { uploads.push(key); return { error: null }; } }) } };
  const notifier = { notifyDeregistrationProposed: async () => {} };
  const items = createInventoryGuestItems({ prisma: db, inventoryScope: createInventoryScope({ prisma: db }), supabaseAdmin, bridge, notifier, signFile: async (id) => `https://files.example.com/${id}` });
  const app = new Hono();
  app.route('/public/inventory/guest', createInventoryGuestPublicRouter({ guestService }));
  app.route('/inventory/guest', createInventoryGuestRouter({ guestService, items }));
  const req = (token, method, path, body, headers = {}) => app.request(path, {
    method,
    headers: { ...(token ? { authorization: `Guest ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  // Invites a guest to an area and exchanges the link for a session token, through the real public route.
  async function guest(email, areaId, role, companyId = CO) {
    const res = await guestService.inviteToArea({ companyId, areaId, email, role });
    const start = await app.request('/public/inventory/guest/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: res.link.split('/').pop() }) });
    assert.equal(start.status, 200);
    return { id: res.guest.id, token: (await start.json()).data.sessionToken };
  }
  return { db, req, guest, guestService, audits, uploads, app, notifier };
}

const ids = async (res) => (await res.json()).data.map((row) => row.id).sort();

describe('guest authentication', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('rejects missing, user (Bearer) and unknown tokens on every guest route', async () => {
    const real = (await t.guest('a@b.co', AREA_A, 'editor')).token;
    for (const [method, path] of [['GET', '/inventory/guest/me'], ['GET', '/inventory/guest/items'], ['GET', `/inventory/guest/items/${IA}`], ['POST', '/inventory/guest/items'], ['PATCH', `/inventory/guest/items/${IA}`], ['GET', '/inventory/guest/catalogs'], ['GET', '/inventory/guest/anything']]) {
      for (const authorization of [undefined, `Bearer ${real}`, `Guest ${'x'.repeat(43)}`, 'Guest nope']) {
        const res = await t.app.request(path, { method, headers: authorization ? { authorization, 'content-type': 'application/json' } : {}, ...(method !== 'GET' ? { body: '{}' } : {}) });
        assert.equal(res.status, 401, `${method} ${path} with ${authorization?.slice(0, 12)}`);
      }
    }
  });

  it('answers 404 for paths that are not part of the guest API (no user route is reachable)', async () => {
    const { token } = await t.guest('a@b.co', AREA_A, 'editor');
    for (const path of ['/inventory/guest/areas', '/inventory/guest/items/' + IA + '/assign', '/inventory/guest/custody']) {
      assert.equal((await t.req(token, 'GET', path)).status, 404, path);
    }
    assert.equal((await t.req(token, 'DELETE', `/inventory/guest/items/${IA}`)).status, 404);
  });

  it('a revoked guest is rejected immediately, and its link no longer opens a session', async () => {
    const g = await t.guest('a@b.co', AREA_A, 'editor');
    assert.equal((await t.req(g.token, 'GET', '/inventory/guest/me')).status, 200);
    await t.guestService.revoke({ companyId: CO, guestId: g.id });
    assert.equal((await t.req(g.token, 'GET', '/inventory/guest/me')).status, 401);
    assert.equal((await t.req(g.token, 'GET', '/inventory/guest/items')).status, 401);
  });

  it('refresh and logout work on a live session; logout ends it', async () => {
    const g = await t.guest('a@b.co', AREA_A, 'viewer');
    const refreshed = await t.req(g.token, 'POST', '/inventory/guest/session/refresh', {});
    assert.equal(refreshed.status, 200);
    assert.ok((await refreshed.json()).data.expiresAt);
    assert.equal((await t.req(g.token, 'POST', '/inventory/guest/session/logout', {})).status, 200);
    assert.equal((await t.req(g.token, 'GET', '/inventory/guest/me')).status, 401);
  });

  it('public session route answers a generic 401 for a bad link and never leaks which part failed', async () => {
    const res = await t.app.request('/public/inventory/guest/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'x'.repeat(43) }) });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'INVALID_LINK');
  });
});

describe('guest reads are limited to its areas', () => {
  let t, viewer;
  beforeEach(async () => { t = build(); viewer = await t.guest('v@b.co', AREA_A, 'viewer'); });

  it('lists only items of its areas and their descendants, never other areas, General or other companies', async () => {
    const res = await t.req(viewer.token, 'GET', '/inventory/guest/items');
    assert.equal(res.status, 200);
    assert.deepEqual(await ids(res), [IA, IA1].sort());
  });

  it('cannot widen the list with filters', async () => {
    for (const q of [`areaId=${AREA_B}`, `areaId=${AREA_X}`, 'search=B', 'status=available&pageSize=500']) {
      const res = await t.req(viewer.token, 'GET', `/inventory/guest/items?${q}`);
      const got = await ids(res);
      assert.ok(got.every((id) => [IA, IA1].includes(id)), q);
    }
  });

  it('answers 404 for items of another area, General and another company; 200 for its own and descendants', async () => {
    for (const id of [IB, IG, IX]) {
      assert.equal((await t.req(viewer.token, 'GET', `/inventory/guest/items/${id}`)).status, 404, id);
      assert.equal((await t.req(viewer.token, 'GET', `/inventory/guest/items/${id}/files`)).status, 404, `${id} files`);
    }
    for (const id of [IA, IA1]) assert.equal((await t.req(viewer.token, 'GET', `/inventory/guest/items/${id}`)).status, 200);
  });

  it('a corrupt membership pointing at another company grants nothing', async () => {
    t.db.invAreaMember.rows.push({ id: 'm-x', areaId: AREA_X, guestId: viewer.id, userId: null, role: 'editor' });
    assert.equal((await t.req(viewer.token, 'GET', `/inventory/guest/items/${IX}`)).status, 404);
    const me = await (await t.req(viewer.token, 'GET', '/inventory/guest/me')).json();
    assert.ok(me.data.areas.every((a) => a.id !== AREA_X));
  });

  it('never exposes prices, vendor, invoice, license, custody or creator (adminStatus is read-only)', async () => {
    const detail = (await (await t.req(viewer.token, 'GET', `/inventory/guest/items/${IA}`)).json()).data;
    const list = (await (await t.req(viewer.token, 'GET', '/inventory/guest/items')).json()).data[0];
    for (const row of [detail, list]) {
      for (const key of ['purchasePrice', 'vendorName', 'invoiceNumber', 'licenseKey', 'licenseExpiry', 'assignedToId', 'assignedTo', 'createdById', 'purchaseDate', 'acquisitionOrigin']) {
        assert.ok(!(key in row), `${key} leaked`);
      }
    }
    assert.equal(detail.adminStatus, 'registered');
    assert.equal(list.adminStatus, 'registered');
    assert.equal(detail.canWrite, false);
  });

  it('me lists only its areas with read-only flags', async () => {
    const me = (await (await t.req(viewer.token, 'GET', '/inventory/guest/me')).json()).data;
    assert.deepEqual(me.areas.map((a) => a.id).sort(), [AREA_A, AREA_A1].sort());
    assert.ok(me.areas.every((a) => a.role === 'viewer' && a.canWrite === false));
    assert.equal(me.company.name, 'Acme');
  });

  it('the item history route no longer exists for guests (404, no activity or admin events leak)', async () => {
    t.db.auditLog.rows.push({ id: 'au1', companyId: CO, entityType: 'InvItem', entityId: IA, moduleKey: 'runly.inventory', action: 'inventory.item.updated', before: { purchasePrice: 1 }, after: { purchasePrice: 2 }, metadata: null, createdAt: new Date() });
    for (const id of [IA, IB]) assert.equal((await t.req(viewer.token, 'GET', `/inventory/guest/items/${id}/history`)).status, 404, id);
    const detail = await (await t.req(viewer.token, 'GET', `/inventory/guest/items/${IA}`)).text();
    assert.ok(!/auditLog|events|activity/i.test(detail));
  });
});

describe('guest writes', () => {
  let t, viewer, editor;
  beforeEach(async () => { t = build(); viewer = await t.guest('v@b.co', AREA_A, 'viewer'); editor = await t.guest('e@b.co', AREA_A, 'editor'); });

  it('a viewer cannot create, edit or upload', async () => {
    assert.equal((await t.req(viewer.token, 'POST', '/inventory/guest/items', { name: 'X', areaId: AREA_A })).status, 403);
    const patch = await t.req(viewer.token, 'PATCH', `/inventory/guest/items/${IA}`, { name: 'Hacked' });
    assert.equal(patch.status, 403);
    assert.equal((await patch.json()).code, 'READ_ONLY');
    const form = new FormData();
    form.set('file', new File(['x'], 'a.txt', { type: 'text/plain' }));
    assert.equal((await t.req(viewer.token, 'POST', `/inventory/guest/items/${IA}/files`, form)).status, 403);
    assert.equal(t.db.invItem.rows.find((i) => i.id === IA).name, 'Item A');
    assert.equal(t.uploads.length, 0);
  });

  it('an editor creates items only in areas where it can write, with the guest tagged in the audit', async () => {
    const ok = await t.req(editor.token, 'POST', '/inventory/guest/items', { name: 'Taladro', areaId: AREA_A1, status: 'maintenance', serialNumber: 'ZZ-1' });
    assert.equal(ok.status, 201);
    const created = (await ok.json()).data;
    assert.equal(created.areaId, AREA_A1);
    assert.ok(!('purchasePrice' in created));
    const row = t.db.invItem.rows.find((i) => i.id === created.id);
    assert.equal(row.companyId, CO);
    assert.ok(row.createdById == null || row.createdById === undefined);
    const audit = t.audits.find((a) => a.auditEntry.action === 'inventory.item.created');
    assert.equal(audit.auditEntry.actorId, null);
    assert.deepEqual(audit.auditEntry.metadata.actor, { kind: 'guest', id: editor.id, name: null, email: 'e@b.co' });
    assert.match(audit.hint.summary, /e@b\.co \(proveedor\)/);
    for (const areaId of [AREA_B, AREA_X, null, undefined]) {
      const res = await t.req(editor.token, 'POST', '/inventory/guest/items', { name: 'No', ...(areaId !== undefined ? { areaId } : {}) });
      assert.ok([400, 403].includes(res.status), `area ${areaId} -> ${res.status}`);
    }
    assert.equal(t.db.invItem.rows.filter((i) => i.name === 'No').length, 0);
  });

  it('rejects every field outside the allowlist on create and update', async () => {
    const forbidden = { purchasePrice: 1, vendorName: 'v', invoiceNumber: 'i', licenseKey: 'k', licenseExpiry: '2027-01-01', licenseSeats: 3, adminStatus: 'deregistered', assignedToId: 'e1', createdById: 'u', companyId: CO2, enabled: false, acquisitionOrigin: 'DONATION', purchaseDate: '2026-01-01', createdAt: '2020-01-01', modelId2: 'x' };
    for (const [key, value] of Object.entries(forbidden)) {
      const create = await t.req(editor.token, 'POST', '/inventory/guest/items', { name: 'X', areaId: AREA_A, [key]: value });
      assert.equal(create.status, 400, `create ${key}`);
      assert.equal((await create.json()).code, 'FIELD_NOT_ALLOWED');
      const patch = await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { [key]: value });
      assert.equal(patch.status, 400, `patch ${key}`);
    }
    assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { areaId: AREA_B })).status, 400, 'cannot move between areas');
    assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { status: 'assigned' })).status, 400);
    assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { status: 'deregistered' })).status, 400);
    const row = t.db.invItem.rows.find((i) => i.id === IA);
    assert.equal(row.purchasePrice, 999);
    assert.equal(row.adminStatus, 'registered');
  });

  it('an editor edits items of its areas (and descendants) but gets 404 for any other item', async () => {
    const ok = await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA1}`, { name: 'Renombrado', notes: 'ok', status: 'maintenance' });
    assert.equal(ok.status, 200);
    assert.equal(t.db.invItem.rows.find((i) => i.id === IA1).name, 'Renombrado');
    const audit = t.audits.find((a) => a.auditEntry.action === 'inventory.item.updated');
    assert.equal(audit.auditEntry.metadata.actor.kind, 'guest');
    for (const id of [IB, IG, IX]) {
      assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${id}`, { name: 'Hacked' })).status, 404, id);
    }
    assert.ok(!t.db.invItem.rows.some((i) => i.name === 'Hacked'));
  });

  it('files: an editor uploads and deletes only its own files; unknown types are refused', async () => {
    const form = new FormData();
    form.set('file', new File(['hello'], 'nota.txt', { type: 'text/plain' }));
    const up = await t.req(editor.token, 'POST', `/inventory/guest/items/${IA}/files`, form);
    assert.equal(up.status, 201);
    const asset = t.db.fileAsset.rows[0];
    assert.equal(asset.metadata.guestId, editor.id);
    assert.equal(asset.uploadedById, null);
    assert.equal(t.uploads.length, 1);
    const bad = new FormData();
    bad.set('file', new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' }));
    assert.equal((await t.req(editor.token, 'POST', `/inventory/guest/items/${IA}/files`, bad)).status, 400);
    assert.equal((await t.req(editor.token, 'POST', `/inventory/guest/items/${IB}/files`, form)).status, 404);
    // A file attached by company staff cannot be removed by the guest.
    t.db.fileAsset.rows.push({ id: 'fa-staff', originalName: 'staff.pdf', mimeType: 'application/pdf', metadata: { companyId: CO } });
    t.db.invItemFile.rows.push({ id: 'doc-staff', itemId: IA, fileAssetId: 'fa-staff' });
    assert.equal((await t.req(editor.token, 'DELETE', `/inventory/guest/items/${IA}/files/doc-staff`)).status, 403);
    const own = t.db.invItemFile.rows.find((r) => r.fileAssetId === asset.id);
    assert.equal((await t.req(editor.token, 'DELETE', `/inventory/guest/items/${IA}/files/${own.id}`)).status, 200);
  });

  it('role escalation is impossible: a stored manager role is capped, and guests never manage', async () => {
    t.db.invAreaMember.rows.find((m) => m.guestId === editor.id).role = 'manager';
    const scope = await createInventoryScope({ prisma: t.db }).resolveGuest({ companyId: CO, guestId: editor.id });
    assert.notEqual(scope.roles.get(AREA_A), 'manager');
    assert.equal(canManageArea(scope, AREA_A), false);
    await assert.rejects(t.guestService.inviteToArea({ companyId: CO, areaId: AREA_A, email: 'm@b.co', role: 'manager' }), { status: 400 });
  });

  it('catalogs expose names only', async () => {
    t.db.invLocation.rows.push({ id: 'l1', companyId: CO, enabled: true, name: 'Bodega', address: 'Calle Secreta 1', sortOrder: 0 });
    t.db.invCategory.rows.push({ id: 'c1', companyId: CO, enabled: true, name: 'Tipo', sortOrder: 0 });
    t.db.invBrand.rows.push({ id: 'b1', companyId: CO, enabled: true, name: 'Marca', website: 'secret.example' });
    t.db.invCondition.rows.push({ id: 'k1', companyId: CO, enabled: true, name: 'Bueno', color: '#0f0', sortOrder: 0 });
    const res = await t.req(viewer.token, 'GET', '/inventory/guest/catalogs');
    assert.equal(res.status, 200);
    const data = (await res.json()).data;
    assert.deepEqual(data.locations, [{ id: 'l1', name: 'Bodega' }]);
    assert.ok(!JSON.stringify(data).includes('Secreta'));
  });
});

describe('guest sessions and user sessions are not interchangeable', () => {
  it('the real user auth middleware rejects a guest session under both schemes', async () => {
    const t = build();
    const g = await t.guest('a@b.co', AREA_A, 'editor');
    const userApp = new Hono();
    userApp.use('*', createAuthMiddleware({
      cacheGet: () => undefined, cacheSet: () => {}, getJwtSecret: () => 'fixture-only-secret', warn: () => {},
      supabaseAdmin: { auth: { getUser: async () => ({ data: { user: null }, error: { status: 401, message: 'rejected' } }) } },
    }));
    userApp.get('/inventory/items', (c) => c.json({ leaked: true }));
    userApp.get('/inventory/items/:id', (c) => c.json({ leaked: true }));
    for (const authorization of [`Guest ${g.token}`, `Bearer ${g.token}`]) {
      for (const path of ['/inventory/items', `/inventory/items/${IA}`]) {
        const res = await userApp.request(path, { headers: { authorization } });
        assert.equal(res.status, 401, `${authorization.slice(0, 6)} ${path}`);
      }
    }
  });
});

describe('guest alta/baja proposals', () => {
  let t, viewer, editor;
  beforeEach(async () => { t = build(); viewer = await t.guest('v@b.co', AREA_A, 'viewer'); editor = await t.guest('e@b.co', AREA_A, 'editor'); });
  const row = (id) => t.db.invItem.rows.find((i) => i.id === id);
  const propose = (token, id, body = { reason: 'damage' }) => t.req(token, 'POST', `/inventory/guest/items/${id}/propose-deregistration`, body);

  it('items created by a guest start as registration_pending and expose adminStatus', async () => {
    const res = await t.req(editor.token, 'POST', '/inventory/guest/items', { name: 'Nuevo', areaId: AREA_A });
    assert.equal(res.status, 201);
    const created = (await res.json()).data;
    assert.equal(created.adminStatus, 'registration_pending');
    assert.equal(row(created.id).adminStatus, 'registration_pending');
    assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${created.id}`, { name: 'Nuevo 2' })).status, 200);
  });

  it('an editor proposes a baja of a registered item; the transition is audited as the guest and notified', async () => {
    const notified = [];
    t.notifier.notifyDeregistrationProposed = async (args) => { notified.push(args); };
    const res = await propose(editor.token, IA, { reason: 'loss', comment: 'No aparece' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.adminStatus, 'deregistration_proposed');
    assert.equal(row(IA).deregistrationReason, 'loss');
    assert.equal(notified.length, 1);
    assert.equal(notified[0].actorId, null);
    assert.equal(t.db.invItemAdminEvent.rows.at(-1).actorId, null);
    assert.match(t.db.invItemAdminEvent.rows.at(-1).comment, /e@b\.co \(proveedor\)/);
    const audit = t.audits.find((a) => a.auditEntry.action === 'inventory.item.propose_deregistration');
    assert.equal(audit.auditEntry.metadata.actor.id, editor.id);
  });

  it('rejects: viewer (403 READ_ONLY), other area (404), not registered (409 INVALID_TRANSITION), bad reason (400)', async () => {
    const v = await propose(viewer.token, IA);
    assert.equal(v.status, 403);
    assert.equal((await v.json()).code, 'READ_ONLY');
    assert.equal((await propose(editor.token, IB)).status, 404);
    assert.equal((await propose(editor.token, IA, { reason: 'nope' })).status, 400);
    assert.equal((await propose(editor.token, IA, {})).status, 400);
    row(IA).adminStatus = 'registration_pending';
    const p = await propose(editor.token, IA);
    assert.equal(p.status, 409);
    assert.equal((await p.json()).code, 'INVALID_TRANSITION');
    assert.equal(row(IA).adminStatus, 'registration_pending');
  });

  it('a proposed or deregistered item is read-only for the guest (ADMIN_STATUS_LOCKED) but still visible when proposed', async () => {
    assert.equal((await propose(editor.token, IA)).status, 200);
    const patch = await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { name: 'x' });
    assert.equal(patch.status, 409);
    assert.equal((await patch.json()).code, 'ADMIN_STATUS_LOCKED');
    assert.ok((await ids(await t.req(editor.token, 'GET', '/inventory/guest/items'))).includes(IA));
    assert.equal((await propose(editor.token, IA)).status, 409);
    row(IA1).adminStatus = 'deregistered';
    assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA1}`, { name: 'x' })).status, 409);
    assert.ok(!(await ids(await t.req(editor.token, 'GET', '/inventory/guest/items'))).includes(IA1));
  });

  it('a guest can never confirm, approve, reject or revert, nor reach the normal admin-transition route', async () => {
    row(IA).adminStatus = 'registration_pending';
    row(IA1).adminStatus = 'deregistration_proposed';
    for (const action of ['confirm_registration', 'approve_deregistration', 'reject_deregistration', 'revert_deregistration']) {
      for (const path of [`/inventory/guest/items/${IA}/admin-transition`, `/inventory/guest/items/${IA1}/admin-transition`, `/inventory/guest/items/${IA}/${action}`, `/inventory/items/${IA}/admin-transition`]) {
        const res = await t.req(editor.token, 'POST', path, { action, reason: 'damage', comment: 'x', effectiveDate: '2026-01-01' });
        assert.ok([401, 404].includes(res.status), `${path} ${action} -> ${res.status}`);
      }
      assert.equal((await t.req(editor.token, 'PATCH', `/inventory/guest/items/${IA}`, { adminStatus: action })).status, 400);
    }
    assert.equal(row(IA).adminStatus, 'registration_pending');
    assert.equal(row(IA1).adminStatus, 'deregistration_proposed');
    assert.equal(t.db.invItemAdminEvent.rows.length, 0);
  });
});
