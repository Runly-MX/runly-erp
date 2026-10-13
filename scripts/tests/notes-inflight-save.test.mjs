import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const desktop = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const compiler = createRequire(new URL('../../packages/module-compiler/package.json', import.meta.url))
const { build } = compiler('esbuild')

test('Notes layout exit captures the pending save before parent passive Y.Doc teardown', { timeout: 20_000 }, async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../fixtures/notes-inflight-save.mjs', import.meta.url))],
    alias: { yjs: desktop.resolve('yjs').replace(/\.cjs$/, '.mjs') },
    plugins: [{ name: 'host-react', setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: desktop.resolve(args.path) }))
    } }],
    define: { 'process.env.NODE_ENV': '"development"' },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.abort())
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const result = await page.evaluate(() => window.runNotesInflightSave())
    assert.deepEqual(result, { lifecycle: ['captured-before-destroy'], calls: [['y', 'note-a'], ['y', 'note-a'], ['html', 'note-a', 'second']], text: 'first second', readsAfterDestroy: 0, timerFired: false, failures: [] })
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
