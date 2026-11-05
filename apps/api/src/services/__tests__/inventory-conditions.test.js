import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionIdsInput, conditionFilterIds, conditionFields } from '../inventory-conditions.js';
import { buildInventoryWhere } from '../inventory-query.js';
import { diffItemFields } from '../inventory-update-diff.js';

const A = '0190a000-0000-7000-8000-00000000000a';
const B = '0190a000-0000-7000-8000-00000000000b';

test('write input accepts the list, a CSV or the legacy single id', () => {
  assert.equal(conditionIdsInput({}), undefined);
  assert.deepEqual(conditionIdsInput({ conditionIds: [A, B, A] }), [A, B]);
  assert.deepEqual(conditionIdsInput({ conditionId: `${A},${B}` }), [A, B]);
  assert.deepEqual(conditionIdsInput({ conditionId: null }), []);
});

test('filter matches items holding any of the picked conditions', () => {
  assert.deepEqual(conditionFilterIds(`${A},nope,${B}`), [A, B]);
  const where = buildInventoryWhere('co', { conditionId: `${A},${B}` });
  assert.deepEqual(where.conditions, { some: { conditionId: { in: [A, B] } } });
});

test('item fields list every condition and join their names', () => {
  const item = { conditions: [{ condition: { id: A, name: 'Nuevo' } }, { condition: { id: B, name: 'Sin usar' } }] };
  assert.deepEqual(conditionFields(item).conditionIds, [A, B]);
  assert.equal(conditionFields(item).conditionName, 'Nuevo, Sin usar');
  assert.equal(conditionFields({}).conditionName, null);
});

test('update diff compares conditions as a set', () => {
  const existing = { conditions: [{ condition: { id: A, name: 'Nuevo' } }, { condition: { id: B, name: 'Sin usar' } }] };
  assert.equal(diffItemFields(existing, { conditionIds: { value: [B, A] } }).changes.length, 0);
  assert.deepEqual(diffItemFields(existing, { conditionIds: { value: [A], label: 'Nuevo' } }).patch, { conditionIds: [A] });
});
