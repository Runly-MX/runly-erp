// Safety net for inventory areas (spec 2026-10-20-inventory-areas-scoping): the REAL inventory
// router, its sub-routers and the real read services run against an in-memory fake prisma that
// evaluates `where` filters. A limited user (member of area A only) must never see, nor reach
// the write handlers of, items of area B or of General. Add a case here for every new route.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryRouter } from '../index.js';
import { createInventoryService, InventoryServiceError } from '../../../services/inventory-service.js';
import { custodyScopeWhere } from '../../../services/inventory-custody-service.js';

const CO = '01900000-0000-7000-8000-000000000001';
const AREA_A = '01900000-0000-7000-8000-0000000000aa';
const AREA_B = '01900000-0000-7000-8000-0000000000bb';
const IA = '01900000-0000-7000-8000-00000000a001'; // area A
const IB = '01900000-0000-7000-8000-00000000b001'; // area B
const IG = '01900000-0000-7000-8000-00000000c001'; // General (no area)
const ALL_IDS = [IA, IB, IG];

const mkItem = (id, areaId, tag) => ({
  id, companyId: CO, enabled: true, areaId, name: `Item ${tag}`, assetTag: tag, serialNumber: `S-${tag}`, folio: `F-${tag}`,
  status: 'assigned', adminStatus: 'registered', assignedToId: 'emp1', createdAt: new Date('2026-01-01'), purchasePrice: null,
});
const USERS = {
  viewer: { id: 'u-viewer', perms: [], roles: [[AREA_A, 'viewer']] },
  editor: { id: 'u-editor', perms: [], roles: [[AREA_A, 'editor']] },
  nobody: { id: 'u-nobody', perms: [], roles: [] },
  scopeAll: { id: 'u-all', perms: ['inventory.scope.all'], roles: [] },
  admin: { id: 'u-admin', perms: [], roles: [], isAdmin: true },
};

// Minimal Prisma `where` evaluator: equality, in/not/equals/contains, AND/OR and the `item` relation.
function matches(db, row, where) {
  return Object.entries(where ?? {}).every(([key, cond]) => {
    if (cond === undefined) return true;
    if (key === 'AND') return cond.every((w) => matches(db, row, w));
    if (key === 'OR') return cond.some((w) => matches(db, row, w));
    if (key === 'item') return matches(db, db.items.find((i) => i.id === row.itemId) ?? {}, cond);
    if (key === 'fileAsset' || key === 'labelPrints') return true;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      if ('equals' in cond) return String(row[key] ?? '').toLowerCase() === String(cond.equals).toLowerCase();
      if ('contains' in cond) return String(row[key] ?? '').toLowerCase().includes(String(cond.contains).toLowerCase());
      return true;
    }
    return row[key] === cond;
  });
}

