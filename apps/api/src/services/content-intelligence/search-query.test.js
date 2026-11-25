import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchQuery } from './search-query.js';
test('controlled identifier variants preserve original and bound false positives',()=>{
  const query=searchQuery('ABC120XYZ');
  assert.equal(query.normalized,'abc120xyz');
  assert.ok(query.expanded.includes('abc12oxyz'));
  assert.ok(!query.expanded.includes('a8ci2oxyz'));
  assert.equal(searchQuery('información').expanded,'informacion:*');
  assert.equal(searchQuery('ABC12').expanded,'abc12:*');
  assert.equal(searchQuery('"número de serie"').exact,'numero <-> de <-> serie');
});
