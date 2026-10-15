// inventory-public-service.test.js — token lifecycle, settings-based field
// filtering, company isolation and the public route, against an in-memory prisma.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryPublicService } from '../inventory-public-service.js';
import { createInventoryItemPublicRouter } from '../../routes/inventory/item-public-routes.js';
import { createInventoryLabelService } from '../inventory-label-service.js';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b';
let seq = 0;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date) && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
}

function fakePrisma() {
  const tokens = [];
  const config = [];
  const items = [
    { id: 'i1', companyId: A, enabled: true, folio: 'LAP-1', name: 'Laptop', status: 'available', adminStatus: 'registered', serialNumber: 'SN1', purchasePrice: '999.5', location: { name: 'Oficina' }, assignedTo: { firstName: 'Ana', lastName: 'Ruiz' } },
    { id: 'i2', companyId: B, enabled: true, folio: 'LAP-2', name: 'Otra', status: 'available', adminStatus: 'registered', location: null, assignedTo: null },
  ];
  return {
    tokens,
    config,
    invItem: {
      findFirst: async ({ where }) => items.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }) => items.filter((r) => matches(r, where)),
    },
    invPublicToken: {
      create: async ({ data }) => { const row = { id: `t${++seq}`, revokedAt: null, ...data }; tokens.push(row); return row; },
      findFirst: async ({ where }) => tokens.find((r) => matches(r, where)) ?? null,
      findMany: async ({ where }) => tokens.filter((r) => matches(r, where)),
      findUnique: async ({ where }) => tokens.find((r) => r.tokenHash === where.tokenHash) ?? null,
      updateMany: async ({ where, data }) => { const hit = tokens.filter((r) => matches(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    },
    instanceConfig: {
      findUnique: async ({ where }) => config.find((r) => r.key === where.key) ?? null,
      upsert: async ({ where, create, update }) => {
        const row = config.find((r) => r.key === where.key);
        if (row) Object.assign(row, update); else config.push({ ...create });
      },
    },
    invItemFile: { findFirst: async () => null },
    company: { findUnique: async ({ where }) => ({ name: where.id === A ? 'Acme' : 'Beta' }) },
  };
}

const make = (prisma = fakePrisma()) => ({ prisma, svc: createInventoryPublicService({ prisma, secret: 'test-secret' }) });

describe('inventory public tokens', () => {
  it('creates lazily, reuses the active token and stores only a hash', async () => {
    const { prisma, svc } = make();
    const first = await svc.ensureToken(A, 'i1');
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(await svc.ensureToken(A, 'i1'), first);
    assert.equal(prisma.tokens.length, 1);
    assert.ok(!JSON.stringify(prisma.tokens).includes(first));
  });

  it('rejects items of another company', async () => {
    const { svc } = make();
    await assert.rejects(svc.ensureToken(A, 'i2'), { status: 404 });
    const map = await svc.ensureTokens(A, ['i1', 'i2']);
    assert.deepEqual([...map.keys()], ['i1']);
  });

  it('revoke invalidates the link and the next ensure issues a new one', async () => {
    const { svc } = make();
    const first = await svc.ensureToken(A, 'i1');
    assert.equal((await svc.revoke(A, 'i1')).revoked, 1);
    await assert.rejects(svc.resolve(first), { status: 404, message: 'Enlace no válido.' });
    const second = await svc.ensureToken(A, 'i1');
    assert.notEqual(second, first);
    assert.equal((await svc.resolve(second)).itemId, 'i1');
  });

  it('revoke cannot touch another company and revokeAll is company scoped', async () => {
    const { svc } = make();
    const t1 = await svc.ensureToken(A, 'i1');
    const t2 = await svc.ensureToken(B, 'i2');
    assert.equal((await svc.revoke(B, 'i1')).revoked, 0);
    assert.equal((await svc.revokeAll(A)).revoked, 1);
    await assert.rejects(svc.resolve(t1), { status: 404 });
    assert.equal((await svc.resolve(t2)).itemId, 'i2');
  });

  it('unknown, malformed and legacy f-<folio> tokens are the same 404', async () => {
    const { svc } = make();
    for (const token of ['f-LAP-1', 'short', 'x'.repeat(43), '']) {
      await assert.rejects(svc.resolve(token), { status: 404, message: 'Enlace no válido.' });
    }
  });
});

describe('inventory public page fields', () => {
  it('defaults hide costs, holder and serial', async () => {
    const { svc } = make();
    const data = await svc.resolve(await svc.ensureToken(A, 'i1'));
    assert.deepEqual(Object.keys(data).sort(), ['adminStatus', 'companyLogoUrl', 'companyName', 'folio', 'itemId', 'locationName', 'name', 'photoUrl', 'status'].sort());
    assert.equal(data.companyName, 'Acme');
  });

  it('settings toggle each extra field', async () => {
    const { svc } = make();
    const token = await svc.ensureToken(A, 'i1');
    await svc.updateSettings(A, { showCosts: true, showHolder: true, showSerial: true, showLocation: false, showPhoto: false, showStatus: false });
    const data = await svc.resolve(token);
    assert.equal(data.purchasePrice, '999.5');
    assert.equal(data.holderName, 'Ana Ruiz');
    assert.equal(data.serialNumber, 'SN1');
    for (const key of ['locationName', 'photoUrl', 'status', 'adminStatus']) assert.ok(!(key in data));
    assert.equal(data.folio, 'LAP-1');
  });

  it('settings are per company and reject non-booleans', async () => {
    const { svc } = make();
    await svc.updateSettings(A, { showSerial: true });
    assert.equal((await svc.getSettings(B)).showSerial, false);
    await assert.rejects(svc.updateSettings(A, { showCosts: 'yes' }), { status: 400 });
  });
});

describe('labels use the token url', () => {
  it('ensureTokens + urlFor build /app/p/inv/<token>', async () => {
    const { svc } = make();
    const map = await svc.ensureTokens(A, ['i1']);
    assert.equal(svc.urlFor('https://erp.example.com/', map.get('i1')), `https://erp.example.com/app/p/inv/${map.get('i1')}`);
    assert.ok(createInventoryLabelService({ prisma: fakePrisma(), publicService: svc }));
  });
});

describe('public item route', () => {
  const build = (limiter) => {
    const { svc } = make();
    return { svc, app: createInventoryItemPublicRouter({ prisma: null, publicService: svc, ...(limiter ? { limiter } : {}) }) };
  };

  it('serves a valid token and answers identically for revoked and unknown', async () => {
    const { svc, app } = build();
    const token = await svc.ensureToken(A, 'i1');
    const ok = await app.request(`/${token}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal((await ok.json()).item.name, 'Laptop');
    await svc.revoke(A, 'i1');
    const revoked = await app.request(`/${token}`);
    const unknown = await app.request(`/${'z'.repeat(43)}`);
    const legacy = await app.request('/f-LAP-1');
    assert.equal(revoked.status, 404);
    const bodies = await Promise.all([revoked, unknown, legacy].map((r) => r.text()));
    assert.equal(new Set(bodies).size, 1);
    assert.equal(unknown.status, 404);
    assert.equal(legacy.status, 404);
  });

  it('is rate limited per IP', async () => {
    let calls = 0;
    const { app } = build({ consume: () => (++calls > 1 ? { allowed: false, retryAfter: 7 } : { allowed: true }) });
    assert.equal((await app.request('/x')).status, 404);
    const blocked = await app.request('/x');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '7');
  });
});
