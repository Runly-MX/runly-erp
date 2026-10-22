import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryExportService } from '../inventory-export-service.js';

const COMPANY = '01900000-0000-7000-8000-000000000001';

function fakePrisma(items) {
  return {
    invCustomField: { findMany: async () => [{ id: 'f1', label: 'Color' }] },
    invArea: { findMany: async () => [{ id: 'a1', name: 'TI', parentId: null }, { id: 'a2', name: 'Soporte', parentId: 'a1' }] },
    invItem: { count: async () => items.length, findMany: async ({ where }) => (JSON.stringify(where).includes('"gt"') ? [] : items) },
    invDeregistrationAct: { findMany: async () => [] },
    $queryRaw: async () => [],
  };
}
const item = (over = {}) => ({
  id: 'i1', name: 'Laptop, "Pro"', assetTag: 'A-1', adminStatus: 'registered', status: 'available', areaId: 'a2', purchasePrice: '1500.5',
  category: { name: 'Cómputo' }, brand: null, location: null, condition: null, catalogModel: null, assignedTo: null, createdBy: null,
  customValues: [{ fieldId: 'f1', value: '=cmd' }], files: [], adminEvents: [], ...over,
});

test('lists catalog columns including custom fields', async () => {
  const svc = createInventoryExportService({ prisma: fakePrisma([]) });
  const catalog = await svc.columnCatalog(COMPANY);
  assert.ok(catalog.columns.find((c) => c.key === 'cf:f1'));
  assert.ok(catalog.groups.find((g) => g.key === 'custom'));
  assert.ok(catalog.columns.find((c) => c.key === 'images' && c.default));
});

test('csv escapes quotes and neutralizes formulas, keeps the area path', async () => {
  const svc = createInventoryExportService({ prisma: fakePrisma([item()]) });
  const file = await svc.exportItems(COMPANY, { format: 'csv', columns: ['name', 'area', 'purchasePrice', 'cf:f1', 'images'], ids: ['i1'] });
  const [header, row] = file.buffer.toString('utf8').replace('﻿', '').split('\r\n');
  assert.equal(header, 'Nombre,Área (carpeta),Costo de adquisición,Color,Imágenes (enlaces)');
  assert.equal(row, '"Laptop, ""Pro""",TI / Soporte,1500.5,\'=cmd,[]');
});

test('rejects empty column choice and empty results', async () => {
  const svc = createInventoryExportService({ prisma: fakePrisma([item()]) });
  await assert.rejects(svc.exportItems(COMPANY, { format: 'csv', columns: [] }), /al menos una columna/);
  const empty = createInventoryExportService({ prisma: fakePrisma([]) });
  await assert.rejects(empty.exportItems(COMPANY, { format: 'csv', columns: ['name'] }), /No hay activos/);
});

test('xlsx output is a zip workbook', async () => {
  const svc = createInventoryExportService({ prisma: fakePrisma([item()]) });
  const file = await svc.exportItems(COMPANY, { format: 'xlsx', columns: ['name', 'images'], ids: ['i1'] });
  assert.equal(file.buffer.subarray(0, 2).toString(), 'PK');
  assert.match(file.filename, /^inventario-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
