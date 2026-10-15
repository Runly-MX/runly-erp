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
