// Supplier portal parity (models, catalog entries, custom fields, Excel import, branding): the REAL guest routers
// and services over the in-memory fake prisma. Capabilities live on the guest membership; a viewer never has them.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryGuestService } from '../../../../services/inventory-guest-service.js';
import { createInventoryGuestItems } from '../../../../services/inventory-guest-items.js';
import { createInventoryGuestImport } from '../../../../services/inventory-guest-import.js';
import { createInventoryScope } from '../../../../services/inventory-scope.js';
import { createAttemptGuard } from '../../../lms/lms-invite-core.js';
import { createInventoryGuestRouter } from '../guest-routes.js';
import { createInventoryGuestPublicRouter } from '../guest-public-routes.js';
import { createFakeDb } from '../../../../services/__tests__/inventory-guest-fake.js';

const CO = '01900000-0000-7000-8000-00000000c001';
const CO2 = '01900000-0000-7000-8000-00000000c002';
const AREA_A = '01900000-0000-7000-8000-0000000000aa';
const AREA_B = '01900000-0000-7000-8000-0000000000bb';
const TYPE = '01900000-0000-7000-8000-000000000e01';
const BRAND = '01900000-0000-7000-8000-000000000e02';
const TYPE_X = '01900000-0000-7000-8000-000000000e91'; // other company
const BRAND_X = '01900000-0000-7000-8000-000000000e92';
const MODEL = '01900000-0000-7000-8000-000000000f01';
const MODEL_X = '01900000-0000-7000-8000-000000000f91';
const FIELD = '01900000-0000-7000-8000-000000000d01';
const FIELD_X = '01900000-0000-7000-8000-000000000d91';