function build({ featureOn = true } = {}) {
  const db = { items: [mkItem(IA, AREA_A, 'A'), mkItem(IB, AREA_B, 'B'), mkItem(IG, null, 'G')] };
  const calls = [];
  const rawCalls = [];
  const list = (rows, where) => rows.filter((row) => matches(db, row, where));
  const files = [{ id: 'f1', itemId: IA }, { id: 'f2', itemId: IB }, { id: 'f3', itemId: IG }];
  const assignments = [{ id: 'as1', itemId: IA }, { id: 'as2', itemId: IB }, { id: 'as3', itemId: IG }];
  const custodyRows = { c1: [IB], c2: [IA] };
  const prisma = {
    instanceConfig: { findUnique: async () => (featureOn ? { value: 'true' } : null) },
    invArea: { findMany: async () => [{ id: AREA_A, parentId: null }, { id: AREA_B, parentId: null }] },
    invAreaMember: { findMany: async ({ where }) => (Object.values(USERS).find((u) => u.id === where.userId)?.roles ?? []).map(([areaId, role]) => ({ areaId, role })) },
    invItem: {
      findFirst: async ({ where }) => list(db.items, where)[0] ?? null,
      findMany: async ({ where }) => list(db.items, where),
      count: async ({ where }) => list(db.items, where).length,
      groupBy: async ({ by: [field], where }) => {
        const counts = new Map();
        for (const row of list(db.items, where)) counts.set(row[field], (counts.get(row[field]) ?? 0) + 1);
        return [...counts].map(([value, n]) => ({ [field]: value, _count: { _all: n } }));
      },
    },
    invItemFile: {
      findMany: async ({ where }) => list(files, where).map((f) => ({ ...f, fileAssetId: `fa-${f.id}`, createdAt: new Date(), isCover: false, label: null, fileAsset: { id: `fa-${f.id}`, originalName: `${f.id}.png`, mimeType: 'image/png', sizeBytes: 1 }, item: { id: f.itemId, name: 'n', assetTag: 't' } })),
      count: async ({ where }) => list(files, where).length,
    },
    invAssignment: {
      findMany: async ({ where }) => list(assignments, where),
      count: async ({ where }) => list(assignments, where).length,
    },
    invCustodyItem: { findMany: async ({ where }) => (custodyRows[where.custodyId] ?? []).map((id) => ({ item: { areaId: db.items.find((i) => i.id === id).areaId } })) },
    invLabelPrint: { findMany: async () => [], count: async () => 0, groupBy: async () => [] },
    entityRelation: { findMany: async () => [] },
    invCondition: { findMany: async () => [] },
    membership: { findMany: async () => [] },
    $queryRaw: async (_strings, ...values) => { rawCalls.push(values); return []; },
  };
  const real = createInventoryService({ prisma });
  const record = (name) => async (...args) => { calls.push(name); return { id: IA, args }; };
  const inventoryService = {
    listItems: real.listItems, getItem: real.getItem, getItemsByEmployee: real.getItemsByEmployee, listAllAssignments: real.listAllAssignments,
    createItem: record('createItem'), updateItem: record('updateItem'), deleteItem: record('deleteItem'),
    assignItem: record('assignItem'), returnItem: record('returnItem'), listItemFiles: record('listItemFiles'),
    addItemFile: record('addItemFile'), getAssignmentHistory: record('getAssignmentHistory'),
  };
  const requirePermission = () => async (c, next) => {
    const user = USERS[c.req.header('x-user')];
    c.set('companyId', CO);
    c.set('userId', user.id);
    c.set('authUserId', `auth-${user.id}`);
    c.set('userContext', { profile: { id: user.id }, isAdmin: Boolean(user.isAdmin), permissionSet: new Set(user.perms) });
    return next();
  };
  const router = createInventoryRouter({
    prisma, requirePermission, inventoryService, InventoryServiceError,
    inventoryNotifSvc: {}, CommentsServiceError: class extends Error {}, enrichFilesWithSignedUrls: async (x) => x,
    commentsService: { listComments: async () => { calls.push('listComments'); return []; }, createComment: async () => { calls.push('createComment'); return { mentions: [] }; } },
  });
  const request = (user, method, path, body) => router.request(path, {
    method, headers: { 'x-user': user, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { request, calls, rawCalls };
}

const ids = async (response) => (await response.json()).data.map((row) => row.id).sort();

describe('limited user (viewer of area A) cannot reach items outside the scope', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('lists only the items of the area', async () => {
    const res = await t.request('viewer', 'GET', '/inventory/items');
    assert.equal(res.status, 200);
    assert.deepEqual(await ids(res), [IA]);
    const none = await t.request('nobody', 'GET', '/inventory/items');
    assert.deepEqual(await ids(none), []);
  });

  it('answers 404 (never 403) for reads of items in another area or in General', async () => {
    assert.equal((await t.request('viewer', 'GET', `/inventory/items/${IA}`)).status, 200);
    for (const id of [IB, IG]) {
      for (const suffix of ['', '/files', '/comments', '/labels', '/assignments', '/admin-events', '/public-link']) {
        const res = await t.request('viewer', 'GET', `/inventory/items/${id}${suffix}`);
        assert.equal(res.status, 404, `GET ${id}${suffix}`);
      }
    }
    assert.deepEqual(t.calls, [], 'no handler of an out-of-scope item ran');
  });

  it('blocks every write on out-of-scope items and on read-only access', async () => {
    for (const user of ['viewer', 'editor']) {
      for (const id of [IB, IG]) {
        for (const [method, suffix, body] of [
          ['PUT', '', { name: 'x' }], ['PATCH', '', { name: 'x' }], ['DELETE', '', null],
          ['POST', '/assign', { employeeId: 'e' }], ['POST', '/return', {}], ['POST', '/files', { file_asset_id: 'f' }],
          ['POST', '/comments', { body: 'hi' }], ['POST', '/admin-transition', { action: 'confirm_registration' }],
          ['DELETE', '/public-link', null],
        ]) {
          const res = await t.request(user, method, `/inventory/items/${id}${suffix}`, body);
          assert.equal(res.status, 404, `${user} ${method} ${id}${suffix}`);
        }
      }
    }
    // Viewer role: even inside area A the write handlers stay unreachable.
    for (const [method, body] of [['PUT', { name: 'x' }], ['DELETE', null]]) {
      assert.equal((await t.request('viewer', method, `/inventory/items/${IA}`, body)).status, 404);
    }
    assert.deepEqual(t.calls, []);
  });

  it('an editor reaches the write handlers of its own area only', async () => {
    assert.equal((await t.request('editor', 'PUT', `/inventory/items/${IA}`, { name: 'x' })).status, 200);
    assert.equal((await t.request('editor', 'DELETE', `/inventory/items/${IA}`)).status, 200);
    assert.deepEqual(t.calls, ['updateItem', 'deleteItem']);
  });

  it('moving an item needs write access to the target area', async () => {
    assert.equal((await t.request('editor', 'PUT', `/inventory/items/${IA}`, { areaId: AREA_B })).status, 403);
    assert.equal((await t.request('editor', 'PUT', `/inventory/items/${IA}`, { areaId: null })).status, 403);
    assert.equal((await t.request('editor', 'PUT', `/inventory/items/${IA}`, { areaId: AREA_A })).status, 200);
  });

  it('creating items requires a writable area', async () => {
    assert.equal((await t.request('editor', 'POST', '/inventory/items', { name: 'x' })).status, 403);
    assert.equal((await t.request('editor', 'POST', '/inventory/items', { name: 'x', areaId: AREA_B })).status, 403);
    assert.equal((await t.request('viewer', 'POST', '/inventory/items', { name: 'x', areaId: AREA_A })).status, 403);
    assert.deepEqual(t.calls, []);
    assert.equal((await t.request('editor', 'POST', '/inventory/items', { name: 'x', areaId: AREA_A })).status, 201);
    assert.deepEqual(t.calls, ['createItem']);
  });

  it('id lists (bulk transition, labels, custody) reject ids outside the scope', async () => {
    const bulk = (user, idList) => t.request(user, 'POST', '/inventory/items/admin-transition/bulk', { ids: idList, action: 'confirm_registration', effectiveDate: '2026-01-01' });
    assert.equal((await bulk('editor', [IA, IB])).status, 404);
    assert.equal((await bulk('editor', [IG])).status, 404);
    assert.equal((await bulk('viewer', [IA])).status, 404, 'a viewer cannot write');
    assert.notEqual((await bulk('editor', [IA])).status, 404, 'in-scope ids reach the handler');
    for (const path of ['/inventory/labels/render', '/inventory/labels/prints']) {
      assert.equal((await t.request('viewer', 'POST', path, { items: [{ itemId: IA }, { itemId: IB }] })).status, 404, path);
    }
    assert.equal((await t.request('editor', 'POST', '/inventory/custodies', { itemIds: [IA, IB], employeeId: 'e' })).status, 404);
    assert.equal((await t.request('editor', 'POST', '/inventory/custodies', { itemIds: [IG] })).status, 404);
  });

  it('custodies holding only out-of-scope items are unreachable', async () => {
    for (const [method, suffix] of [['GET', ''], ['GET', '/document'], ['PATCH', ''], ['POST', '/cancel'], ['POST', '/complete'], ['PATCH', `/items/${IB}`]]) {
      assert.equal((await t.request('editor', method, `/inventory/custodies/c1${suffix}`, method === 'GET' ? null : {})).status, 404, `${method} c1${suffix}`);
    }
  });

  it('assignment, media, scan, summary and identifier readers only see the area', async () => {
    assert.deepEqual(await ids(await t.request('viewer', 'GET', '/inventory/assignments')), ['as1']);
    assert.deepEqual(await ids(await t.request('viewer', 'GET', '/inventory/items/by-employee/emp1')), [IA]);
    assert.deepEqual(await ids(await t.request('viewer', 'GET', '/inventory/media')), ['f1']);
    const scan = (await (await t.request('viewer', 'POST', '/inventory/scan/resolve', { codes: ['S-A', 'S-B', 'S-G', 'F-B'] })).json()).data;
    assert.deepEqual(scan.map((row) => row.item?.id ?? null), [IA, null, null, null]);
    const summary = (await (await t.request('viewer', 'GET', '/inventory/summary')).json()).data;
    assert.equal(summary.total, 1);
    const ident = (await (await t.request('viewer', 'GET', '/inventory/items/check-identifiers?serialNumber=S-B')).json()).data;
    assert.deepEqual(ident.serialNumber, { restricted: true });
    const own = (await (await t.request('viewer', 'GET', '/inventory/items/check-identifiers?serialNumber=S-A')).json()).data;
    assert.equal(own.serialNumber.id, IA);
  });

  it('dashboard trends are restricted to the allowed areas in SQL', async () => {
    await t.request('viewer', 'GET', '/inventory/dashboard/trend');
    assert.ok(t.rawCalls.length >= 5);
    for (const values of t.rawCalls.filter((v) => v.some((x) => typeof x === 'boolean'))) {
      assert.ok(values.includes(false), 'unrestricted flag is false');
      assert.ok(values.some((x) => Array.isArray(x) && x.length === 1 && x[0] === AREA_A));
    }
    assert.equal(t.rawCalls.filter((v) => v.some((x) => typeof x === 'boolean')).length, 5);
  });
});

describe('unrestricted callers see everything', () => {
  for (const [label, user, featureOn] of [
    ['holder of inventory.scope.all', 'scopeAll', true],
    ['company admin', 'admin', true],
    ['any user when the feature is off', 'nobody', false],
  ]) {
    it(label, async () => {
      const t = build({ featureOn });
      assert.deepEqual(await ids(await t.request(user, 'GET', '/inventory/items')), [...ALL_IDS].sort());
      for (const id of ALL_IDS) assert.equal((await t.request(user, 'GET', `/inventory/items/${id}`)).status, 200);
      assert.equal((await t.request(user, 'PUT', `/inventory/items/${IB}`, { name: 'x' })).status, 200);
      assert.equal((await t.request(user, 'POST', '/inventory/items', { name: 'x' })).status, 201);
      assert.equal((await (await t.request(user, 'GET', '/inventory/summary')).json()).data.total, 3);
      assert.deepEqual(await ids(await t.request(user, 'GET', '/inventory/assignments')), ['as1', 'as2', 'as3']);
      assert.deepEqual(await ids(await t.request(user, 'GET', '/inventory/media')), ['f1', 'f2', 'f3']);
    });
  }
});

describe('custody visibility fragment', () => {
  it('keeps empty custodies and those holding an in-scope item; no fragment when unrestricted', () => {
    assert.equal(custodyScopeWhere({ all: true }), null);
    assert.equal(custodyScopeWhere(null), null);
    assert.deepEqual(custodyScopeWhere({ all: false, roles: new Map([[AREA_A, 'viewer']]) }), {
      OR: [{ items: { none: {} } }, { items: { some: { item: { areaId: { in: [AREA_A] } } } } }],
    });
  });
});
