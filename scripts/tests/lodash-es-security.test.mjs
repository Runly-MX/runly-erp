import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';

let require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
let parserPath;
for (const parent of ['@excalidraw/excalidraw', '@excalidraw/mermaid-to-excalidraw', '@mermaid-js/parser', 'langium', 'chevrotain']) {
  // Some parents export ESM only; resolve their actual package metadata rather
  // than pretending they support require() or selecting another hoisted copy.
  const metadata = require.resolve.paths(parent).map(base => join(base, parent, 'package.json')).find(path => existsSync(path));
  assert.ok(metadata, `Installed dependency ${parent} must exist in its parent's resolution chain`);
  require = createRequire(realpathSync(metadata));
  if (parent === '@mermaid-js/parser') parserPath = join(dirname(realpathSync(metadata)), JSON.parse(readFileSync(metadata, 'utf8')).exports['.'].import);
}
export const lodashPath = require.resolve('lodash-es');
const lodash = await import(pathToFileURL(lodashPath));

test('Mermaid lodash rejects template import keys that are parameter expressions', () => {
  // Harmless expression: never execute shell commands or access external services.
  assert.throws(() => lodash.template('hola', { imports: { 'fixture=0': 1 } }), Error);
});

test('Mermaid lodash template ignores inherited import keys', () => {
  const imports = Object.assign(Object.create({ inheritedFixture: 'unexpected' }), { ownFixture: 'ok' });
  const render = lodash.template('<%= typeof inheritedFixture %>:<%= ownFixture %>', { imports });
  assert.equal(render({}), 'undefined:ok');
});

for (const operation of ['unset', 'omit']) {
  test(`Mermaid lodash ${operation} cannot remove a prototype property via wrapped path segments`, () => {
    const key = '__runly_transitive_security_fixture__';
    assert.equal(Object.hasOwn(Object.prototype, key), false);
    Object.defineProperty(Object.prototype, key, { configurable: true, value: 'sentinel' });
    try {
      const path = [['constructor'], ['prototype'], [key]];
      if (operation === 'unset') lodash.unset({}, path);
      else lodash.omit({}, [path]);
      assert.equal(Object.prototype[key], 'sentinel');
    } finally { delete Object.prototype[key]; }
  });
}

test('Mermaid lodash preserves ordinary collections, paths and template helpers', () => {
  assert.deepEqual(lodash.sortBy([{ name: 'b' }, { name: 'a' }], 'name'), [{ name: 'a' }, { name: 'b' }]);
  assert.deepEqual(lodash.groupBy(['aa', 'b', 'cc'], 'length'), { 1: ['b'], 2: ['aa', 'cc'] });
  const object = { nested: { remove: 1, keep: 2 } };
  assert.equal(lodash.unset(object, ['nested', 'remove']), true);
  assert.deepEqual(object, { nested: { keep: 2 } });
  assert.deepEqual(lodash.omit({ a: 1, b: 2 }, ['a']), { b: 2 });
  assert.equal(lodash.template('<%= greet(name) %>', { imports: { greet: name => `Hola ${name}` } })({ name: 'Runly' }), 'Hola Runly');
});

test('installed Mermaid parser still produces a valid diagram AST', async () => {
  const { parse } = await import(pathToFileURL(parserPath));
  const result = await parse('pie', 'pie\n "Alpha": 3\n "Beta": 5');
  assert.equal(result.$type, 'Pie');
  assert.deepEqual(result.sections.map(section => [section.label, section.value]), [['Alpha', 3], ['Beta', 5]]);
  await assert.rejects(parse('pie', 'pie\n invalid fixture'), Error);
});

test('Mermaid browser bundle resolves only the corrected lodash implementation', async () => {
  const compiler = createRequire(new URL('../../packages/module-compiler/package.json', import.meta.url));
  const { build } = compiler('esbuild');
  const bundle = await build({ entryPoints: [parserPath], bundle: true, write: false, platform: 'browser', format: 'esm', metafile: true, logLevel: 'silent' });
  assert.ok(bundle.outputFiles[0].text.length > 0);
  const inputs = Object.keys(bundle.metafile.inputs).filter(path => path.replaceAll('\\', '/').includes('/lodash-es/'));
  assert.ok(inputs.length > 0);
  assert.ok(inputs.every(path => path.includes('lodash-es@4.18.1')), 'Browser parser must resolve the corrected copy, not the vulnerable sibling');
});
