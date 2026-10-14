import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCfdiUuid, purchaseFileLabel } from '../legacy-import/cfdi.js';
import { matchEmployee, splitFullName, nameKey } from '../legacy-import/people-and-suppliers.js';
import { normalizeItemStatus, buildAdminEvents } from '../legacy-import/inventory-historical.js';
import { assertImportStatus, caseStatusFor } from '../legacy-import/purchases-historical.js';
import { normalizeCustodyImport, signatureBuffer, mergeLegacySnapshot } from '../legacy-import/custody-historical.js';
import { createLegacyRefs } from '../legacy-import/legacy-refs.js';
import { dateKey } from '../purchases-shared.js';

// Synthetic CFDI 4.0 (fake RFCs and amounts, made-up UUID).
const CFDI = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="LEG" Folio="100" Total="116.00">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="PROVEEDOR DE PRUEBA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="EMPRESA DE PRUEBA" UsoCFDI="G03"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" SelloCFD="abc"
      UUID="1a2b3c4d-0000-4000-8000-0123456789ab" FechaTimbrado="2024-03-01T10:00:00" RfcProvCertif="SAT970701NN3"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

test('extractCfdiUuid reads the timbre UUID from a CFDI 4.0', () => {
  assert.equal(extractCfdiUuid(Buffer.from(CFDI)), '1A2B3C4D-0000-4000-8000-0123456789AB');
  assert.equal(extractCfdiUuid(CFDI.replace('tfd:TimbreFiscalDigital', 'TimbreFiscalDigital')), '1A2B3C4D-0000-4000-8000-0123456789AB');
  assert.equal(extractCfdiUuid('<cfdi:Comprobante UUID="1a2b3c4d-0000-4000-8000-0123456789ab"/>'), null);
  assert.equal(extractCfdiUuid(null), null);
  assert.equal(purchaseFileLabel('factura.XML', 'text/xml'), 'xml');
  assert.equal(purchaseFileLabel('factura.pdf', 'application/octet-stream'), 'pdf');
});

test('matchEmployee prefers code, then e-mail, then exact full name', () => {
  const rows = [
    { id: 'a', employeeCode: 'E-1', firstName: 'Ana', lastName: 'Ruiz', workEmail: 'other@example.com' },
    { id: 'b', employeeCode: null, firstName: 'Luis', lastName: 'Paz', workEmail: 'ana@example.com' },
    { id: 'c', employeeCode: null, firstName: 'Ana', lastName: 'Ruiz', personalEmail: 'ana.p@example.com' },
  ];
  assert.deepEqual(matchEmployee(rows, { employeeNumber: 'E-1', email: 'ana@example.com' }), { employee: rows[0], matchedBy: 'employeeCode', ambiguous: false });
  assert.equal(matchEmployee(rows, { employeeNumber: 'E-9', email: 'ANA@example.com' }).employee.id, 'b');
  assert.equal(matchEmployee(rows, { email: 'ana.p@example.com' }).employee.id, 'c');
  const byName = matchEmployee(rows, { firstName: ' ana ', lastName: 'RUIZ' });
  assert.equal(byName.matchedBy, 'fullName');
  assert.equal(byName.ambiguous, true);
  assert.equal(matchEmployee(rows, { firstName: 'Ána', lastName: 'Ruiz' }), null);
  assert.deepEqual(splitFullName('Juan Carlos Pérez López'), { firstName: 'Juan Carlos', lastName: 'Pérez López' });
  assert.equal(nameKey('  Proveeduría  S.A. '), nameKey('PROVEEDURIA s.a.'));
});

