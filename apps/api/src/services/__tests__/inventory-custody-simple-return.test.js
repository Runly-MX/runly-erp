import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertSimpleReturnKind, normalizeCustodyInput } from '../inventory-custody-helpers.js';

const EMPLOYEE = '01a1a2fb-174e-746f-97ff-eaffe81702e4';

test('formal flag is optional and must be boolean', () => {
  assert.equal(normalizeCustodyInput({ employeeId: EMPLOYEE, itemIds: [] }).formal, undefined);
  assert.equal(normalizeCustodyInput({ employeeId: EMPLOYEE, itemIds: [], formal: false }).formal, false);
  assert.throws(() => normalizeCustodyInput({ employeeId: EMPLOYEE, itemIds: [], formal: 'no' }), /formato/);
});

test('only returns can skip the formal document', () => {
  assert.doesNotThrow(() => assertSimpleReturnKind('RETURN', false));
  assert.doesNotThrow(() => assertSimpleReturnKind('DELIVERY', true));
  assert.throws(() => assertSimpleReturnKind('DELIVERY', false), /Solo las devoluciones/);
});
