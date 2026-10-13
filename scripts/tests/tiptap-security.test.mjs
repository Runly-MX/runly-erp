import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const corePath = require.resolve('@tiptap/core');
const core = require(corePath);

test('Tiptap mergeAttributes does not inherit JSON-origin prototype attributes', () => {
  const input = JSON.parse('{"__proto__":{"onerror":"void 0","data-fixture":"unexpected"}}');
  const result = core.mergeAttributes({ title: 'fixture' }, input);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.onerror, undefined);
  assert.equal(result['data-fixture'], undefined);
  assert.equal(result.title, 'fixture');
  assert.equal(Object.hasOwn(Object.prototype, 'onerror'), false);
});

test('Tiptap ordinary attributes and Markdown tokenizer contracts remain valid', () => {
  const result = core.mergeAttributes({ class: 'one', style: 'color: red', title: 'old' }, { class: 'two', style: 'font-weight: bold', title: 'new' });
  assert.equal(result.class, 'one two');
  assert.equal(result.title, 'new');
  assert.ok(result.style.includes('color: red') && result.style.includes('font-weight: bold'));
  const block = core.createAtomBlockMarkdownSpec({ nodeName: 'fixture' }).markdownTokenizer.tokenize(':::fixture {#box .round title="Hola"} :::\n', [], {});
  const inline = core.createInlineMarkdownSpec({ nodeName: 'fixture', selfClosing: true }).markdownTokenizer.tokenize('[fixture title="Hola"]', [], {});
  assert.equal(block.attributes.title, 'Hola');
  assert.equal(block.attributes.id, 'box');
  assert.equal(inline.attributes.title, 'Hola');
});

for (const mode of ['block', 'inline']) {
  test(`Tiptap ${mode} Markdown attributes finish within an isolated process budget`, () => {
    const input = mode === 'block' ? ':::fixture {' + '__QUOTED_0'.repeat(8192) + '__QUOTED_0__} :::\n' : '[fixture ' + '0'.repeat(131072) + ']';
    const code = `const c=require(process.argv[1]);const mode=process.argv[2];const spec=mode==='block'?c.createAtomBlockMarkdownSpec({nodeName:'fixture'}):c.createInlineMarkdownSpec({nodeName:'fixture',selfClosing:true});const token=spec.markdownTokenizer.tokenize(require('node:fs').readFileSync(0,'utf8'),[],{});if(!token)process.exit(2);`;
    const child = spawnSync(process.execPath, ['-e', code, corePath, mode], { input, timeout: 3000, encoding: 'utf8', windowsHide: true });
    assert.ok(!child.error, 'Tokenizer must complete inside the broad three-second process budget');
    assert.equal(child.status, 0, child.stderr);
  });
}
