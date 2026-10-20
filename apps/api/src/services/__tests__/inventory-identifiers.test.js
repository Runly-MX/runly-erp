import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoActiveDuplicates, findActiveDuplicates, cleanIdentifier } from '../inventory-identifiers.js';

// Fake delegate: only ENABLED rows are returned, as the real query filters on enabled: true.
function db(rows) {
  return {
    invItem: {
      findFirst: async ({ where }) => {
        const [field] = Object.keys(where).filter((k) => k === 'serialNumber' || k === 'assetTag');
        const wanted = where[field].equals.toLowerCase();
        return rows.find((r) => r.enabled === where.enabled && r.id !== where.id?.not && String(r[field] ?? '').toLowerCase() === wanted) ?? null;
      },
    },
  };
}
const rows = [
  { id: 'a', name: 'Laptop', assetTag: 'ACT-1', serialNumber: 'SN-1', enabled: true },
  { id: 'b', name: 'Vieja', assetTag: 'ACT-2', serialNumber: 'SN-2', enabled: false },
];

test('cleanIdentifier trims and turns blanks into null', () => {
  assert.equal(cleanIdentifier('  SN-1 '), 'SN-1');
  assert.equal(cleanIdentifier('   '), null);
});

test('active items conflict, ignoring case; disabled ones never do', async () => {
  const found = await findActiveDuplicates(db(rows), 'c', { serialNumber: ' sn-1 ', assetTag: 'act-2' });
  assert.equal(found.serialNumber.id, 'a');
  assert.equal(found.assetTag, null);
});

test('assertNoActiveDuplicates throws 409 with the existing item, excluding itself', async () => {
  await assert.rejects(assertNoActiveDuplicates(db(rows), 'c', { serialNumber: 'SN-1' }), (e) => e.status === 409 && e.code === 'SERIAL_EXISTS' && e.details.item.id === 'a');
  await assert.rejects(assertNoActiveDuplicates(db(rows), 'c', { assetTag: 'ACT-1' }), (e) => e.code === 'ASSET_TAG_EXISTS');
  await assertNoActiveDuplicates(db(rows), 'c', { serialNumber: 'SN-1', excludeId: 'a' });
  await assertNoActiveDuplicates(db(rows), 'c', { serialNumber: 'SN-2' });
  await assertNoActiveDuplicates(db(rows), 'c', { serialNumber: '', assetTag: null });
});

test('duplicates outside the caller scope are reported without their data', async () => {
  const { findActiveDuplicates, assertNoActiveDuplicates } = await import('../inventory-identifiers.js');
  const db = { invItem: { findFirst: async () => ({ id: 'i1', name: 'Secreto', assetTag: 'T1', serialNumber: 'S1', areaId: 'area-b' }) } };
  const limited = { all: false, roles: new Map([['area-a', 'viewer']]) };
  const found = await findActiveDuplicates(db, 'co', { serialNumber: 'S1', scope: limited });
  assert.deepEqual(found.serialNumber, { restricted: true });
  const visible = await findActiveDuplicates(db, 'co', { serialNumber: 'S1', scope: { all: false, roles: new Map([['area-b', 'viewer']]) } });
  assert.equal(visible.serialNumber.name, 'Secreto');
  assert.equal('areaId' in visible.serialNumber, false);
  await assert.rejects(assertNoActiveDuplicates(db, 'co', { serialNumber: 'S1', scope: limited }), (e) => e.status === 409 && e.details.item.restricted === true && !JSON.stringify(e.details).includes('Secreto'));
});
