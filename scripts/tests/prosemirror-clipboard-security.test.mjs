import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const desktop = createRequire(new URL('../../apps/desktop/package.json', import.meta.url));
const compiler = createRequire(new URL('../../packages/module-compiler/package.json', import.meta.url));
const { build } = compiler('esbuild');

test('Tiptap ProseMirror clipboard validates context attributes and retains ordinary editing in Chrome', { timeout: 30_000 }, async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../fixtures/security/prosemirror-clipboard.mjs', import.meta.url))],
    alias: Object.fromEntries(['model', 'state', 'view'].map(name => [`@tiptap/pm/${name}`, desktop.resolve(`@tiptap/pm/${name}`).replace(/\.cjs$/, '.js')])),
    plugins: [{ name: 'fixture-core-resolution', setup(builder) { builder.onResolve({ filter: /^@tiptap\/core$/ }, () => ({ path: desktop.resolve('@tiptap/core').replace(/\.cjs$/, '.js') })); } }],
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent', metafile: true,
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(() => window.runClipboardFixture());
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(result.valid.captured, ['valid context']);
    assert.equal(result.valid.text, 'Fixture');
    assert.equal(result.ordinary.text, 'Hola Runly');
    assert.ok(JSON.stringify(result.ordinary.doc).includes('"type":"strong"'));
    assert.deepEqual(result.edit, { text: 'Edicion!', roundtrip: true });
    const notes = await page.evaluate(() => window.runNotesEditorFixture());
    assert.deepEqual(notes, { pasted: true, formatted: true, tableInserted: true, undoRemovedTable: true, redoRestoredTable: true, roundtrip: true });
    for (const item of result.invalid) {
      assert.deepEqual(item.captured, [], 'Invalid clipboard context must be discarded before transaction application');
      assert.equal(item.text, 'Fixture');
    }
    assert.deepEqual(pageErrors, []);
  } finally { await browser.close(); }
});
