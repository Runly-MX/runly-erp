import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const api = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const desktop = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const flat = () => ({ version: 3, sources: ['fixture.js'], sourcesContent: ['hola'], names: [], mappings: 'AAAA' });
const indexed = (line, column = 0, map = flat()) => ({ version: 3, sections: [{ offset: { line, column }, map }] });

for (const [parent, require] of [['@tailwindcss/node', api], ['postcss', desktop]]) {
  const path = require.resolve('source-map-js', { paths: [dirname(require.resolve(parent))] });
  const { SourceMapConsumer, SourceMapGenerator } = require(path);
  test(`${parent}: indexed offsets reject non-integers and excessive line values`, () => {
    for (const field of ['line', 'column']) {
      for (const value of [-1, 0.5, Infinity, NaN, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
        const map = indexed(0);
        map.sections[0].offset[field] = value;
        assert.throws(() => new SourceMapConsumer(map), Error, `${field} must reject ${String(value)}`);
      }
    }
    // Constructor only: never serialize an enormous map on the vulnerable baseline.
    assert.throws(() => new SourceMapConsumer(indexed(10_000_001)), Error);
  });
  test(`${parent}: nested section offsets cannot bypass the total line bound`, () => {
    assert.throws(() => new SourceMapConsumer(indexed(6_000_000, 0, indexed(6_000_000))), Error);
  });
  test(`${parent}: ordinary mappings and indexed offsets preserve roundtrip contracts`, () => {
    const generator = new SourceMapGenerator({ file: 'output.js' });
    generator.addMapping({ generated: { line: 2, column: 3 }, original: { line: 7, column: 2 }, source: 'fixture.js' });
    generator.setSourceContent('fixture.js', 'hola');
    const consumer = new SourceMapConsumer(generator.toJSON());
    assert.deepEqual(consumer.originalPositionFor({ line: 2, column: 3 }), { source: 'fixture.js', line: 7, column: 2, name: null });
    assert.equal(SourceMapGenerator.fromSourceMap(consumer).toJSON().mappings, generator.toJSON().mappings);
    const nested = new SourceMapConsumer(indexed(3, 0, indexed(4)));
    const lines = [];
    nested.eachMapping(mapping => lines.push(mapping.generatedLine));
    assert.deepEqual(lines, [8]);
  });
}

test('PostCSS emits a usable external source map for ordinary CSS', async () => {
  const postcss = desktop('postcss');
  const result = await postcss([]).process('a { color: red }', { from: 'fixture.css', to: 'output.css', map: { inline: false, annotation: false } });
  const { SourceMapConsumer } = desktop(desktop.resolve('source-map-js', { paths: [dirname(desktop.resolve('postcss'))] }));
  const position = new SourceMapConsumer(result.map.toJSON()).originalPositionFor({ line: 1, column: 0 });
  assert.equal(position.source, 'fixture.css');
  assert.equal(position.line, 1);
  assert.equal(result.css, 'a { color: red }');
});