function build() {
  const db = createFakeDb({
    company: [{ id: CO, name: 'Acme', brandingConfig: { logoFileId: 'logo-1', primaryColor: '#112233' } }, { id: CO2, name: 'Other' }],
    invArea: [{ id: AREA_A, companyId: CO, parentId: null, name: 'A', enabled: true }, { id: AREA_B, companyId: CO, parentId: null, name: 'B', enabled: true }],
    invCategory: [{ id: TYPE, companyId: CO, enabled: true, name: 'Laptop' }, { id: TYPE_X, companyId: CO2, enabled: true, name: 'Secreto' }],
    invBrand: [{ id: BRAND, companyId: CO, enabled: true, name: 'Dell' }, { id: BRAND_X, companyId: CO2, enabled: true, name: 'Foreign' }],
    invModel: [
      { id: MODEL, companyId: CO, enabled: true, name: 'XPS 15', nameKey: 'xps 15', typeId: TYPE, brandId: BRAND, year: null },
      { id: MODEL_X, companyId: CO2, enabled: true, name: 'Hidden', nameKey: 'hidden', typeId: TYPE_X, brandId: BRAND_X, year: null },
    ],
    invCustomField: [
      { id: FIELD, companyId: CO, enabled: true, label: 'Sub ubicación', fieldKey: 'sub', fieldType: 'text', required: true, onDemand: false, categoryId: null, sortOrder: 0 },
      { id: FIELD_X, companyId: CO2, enabled: true, label: 'Ajeno', fieldKey: 'x', fieldType: 'text', onDemand: false, categoryId: null },
    ],
  });
  const audits = [];
  const bridge = { logAndPublish: async (args) => { audits.push(args); return {}; } };
  const sign = async (id) => `https://files.example.com/${id}`;
  const guestService = createInventoryGuestService({ prisma: db, appBaseUrl: () => 'https://app.example.com', attemptGuard: createAttemptGuard(), signFile: sign });
  const items = createInventoryGuestItems({ prisma: db, inventoryScope: createInventoryScope({ prisma: db }), bridge, signFile: sign });
  const app = new Hono();
  app.route('/public/inventory/guest', createInventoryGuestPublicRouter({ guestService }));
  app.route('/inventory/guest', createInventoryGuestRouter({ guestService, items, imports: createInventoryGuestImport({ prisma: db, items, bridge }) }));
  const req = (token, method, path, body) => app.request(path, {
    method,
    headers: { authorization: `Guest ${token}`, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
  async function guest(email, areaId, role, flags = {}) {
    const res = await guestService.inviteToArea({ companyId: CO, areaId, email, role, ...flags });
    const start = await app.request('/public/inventory/guest/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: res.link.split('/').pop() }) });
    const data = (await start.json()).data;
    return { id: res.guest.id, token: data.sessionToken, session: data };
  }
  const csv = (text, options) => {
    const form = new FormData();
    form.set('file', new File([text], 'activos.csv', { type: 'text/csv' }));
    if (options) form.set('options', JSON.stringify(options));
    return form;
  };
  return { db, req, guest, audits, csv };
}

describe('capabilities and branding', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('/me and the session exchange return branding; /me returns effective capabilities per area', async () => {
    const g = await t.guest('e@b.co', AREA_A, 'editor', { canCreateModels: true });
    assert.deepEqual(g.session.company, { name: 'Acme', logoUrl: 'https://files.example.com/logo-1', primaryColor: '#112233' });
    const me = (await (await t.req(g.token, 'GET', '/inventory/guest/me')).json()).data;
    assert.deepEqual(me.company, g.session.company);
    assert.deepEqual(me.capabilities, { canCreateModels: true, canImport: false });
    assert.deepEqual([me.areas[0].canCreateModels, me.areas[0].canImport], [true, false]);
  });

  it('a viewer never gets capabilities, even if the stored flags say so', async () => {
    const v = await t.guest('v@b.co', AREA_A, 'viewer');
    Object.assign(t.db.invAreaMember.rows.find((m) => m.guestId === v.id), { canCreateModels: true, canImport: true });
    const me = (await (await t.req(v.token, 'GET', '/inventory/guest/me')).json()).data;
    assert.deepEqual(me.capabilities, { canCreateModels: false, canImport: false });
    assert.equal((await t.req(v.token, 'POST', '/inventory/guest/models', { name: 'X', typeId: TYPE, brandId: BRAND })).status, 403);
    assert.equal((await t.req(v.token, 'GET', '/inventory/guest/item-import/template')).status, 403);
  });
});

describe('models, catalog entries and custom fields', () => {
  let t, plain, maker;
  beforeEach(async () => { t = build(); plain = await t.guest('p@b.co', AREA_A, 'editor'); maker = await t.guest('m@b.co', AREA_B, 'editor', { canCreateModels: true }); });

  it('searches the company models with type and brand, never other companies', async () => {
    const rows = (await (await t.req(plain.token, 'GET', '/inventory/guest/models?search=xps')).json()).data;
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].id, rows[0].typeName, rows[0].brandName], [MODEL, 'Laptop', 'Dell']);
    assert.ok(!('companyId' in rows[0]));
    const all = (await (await t.req(plain.token, 'GET', '/inventory/guest/models')).json()).data;
    assert.ok(all.every((m) => m.id !== MODEL_X));
    const types = (await (await t.req(plain.token, 'GET', '/inventory/guest/types')).json()).data;
    assert.deepEqual(types.map((x) => x.name), ['Laptop']);
  });

  it('without the capability a guest cannot create models or catalog entries', async () => {
    for (const [path, body] of [['models', { name: 'Z', typeId: TYPE, brandId: BRAND }], ['brands', { name: 'HP' }], ['types', { name: 'Monitor' }], ['locations', { name: 'Bodega' }], ['conditions', { name: 'Nuevo' }]]) {
      const res = await t.req(plain.token, 'POST', `/inventory/guest/${path}`, body);
      assert.equal(res.status, 403, path);
      assert.equal((await res.json()).code, 'CAPABILITY_REQUIRED');
    }
    assert.equal(t.db.invModel.rows.length, 2);
  });

  it('with the capability it creates models (company scoped, duplicates refused, audited as the guest)', async () => {
    const ok = await t.req(maker.token, 'POST', '/inventory/guest/models', { name: 'Latitude 7440', typeId: TYPE, brandId: BRAND });
    assert.equal(ok.status, 201);
    const model = (await ok.json()).data;
    assert.equal(t.db.invModel.rows.find((m) => m.id === model.id).companyId, CO);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/models', { name: 'latitude 7440', typeId: TYPE, brandId: BRAND })).status, 409);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/models', { name: 'Y', typeId: TYPE_X, brandId: BRAND })).status, 400);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/models', { name: 'Y', typeId: TYPE, brandId: BRAND_X })).status, 400);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/models', { name: 'Y', typeId: TYPE, brandId: BRAND, companyId: CO2 })).status, 400);
    const audit = t.audits.find((a) => a.auditEntry.action === 'inventory.model.created');
    assert.equal(audit.auditEntry.actorId, null);
    assert.equal(audit.auditEntry.metadata.actor.id, maker.id);
  });

  it('creates brands, types, locations and conditions, reusing an existing name', async () => {
    const brand = (await (await t.req(maker.token, 'POST', '/inventory/guest/brands', { name: 'HP', website: 'evil.example' })).json()).data;
    assert.equal(brand.reused, false);
    assert.equal(t.db.invBrand.rows.find((b) => b.id === brand.id).website, undefined);
    assert.equal(t.db.invBrand.rows.find((b) => b.id === brand.id).companyId, CO);
    const again = (await (await t.req(maker.token, 'POST', '/inventory/guest/brands', { name: 'hp' })).json()).data;
    assert.deepEqual([again.id, again.reused], [brand.id, true]);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/locations', { name: 'Bodega' })).status, 201);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/conditions', { name: 'Nuevo' })).status, 201);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/types', { name: 'Monitor' })).status, 201);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/brands', { name: '  ' })).status, 400);
    assert.equal((await t.req(maker.token, 'POST', '/inventory/guest/users', { name: 'x' })).status, 404);
  });

  it('exposes the full custom field definitions of its own company only', async () => {
    const fields = (await (await t.req(plain.token, 'GET', '/inventory/guest/custom-fields')).json()).data;
    assert.deepEqual(fields.map((f) => [f.id, f.required, f.fieldType]), [[FIELD, true, 'text']]);
    const catalogs = (await (await t.req(plain.token, 'GET', '/inventory/guest/catalogs')).json()).data;
    assert.ok(catalogs.customFields.every((f) => f.id !== FIELD_X && 'required' in f));
  });

  it('custom field suggestions only draw from the items the guest can see', async () => {
    let where;
    t.db.invCustomFieldValue.groupBy = async (args) => { where = args.where; return [{ value: 'Rack 1', _count: { _all: 2 } }]; };
    const res = await t.req(plain.token, 'GET', `/inventory/guest/custom-fields/${FIELD}/values?search=ra`);
    assert.deepEqual((await res.json()).data, ['Rack 1']);
    assert.deepEqual(where.item.areaId, { in: [AREA_A] });
    assert.equal(where.item.companyId, CO);
    assert.equal((await t.req(plain.token, 'GET', `/inventory/guest/custom-fields/${FIELD_X}/values`)).status, 404);
  });
});