test('item status guards reject inconsistent legacy data', () => {
  assert.throws(() => normalizeItemStatus({ adminStatus: 'lost' }), /no válido/);
  assert.throws(() => normalizeItemStatus({ status: 'assigned' }), /importAssignment/);
  assert.throws(() => normalizeItemStatus({ adminStatus: 'deregistered' }), /fecha de baja/);
  assert.throws(() => normalizeItemStatus({ adminStatus: 'registered', deregisteredAt: '2025-01-01' }), /Solo un activo/);
  assert.throws(() => normalizeItemStatus({ adminStatus: 'registration_pending', registeredAt: '2024-01-01' }), /pendiente/);
  assert.throws(() => normalizeItemStatus({ adminStatus: 'deregistered', registeredAt: '2025-02-01', deregisteredAt: '2025-01-01' }), /anterior/);
  const baja = normalizeItemStatus({ adminStatus: 'deregistered', status: 'maintenance', registeredAt: '2024-01-10', deregisteredAt: '2025-06-30' });
  assert.equal(baja.status, 'available');
  assert.equal(baja.deregistrationReason, 'other');
  const events = buildAdminEvents(baja, { source: 'e2e' });
  assert.deepEqual(events.map((e) => [e.toStatus, dateKey(e.effectiveDate)]), [['registered', '2024-01-10'], ['deregistered', '2025-06-30']]);
  assert.equal(buildAdminEvents(normalizeItemStatus({ adminStatus: 'registration_pending' }), { source: 'e2e' })[0].toStatus, 'registration_pending');
});

test('purchase and custody status guards', () => {
  assert.equal(assertImportStatus('orders', 'closed'), 'CLOSED');
  assert.throws(() => assertImportStatus('orders', 'DRAFT'), /no importable/);
  assert.throws(() => assertImportStatus('invoices', 'CLOSED'), /no importable/);
  assert.equal(caseStatusFor('PAID'), 'CLOSED');
  assert.equal(caseStatusFor('ISSUED'), 'IN_PROGRESS');
  const base = { status: 'COMPLETED', date: '2024-05-02', employeeId: 'e', items: [{ itemId: 'i' }] };
  assert.equal(normalizeCustodyImport(base).kind, 'DELIVERY');
  assert.throws(() => normalizeCustodyImport({ ...base, status: 'PENDING_SIGNATURE' }), /no importable/);
  assert.throws(() => normalizeCustodyImport({ ...base, status: 'DRAFT', applyAssignments: true }), /completado/);
  assert.throws(() => normalizeCustodyImport({ ...base, items: [{ itemId: 'i' }, { itemId: 'i' }] }), /repite/);
  assert.throws(() => signatureBuffer('aGVsbG8='), /PNG/);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  assert.deepEqual(signatureBuffer(`data:image/png;base64,${png.toString('base64')}`), png);
  const snap = mergeLegacySnapshot({ assetTag: 'T-1', serialNumber: 'S', brand: { name: 'Marca' } }, { serialNumber: 'S-LEGACY' });
  assert.equal(snap.serialNumber, 'S-LEGACY');
  assert.equal(snap.assetTag, 'T-1');
});

function fakePrisma() {
  const rows = [];
  const keyOf = (w) => w.companyId_source_entity_legacyId;
  const same = (a, b) => a.companyId === b.companyId && a.source === b.source && a.entity === b.entity && a.legacyId === b.legacyId;
  const legacyRef = {
    findUnique: async ({ where }) => rows.find((row) => same(row, keyOf(where))) ?? null,
    create: async ({ data }) => {
      if (rows.some((row) => same(row, data))) throw Object.assign(new Error('unique'), { code: 'P2002' });
      rows.push(data);
      return data;
    },
  };
  return { rows, legacyRef, $transaction: async (fn) => fn({ legacyRef }) };
}

test('ensure is idempotent and records the reference with the row', async () => {
  const prisma = fakePrisma();
  const refs = createLegacyRefs({ prisma }).bind('company-1', 'e2e');
  let calls = 0;
  const create = async () => { calls += 1; return `target-${calls}`; };
  const first = await refs.ensure('inv_item', 42, create);
  const second = await refs.ensure('inv_item', '42', create);
  assert.deepEqual(first, { id: 'target-1', created: true });
  assert.deepEqual(second, { id: 'target-1', created: false });
  assert.equal(calls, 1);
  assert.equal(prisma.rows.length, 1);
  await assert.rejects(() => refs.ensure('inv_item', '', create), /identificador legado/);
  let cleaned = 0;
  await assert.rejects(() => refs.ensure('inv_item', 7, async () => { throw new Error('boom'); }, { prepare: async () => 'up', cleanup: async () => { cleaned += 1; } }), /boom/);
  assert.equal(cleaned, 1);
  assert.equal(prisma.rows.length, 1);
});
