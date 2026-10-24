import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build, normalizePath } from '../../apps/desktop/node_modules/vite/dist/node/index.js'
import { chromium } from 'playwright'

test('notes preserve word boundaries through HTML restoration and IME commits', async () => {
  const desktop = fileURLToPath(new URL('../../apps/desktop/', import.meta.url))
  const source = name => JSON.stringify(normalizePath(fileURLToPath(new URL(name, import.meta.url))))
  const fixture = `
    import { Editor } from ${source('../../apps/desktop/node_modules/@tiptap/core/dist/index.js')};
    import StarterKit from ${source('../../apps/desktop/node_modules/@tiptap/starter-kit/dist/index.js')};
    import { NOTE_HTML_PARSE_OPTIONS, noteTextInputAttributes } from ${source('../../apps/desktop/src/modules/runly.notes/lib/noteTextInput.js')};
    function create(parseOptions) {
      const host = document.createElement('div'); document.body.appendChild(host);
      return new Editor({ element: host, extensions: [StarterKit], content: '<p>hola </p>',
        parseOptions, editorProps: { attributes: noteTextInputAttributes('android') } });
    }
    function restore(parseOptions, seed) {
      const editor = create(parseOptions);
      if (seed) editor.commands.setContent('<p>hola </p>', { parseOptions });
      const before = editor.getText();
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'mundo');
      const after = editor.getText(); editor.destroy();
      return { before, after };
    }
    window.spacingCases = () => ({
      oldInitial: restore({}, false), oldSeed: restore({}, true),
      initial: restore(NOTE_HTML_PARSE_OPTIONS, false), seed: restore(NOTE_HTML_PARSE_OPTIONS, true),
    });
    window.startSpacingEditor = () => {
      window.spacingEditor = create(NOTE_HTML_PARSE_OPTIONS);
      spacingEditor.commands.setContent('<p></p>', { parseOptions: NOTE_HTML_PARSE_OPTIONS });
      spacingEditor.commands.focus('end');
      return { autocorrect: spacingEditor.view.dom.getAttribute('autocorrect'),
        inputmode: spacingEditor.view.dom.getAttribute('inputmode'),
        autocomplete: spacingEditor.view.dom.getAttribute('autocomplete') };
    };
  `
  const result = await build({
    root: desktop, configFile: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [{ name: 'notes-spacing-fixture',
      resolveId(id) { if (id === 'notes-spacing-fixture' || normalizePath(id).endsWith('/notes-spacing-fixture')) return '\0notes-spacing-fixture' },
      load(id) { if (id === '\0notes-spacing-fixture') return fixture },
    }],
    build: { write: false, minify: false,
      lib: { entry: 'notes-spacing-fixture', formats: ['iife'], name: 'NotesSpacingFixture' } },
  })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    const output = Array.isArray(result) ? result[0].output : result.output
    await page.addScriptTag({ content: output.find(chunk => chunk.type === 'chunk').code })
    const cases = await page.evaluate(() => window.spacingCases())
    assert.deepEqual(cases.oldInitial, { before: 'hola', after: 'holamundo' })
    assert.deepEqual(cases.oldSeed, { before: 'hola', after: 'holamundo' })
    assert.deepEqual(cases.initial, { before: 'hola ', after: 'hola mundo' })
    assert.deepEqual(cases.seed, { before: 'hola ', after: 'hola mundo' })

    assert.deepEqual(await page.evaluate(() => window.startSpacingEditor()), {
      autocorrect: 'on', inputmode: 'text', autocomplete: 'on',
    })
    // TipTap schedules focus/selection on animation frames. Start the IME only
    // after that selection settles, as it does for a real focused text field.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const cdp = await page.context().newCDPSession(page)
    let expected = ''
    for (const text of ['hola ', 'mundo']) {
      await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
      await cdp.send('Input.insertText', { text })
      expected += text
      await page.waitForFunction(value => window.spacingEditor.getText() === value && !window.spacingEditor.view.composing, expected)
    }
    assert.equal(await page.evaluate(() => window.spacingEditor.getText()), 'hola mundo')
  } finally {
    await browser.close()
  }
})