describe('item form parity', () => {
  let t, editor;
  beforeEach(async () => { t = build(); editor = await t.guest('e@b.co', AREA_A, 'editor'); });

  it('a model fills type and brand, custom values persist, foreign refs are refused', async () => {
    const res = await t.req(editor.token, 'POST', '/inventory/guest/items', { areaId: AREA_A, modelId: MODEL, serialNumber: 'SN-1', customValues: [{ fieldId: FIELD, value: 'Rack 2' }, { fieldId: FIELD_X, value: 'leak' }] });
    assert.equal(res.status, 201);
    const created = (await res.json()).data;
    assert.deepEqual([created.modelId, created.model, created.categoryId, created.brandId], [MODEL, 'XPS 15', TYPE, BRAND]);
    assert.deepEqual(t.db.invCustomFieldValue.rows.map((r) => [r.fieldId, r.value]), [[FIELD, 'Rack 2']]);
    assert.equal((await t.req(editor.token, 'POST', '/inventory/guest/items', { areaId: AREA_A, modelId: MODEL_X })).status, 400);
    assert.equal((await t.req(editor.token, 'POST', '/inventory/guest/items', { areaId: AREA_A, categoryId: TYPE_X })).status, 400);
    const patch = await t.req(editor.token, 'PATCH', `/inventory/guest/items/${created.id}`, { modelId: MODEL, notes: 'ok', warrantyExpiry: '2028-01-01' });
    assert.equal(patch.status, 200);
  });

  it('check-identifiers hides the data of items outside its areas', async () => {
    t.db.invItem.rows.push({ id: 'i-b', companyId: CO, areaId: AREA_B, enabled: true, name: 'B', serialNumber: 'DUP', assetTag: null });
    const res = await (await t.req(editor.token, 'GET', '/inventory/guest/items/check-identifiers?serialNumber=dup')).json();
    assert.deepEqual(res.data.serialNumber, { restricted: true });
  });
});

