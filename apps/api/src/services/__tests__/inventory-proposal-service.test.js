import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryProposalService } from '../inventory-proposal-service.js';

const CO = '01900000-0000-7000-8000-00000000c001';
const ITEM = '01900000-0000-7000-8000-0000000000a1';
const AREA = '01900000-0000-7000-8000-0000000000b1';
const CAT = '01900000-0000-7000-8000-0000000000c1';

function setup({ areaId = AREA } = {}) {
  const item = { id: ITEM, companyId: CO, enabled: true, areaId, name: 'Lector', serialNumber: 'SN-1', assetTag: null, model: 'X1', categoryId: null, warrantyExpiry: null, area: { name: 'SITA' }, category: null, brand: null, location: null, condition: null };
  const rows = [];
  const updates = [];
  const prisma = {
    invItem: {
      findFirst: async ({ where }) => {
        const wanted = where.serialNumber?.equals ?? where.assetTag?.equals;
        if (wanted !== undefined) return String(wanted).toLowerCase() === 'sn-1' ? { id: ITEM } : null;
        return where.id === ITEM ? item : null;
      },
      findMany: async () => [item],
    },
    invChangeProposal: {
      findFirst: async ({ where }) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null,
      findMany: async ({ where }) => rows.filter((r) => r.companyId === where.companyId && r.status === where.status),
      create: async ({ data }) => { const row = { id: `p${rows.length + 1}`, status: 'pending', decisions: {}, createdAt: new Date(), ...data }; rows.push(row); return row; },
      update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
    },
  };
  const inventoryService = { updateItem: async (id, patch) => { updates.push({ id, patch }); } };
  return { svc: createInventoryProposalService({ prisma, inventoryService }), rows, updates };
}

const guest = { guestId: 'g1', label: 'Ana (proveedor)' };
const body = (extra = {}) => ({ matchedField: 'serialNumber', matchedValue: ' sn-1 ', changes: { name: { value: 'Lector HID' } }, ...extra });
const all = { all: true };

describe('submit', () => {
  it('matches the item by identifier and answers only id and status', async () => {
    const { svc, rows } = setup();
    const res = await svc.submit({ companyId: CO, proposer: guest, body: body() });
    assert.deepEqual(Object.keys(res).sort(), ['id', 'status']);
    assert.equal(rows[0].itemId, ITEM);
    assert.equal(rows[0].matchedValue, 'sn-1');
  });
  it('rejects fields outside the allowlist, empty proposals and numbers that no longer exist', async () => {
    const { svc } = setup();
    await assert.rejects(svc.submit({ companyId: CO, proposer: guest, body: body({ changes: { serialNumber: { value: 'x' } } }) }), { code: 'FIELD_NOT_ALLOWED' });
    await assert.rejects(svc.submit({ companyId: CO, proposer: guest, body: body({ changes: { name: { value: '  ' } } }) }), { code: 'NOTHING_TO_PROPOSE' });
    await assert.rejects(svc.submit({ companyId: CO, proposer: guest, body: body({ matchedValue: 'nope' }) }), { code: 'DUPLICATE_GONE' });
  });
  it('sending again replaces the proposer\'s pending proposal instead of stacking', async () => {
    const { svc, rows } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: body() });
    await svc.submit({ companyId: CO, proposer: guest, body: body({ changes: { notes: { value: 'otro' } } }) });
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0].changes), ['notes']);
  });
  it('an access request needs no values', async () => {
    const { svc, rows } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: { kind: 'access_request', matchedField: 'serialNumber', matchedValue: 'SN-1', message: 'Lo necesito' } });
    assert.equal(rows[0].kind, 'access_request');
  });
});

describe('review', () => {
  it('applies only the accepted fields and reports partial', async () => {
    const { svc, rows, updates } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: body({ changes: { name: { value: 'Lector HID' }, notes: { value: 'nota' } } }) });
    const res = await svc.review({ companyId: CO, id: rows[0].id, body: { decisions: { name: 'accept', notes: 'reject' } }, scope: all });
    assert.equal(res.status, 'partial');
    assert.deepEqual(updates, [{ id: ITEM, patch: { name: 'Lector HID' } }]);
    assert.deepEqual(rows[0].decisions, { name: 'accept', notes: 'reject' });
  });
  it('rejecting everything changes nothing, and a proposal is reviewed once', async () => {
    const { svc, rows, updates } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: body() });
    assert.equal((await svc.review({ companyId: CO, id: rows[0].id, body: {}, scope: all })).status, 'rejected');
    assert.equal(updates.length, 0);
    await assert.rejects(svc.review({ companyId: CO, id: rows[0].id, body: {}, scope: all }), { code: 'ALREADY_REVIEWED' });
  });
  it('a reviewer without write access to the item area cannot see or review it', async () => {
    const { svc, rows } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: body() });
    const viewerOnly = { all: false, roles: new Map([[AREA, 'viewer']]) };
    assert.equal((await svc.list({ companyId: CO, scope: viewerOnly })).length, 0);
    await assert.rejects(svc.review({ companyId: CO, id: rows[0].id, body: {}, scope: viewerOnly }), { status: 404 });
    const editor = { all: false, roles: new Map([[AREA, 'editor']]) };
    const listed = await svc.list({ companyId: CO, scope: editor });
    assert.equal(listed.length, 1);
    assert.deepEqual([listed[0].changes[0].field, listed[0].changes[0].current.value, listed[0].changes[0].proposed.value], ['name', 'Lector', 'Lector HID']);
  });
  it('an access request is closed as dismissed', async () => {
    const { svc, rows } = setup();
    await svc.submit({ companyId: CO, proposer: guest, body: { kind: 'access_request', matchedField: 'serialNumber', matchedValue: 'SN-1' } });
    assert.equal((await svc.review({ companyId: CO, id: rows[0].id, body: {}, scope: all })).status, 'dismissed');
  });
});
