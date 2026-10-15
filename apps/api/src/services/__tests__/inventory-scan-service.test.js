// inventory-scan-service.test.js — kiosk code resolution (QR link, folio,
// serial, asset number), company isolation, the per-call cap and the route.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryPublicService } from '../inventory-public-service.js';
import { createInventoryScanService, publicTokenFromCode, MAX_SCAN_CODES } from '../inventory-scan-service.js';
import { createInventoryScanRouter } from '../../routes/inventory/scan-routes.js';
import { InventoryServiceError } from '../inventory-guards.js';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b';
let seq = 0;

const matchValue = (actual, expected) => {
  if (expected && typeof expected === 'object') {
    if ('in' in expected) return expected.in.includes(actual);
    if ('equals' in expected) return actual != null && String(actual).toLowerCase() === String(expected.equals).toLowerCase();
  }
  return actual === expected;
};
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => (
  key === 'OR' ? value.some((w) => matches(row, w)) : matchValue(row[key], value)
));

function fakePrisma() {
  const tokens = [];
  const items = [
    { id: 'i1', companyId: A, enabled: true, folio: 'LAP-DELL-1', name: 'Laptop', serialNumber: 'SN-ABC', assetTag: 'AT-001', status: 'available', adminStatus: 'registered', location: { id: 'l1', name: 'Oficina' }, category: { name: 'Laptop' }, brand: { name: 'Dell' } },
    { id: 'i2', companyId: B, enabled: true, folio: 'LAP-HP-1', name: 'Otra', serialNumber: 'SN-B', assetTag: 'AT-B', status: 'available', adminStatus: 'registered' },
    { id: 'i3', companyId: A, enabled: false, folio: 'OLD-1', name: 'Vieja', serialNumber: 'SN-OLD', status: 'available', adminStatus: 'registered' },
  ];
  return {
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
    invItemFile: { findMany: async () => [{ itemId: 'i1', fileAssetId: 'f1', isCover: true }] },
  };
}

function make() {
  const prisma = fakePrisma();
  const publicService = createInventoryPublicService({ prisma, secret: 'test-secret' });
  return { publicService, scan: createInventoryScanService({ prisma, publicService }), prisma };
}

describe('inventory scan resolution', () => {
  it('extracts the token from absolute and relative item links only', () => {
    const token = 'a'.repeat(43);
    assert.equal(publicTokenFromCode(`https://erp.example.com/app/p/inv/${token}`), token);
    assert.equal(publicTokenFromCode(` /app/p/inv/${token}?x=1 `), token);
    assert.equal(publicTokenFromCode('LAP-DELL-1'), null);
  });

  it('resolves a Runly QR link through the public token', async () => {
    const { scan, publicService } = make();
    const token = await publicService.ensureToken(A, 'i1');
    const [hit] = await scan.resolveCodes(A, [`https://erp.example.com/app/p/inv/${token}`]);
    assert.equal(hit.matchedBy, 'link');
    assert.equal(hit.item.id, 'i1');
    assert.equal(hit.item.coverImageFileId, 'f1');
    assert.equal(hit.item.locationName, 'Oficina');
    await publicService.revoke(A, 'i1');
    assert.equal((await scan.resolveCodes(A, [`/app/p/inv/${token}`]))[0].item, null);
  });

  it('matches folio, serial and asset number trimmed and case-insensitive', async () => {
    const { scan } = make();
    const out = await scan.resolveCodes(A, [' lap-dell-1 ', 'sn-abc', 'AT-001', 'NOPE', 'SN-OLD']);
    assert.deepEqual(out.map((r) => r.matchedBy), ['folio', 'serial', 'assetTag', null, null]);
    assert.deepEqual(out.map((r) => r.item?.id ?? null), ['i1', 'i1', 'i1', null, null]);
    assert.equal(out[0].code, 'lap-dell-1');
  });

  it('never resolves items or links of another company', async () => {
    const { scan, publicService } = make();
    const foreign = await publicService.ensureToken(B, 'i2');
    const out = await scan.resolveCodes(A, ['LAP-HP-1', 'SN-B', `/app/p/inv/${foreign}`]);
    assert.ok(out.every((r) => r.item === null));
  });

  it('caps the codes per call', async () => {
    const { scan } = make();
    await assert.rejects(scan.resolveCodes(A, Array.from({ length: MAX_SCAN_CODES + 1 }, (_, i) => `C${i}`)), { status: 400 });
    await assert.rejects(scan.resolveCodes(A, 'LAP'), { status: 400 });
  });

  it('exports the session table as an XLSX workbook', async () => {
    const { scan } = make();
    const buffer = await scan.exportXlsx({ columns: ['Folio', 'Nombre'], rows: [['LAP-1', 'Laptop'], ['', '=cmd']] });
    assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), 'PK');
    await assert.rejects(scan.exportXlsx({ columns: [], rows: [] }), { status: 400 });
  });

  it('POST /inventory/scan/resolve is guarded and scoped to the caller company', async () => {
    const { publicService, prisma } = make();
    const seen = [];
    const requirePermission = (key) => async (c, next) => { seen.push(key); c.set('companyId', A); await next(); };
    const app = new Hono().route('/', createInventoryScanRouter({ prisma, requirePermission, InventoryServiceError, publicService }));
    const res = await app.request('/inventory/scan/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codes: ['AT-001', 'LAP-HP-1'] }) });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.deepEqual(data.map((r) => r.item?.id ?? null), ['i1', null]);
    assert.ok(seen.every((key) => key === 'inventory.item.read'));
  });
});