describe('guest Excel import', () => {
  let t, importer, plain;
  const FILE = 'Nombre,Serie,Precio,Proveedor,Marca\nTaladro,SN-10,99,Acme,Dell\nSierra,SN-11,10,X,Nuevo';
  beforeEach(async () => {
    t = build();
    importer = await t.guest('i@b.co', AREA_A, 'editor', { canImport: true });
    plain = await t.guest('p@b.co', AREA_B, 'editor');
  });

  it('needs the import capability on an editor membership', async () => {
    for (const [method, path, body] of [['GET', 'template'], ['POST', 'parse', t.csv(FILE)], ['POST', 'preview', { rows: [], mapping: {} }], ['POST', 'commit', t.csv(FILE, { mapping: { name: 'Nombre' }, areaId: AREA_B })]]) {
      const res = await t.req(plain.token, method, `/inventory/guest/item-import/${path}`, body);
      assert.equal(res.status, 403, path);
    }
  });

  it('template and parse never offer commercial or admin columns', async () => {
    const template = await t.req(importer.token, 'GET', '/inventory/guest/item-import/template');
    assert.equal(template.status, 200);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await template.arrayBuffer()));
    const headers = wb.worksheets[0].getRow(1).values.filter(Boolean);
    for (const banned of ['Precio de compra', 'Proveedor', 'Número de factura', 'Fecha de compra', 'Estado (alta)']) assert.ok(!headers.includes(banned), banned);
    assert.ok(headers.includes('Número de serie'));
    const parsed = (await (await t.req(importer.token, 'POST', '/inventory/guest/item-import/parse', t.csv(FILE))).json()).data;
    assert.ok(parsed.fields.every((f) => !['purchasePrice', 'vendorName', 'invoiceNumber', 'purchaseDate', 'adminStatus'].includes(f.key)));
    assert.deepEqual(Object.keys(parsed.mapping).sort(), ['brand', 'name', 'serialNumber']);
  });

  it('rejects a mapping onto sensitive fields', async () => {
    const res = await t.req(importer.token, 'POST', '/inventory/guest/item-import/preview', { rows: [{ Precio: '9' }], mapping: { purchasePrice: 'Precio' } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'FIELD_NOT_ALLOWED');
  });

  it('commit forces every row into a writable import area and never creates catalog entries without the flag', async () => {
    const mapping = { name: 'Nombre', serialNumber: 'Serie', brand: 'Marca' };
    for (const areaId of [AREA_B, '01900000-0000-7000-8000-0000000000ff']) {
      const denied = await t.req(importer.token, 'POST', '/inventory/guest/item-import/commit', t.csv(FILE, { mapping, areaId }));
      assert.equal(denied.status, 403, areaId);
    }
    const res = await t.req(importer.token, 'POST', '/inventory/guest/item-import/commit', t.csv(FILE, { mapping, createMissing: true }));
    assert.equal(res.status, 200);
    const data = (await res.json()).data;
    // Only «Dell» exists: the row with the unknown brand fails because createMissing needs the catalog capability.
    assert.equal(data.created, 1);
    assert.equal(data.failed, 1);
    const rows = t.db.invItem.rows.filter((i) => i.serialNumber);
    assert.deepEqual(rows.map((r) => [r.serialNumber, r.areaId, r.companyId]), [['SN-10', AREA_A, CO]]);
    assert.equal(t.db.invBrand.rows.filter((b) => b.companyId === CO).length, 1);
    assert.ok(rows.every((r) => r.purchasePrice == null && r.vendorName == null));
    assert.ok(t.audits.some((a) => a.auditEntry.entityType === 'InvImport' && a.auditEntry.metadata.actor.id === importer.id));
  });

  it('with the catalog capability createMissing creates brands; bajas in the file are refused', async () => {
    const both = await t.guest('b@b.co', AREA_A, 'editor', { canImport: true, canCreateModels: true });
    const mapping = { name: 'Nombre', serialNumber: 'Serie', brand: 'Marca' };
    const ok = (await (await t.req(both.token, 'POST', '/inventory/guest/item-import/commit', t.csv(FILE, { mapping, createMissing: true }))).json()).data;
    assert.equal(ok.created, 2);
    assert.ok(t.db.invBrand.rows.some((b) => b.name === 'Nuevo' && b.companyId === CO));
    const baja = (await (await t.req(both.token, 'POST', '/inventory/guest/item-import/commit', t.csv('Nombre,Serie,Estado\nViejo,SN-99,Baja', { mapping: { name: 'Nombre', serialNumber: 'Serie', status: 'Estado' } }))).json()).data;
    assert.equal(baja.created, 0);
    assert.equal(baja.failed, 1);
  });
});
