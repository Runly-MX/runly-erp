// inventory-label-service.test.js — templates, print log, company isolation and
// route permission gating, against a tiny in-memory prisma.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createInventoryLabelService } from '../inventory-label-service.js';
import { createInventoryLabelRouter } from '../../routes/inventory/label-routes.js';
import { InventoryServiceError } from '../inventory-guards.js';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b';
let seq = 0;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'NOT') return row.id !== value.id;
    if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
    return row[key] === value;
  });
}

function table(name, store) {
  const rows = (store[name] ??= []);
  return {
    count: async ({ where }) => rows.filter((r) => matches(r, where)).length,
    createMany: async ({ data }) => { for (const d of data) rows.push({ id: `${name}-${++seq}`, createdAt: new Date(seq), enabled: true, isDefault: false, ...d }); },
    create: async ({ data }) => { const row = { id: `${name}-${++seq}`, createdAt: new Date(seq), enabled: true, isDefault: false, ...data }; rows.push(row); return row; },
    findFirst: async ({ where }) => rows.find((r) => matches(r, where)) ?? null,
    findUnique: async ({ where }) => rows.find((r) => r.id === where.id) ?? null,
    findMany: async ({ where, select }) => rows.filter((r) => matches(r, where)).map((r) => (select?.location ? { ...r, location: null } : r)),
    update: async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data),
    updateMany: async ({ where, data }) => { rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, data)); },
  };
}

function fakePrisma(items = []) {
  const store = { invItem: items };
  const db = {
    invLabelTemplate: table('tpl', store),
    invLabelPrinter: table('prn', store),
    invLabelPrint: table('prt', store),
    invItem: table('invItem', store),
    company: { findUnique: async () => ({ name: 'Acme' }) },
    $transaction: async (ops) => Promise.all(ops),
  };
  db.store = store;
  return db;
}

const ITEMS = [
  { id: 'i1', companyId: A, enabled: true, folio: 'LT-1', name: 'Laptop' },
  { id: 'i2', companyId: B, enabled: true, folio: 'LT-2', name: 'Other company' },
];

describe('inventory label service', () => {
  it('seeds the three default templates lazily, once, per company', async () => {
    const prisma = fakePrisma();
    const svc = createInventoryLabelService({ prisma, publicBaseUrl: 'https://erp.example.com' });
    const first = await svc.listTemplates(A);
    assert.deepEqual(first.map((t) => t.name).sort(), ['Compacta', 'Estándar', 'Solo código']);
    assert.equal(first.filter((t) => t.isDefault).length, 1);
    await svc.listTemplates(A);
    assert.equal(prisma.store.tpl.length, 3);
    assert.equal((await svc.listTemplates(B)).length, 3);
    assert.equal(prisma.store.tpl.length, 6);
  });

  it('isolates templates by company', async () => {
    const svc = createInventoryLabelService({ prisma: fakePrisma(), publicBaseUrl: 'https://erp.example.com' });
    const [tpl] = await svc.listTemplates(A);
    await assert.rejects(svc.updateTemplate(B, tpl.id, { name: 'x' }), /no existe/);
    await assert.rejects(svc.removeTemplate(B, tpl.id), /no existe/);
    const created = await svc.createTemplate(A, { name: 'Mia', preset: '100x50', fields: ['folio'], isDefault: true });
    assert.equal(created.widthMm, 100);
    assert.equal((await svc.listTemplates(A)).filter((t) => t.isDefault).length, 1);
  });

  it('registers one print row per valid item and ignores foreign items', async () => {
    const prisma = fakePrisma(ITEMS);
    const svc = createInventoryLabelService({ prisma, publicBaseUrl: 'https://erp.example.com' });
    const [tpl] = await svc.listTemplates(A);
    const result = await svc.registerPrints(A, 'user-1', { templateId: tpl.id, items: [{ itemId: 'i1', quantity: 3 }, { itemId: 'i2', quantity: 9 }] });
    assert.deepEqual(result, { count: 1, labels: 3 });
    assert.deepEqual(prisma.store.prt.map((r) => [r.companyId, r.itemId, r.quantity, r.userId, r.templateId]), [[A, 'i1', 3, 'user-1', tpl.id]]);
    await assert.rejects(svc.registerPrints(A, 'user-1', { items: [{ itemId: 'i2' }] }), /Ningún equipo válido/);
    await assert.rejects(svc.registerPrints(A, 'user-1', { templateId: 'foreign', items: [{ itemId: 'i1' }] }), /plantilla/);
  });

  it('renders ZPL for the default template using the placeholder QR URL', async () => {
    const svc = createInventoryLabelService({ prisma: fakePrisma(ITEMS), publicBaseUrl: 'https://erp.example.com' });
    const out = await svc.render(A, { format: 'zpl', items: [{ itemId: 'i1', quantity: 2 }] });
    assert.equal(out.labelCount, 2);
    assert.match(out.body, /\^FDMA,https:\/\/erp\.example\.com\/app\/p\/inv\/f-LT-1\^FS/);
    assert.match(out.body, /\^PQ2,/);
    await assert.rejects(svc.render(A, { format: 'zpl', items: [{ itemId: 'i2' }] }), /No hay equipos/);
  });
});

describe('label routes', () => {
  it('gate every endpoint with its permission and use the context company', async () => {
    const calls = [];
    const labelService = new Proxy({}, { get: (_t, name) => async (...args) => { calls.push({ name: String(name), args }); return { labelCount: 1, extension: 'zpl', contentType: 'text/plain', body: 'x' }; } });
    const requirePermission = (key) => async (c, next) => { calls.push({ key }); c.set('companyId', A); await next(); };
    const app = new Hono().route('/', createInventoryLabelRouter({ requirePermission, InventoryServiceError, labelService }));
    const json = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ companyId: B }) };
    const table = [
      ['GET', '/inventory/label-templates', 'inventory.label.read'],
      ['POST', '/inventory/label-templates', 'inventory.label.manage'],
      ['DELETE', '/inventory/label-printers/p1', 'inventory.label.manage'],
      ['POST', '/inventory/labels/render', 'inventory.label.print'],
      ['POST', '/inventory/labels/prints', 'inventory.label.print'],
      ['GET', '/inventory/items/i1/labels', 'inventory.label.read'],
    ];
    for (const [method, path, key] of table) {
      calls.length = 0;
      const res = await app.request(path, method === 'POST' ? json : { method });
      assert.ok(res.status < 300, `${method} ${path} -> ${res.status}`);
      assert.equal(calls[0].key, key);
      const service = calls.find((c) => c.name);
      if (service && path !== '/inventory/items/i1/labels') assert.equal(service.args[0], A);
    }
  });
});
