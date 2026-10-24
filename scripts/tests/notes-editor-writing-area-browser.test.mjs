import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

test('notes handwriting surface fills short paper and still grows with long content', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 } })
    const css = await readFile(new URL('../../packages/ui/src/runtime.css', import.meta.url), 'utf8')
    // EditorProvider places EditorContent's div between NoteSheet and .tiptap.
    await page.setContent(`<!doctype html><style>body{margin:0}#scroll{height:700px;overflow:auto}
      .note-sheet,.tiptap{min-height:100%}</style><div id="scroll">
      <div class="note-sheet"><div class="note-editor-surface">
      <div class="tiptap" contenteditable="true"><p>Diagnóstico</p><p>Texto de prueba</p></div>
      </div></div></div>`)
    await page.addStyleTag({ content: css })
    const measure = () => page.evaluate(() => {
      const paper = document.querySelector('.note-sheet').getBoundingClientRect()
      const editor = document.querySelector('.tiptap').getBoundingClientRect()
      return { paperHeight: paper.height, editorHeight: editor.height,
        writable: document.elementFromPoint(200, 500).isContentEditable }
    })
    const before = await measure()
    assert.ok(before.editorHeight < before.paperHeight / 2)
    assert.equal(before.writable, false)
    await page.locator('.note-sheet').evaluate(e => e.dataset.fillEditor = 'true')
    for (const zoom of [1, 0.75, 1.5]) {
      await page.locator('.note-sheet').evaluate((e, value) => e.style.zoom = value, zoom)
      const after = await measure()
      assert.ok(Math.abs(after.editorHeight - after.paperHeight) < 1, `zoom ${zoom}`)
      if (zoom === 1) assert.equal(after.writable, true)
    }
    await page.locator('.note-sheet').evaluate(e => e.style.zoom = '1')
    await page.locator('.tiptap').evaluate(e => e.innerHTML = '<p>Texto de prueba</p>'.repeat(80))
    const long = await measure()
    assert.ok(long.editorHeight > 700)
    assert.ok(Math.abs(long.editorHeight - long.paperHeight) < 1)
  } finally {
    await browser.close()
  }
})
