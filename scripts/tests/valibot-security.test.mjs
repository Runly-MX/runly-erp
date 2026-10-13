import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';

const root = createRequire(new URL('../../package.json', import.meta.url));
const prisma = createRequire(realpathSync(root.resolve('prisma/package.json')));
const dev = createRequire(prisma.resolve('@prisma/dev'));
const v = dev('valibot');

test('record error flattening handles inherited names as own arrays without changing prototypes', () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype);
  for (const key of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString']) {
    const result = v.safeParse(v.record(v.string(), v.number()), JSON.parse(`{"${key}":"invalid"}`));
    assert.equal(result.success, false);
    const flat = v.flatten(result.issues);
    assert.ok(Object.hasOwn(flat.nested, key));
    assert.ok(Array.isArray(flat.nested[key]));
    assert.equal(flat.nested[key].length, 1);
  }
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), before);
});
test('ordinary schemas, transformations and error paths remain valid', () => {
  const schema = v.object({ name: v.pipe(v.string(), v.trim(), v.minLength(1)), count: v.pipe(v.number(), v.integer(), v.minValue(1)) });
  assert.deepEqual(v.parse(schema, { name: ' Runly ', count: 2 }), { name: 'Runly', count: 2 });
  const result = v.safeParse(schema, { name: '', count: 0 });
  assert.equal(result.success, false);
  assert.deepEqual(Object.keys(v.flatten(result.issues).nested).sort(), ['count', 'name']);
  assert.equal(typeof dev('@prisma/dev').startPrismaDevServer, 'function');
});
