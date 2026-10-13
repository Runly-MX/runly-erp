import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const desktop = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
const compiler = createRequire(new URL('../../packages/module-compiler/package.json', import.meta.url))
const { build } = compiler('esbuild')

test('Notes flush callback follows React commits rather than speculative renders', { timeout: 30_000 }, async t => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../fixtures/notes-committed-ref.mjs', import.meta.url))],
    plugins: [{ name: 'host-react', setup(builder) {
      builder.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, args => ({ path: desktop.resolve(args.path) }))
    } }],
    define: { 'process.env.NODE_ENV': '"development"' },
    bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'silent',
  })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.abort())
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    for (const scenario of ['committed', 'suspended', 'keys', 'strict', 'async']) {
      await t.test(scenario, async () => {
        const result = await page.evaluate(name => window.runNotesCommittedRef(name), scenario)
        const expected = scenario === 'keys'
          ? [{ id: 'note-a', label: 'committed-a' }, { id: 'note-b', label: 'committed-b' }]
          : scenario === 'suspended' || scenario === 'strict'
            ? [{ id: 'note-a', label: 'committed-a' }]
            : Array.from({ length: scenario === 'async' ? 2 : 1 }, () => ({ id: 'note-a', label: 'committed-b' }))
        assert.deepEqual(result.calls, expected)
        assert.equal(result.timerFired, false, 'Unmount must cancel debounce')
        assert.equal(result.suspendedRenderObserved, scenario === 'suspended' || scenario === 'strict')
        assert.deepEqual(errors, [])
      })
    }
  } finally { await browser.close() }
})
