import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { contrastScan } from '../purchases/validation-stack.mjs'

test('shared enabled date fields meet AA in light and dark, idle, hovered and focused', async () => {
  const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
  const { build, normalizePath } = await import(pathToFileURL(require.resolve('vite')).href)
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)
  const { default: tailwindcss } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
  const source = path => JSON.stringify(normalizePath(fileURLToPath(new URL(path, import.meta.url))))
  const fixture = `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import { DateField, DateTimeField } from ${source('../../packages/ui/src/components/FormFieldsDateSelect.jsx')};
    import { DatePickerField } from ${source('../../packages/ui/src/components/DatePickerField.jsx')};
    import ${source('../../apps/desktop/src/styles.css')};
    const fields = [[DateField, 'Fecha'], [DateTimeField, 'Fecha y hora'], [DatePickerField, 'Selector'], [DatePickerField, 'Compacto', { compact: true }]];
    createRoot(document.getElementById('root')).render(createElement('div', { className: 'space-y-4 bg-card p-6' },
      ...fields.map(([Component, label, extra = {}]) => createElement(Component, { key: label, label, value: '', disabled: false, ...extra }))));
  `
  const result = await build({
    root: fileURLToPath(new URL('../../apps/desktop/', import.meta.url)), configFile: false, logLevel: 'silent',
    resolve: { dedupe: ['react', 'react-dom'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [react(), tailwindcss(), {
      name: 'date-contrast-fixture',
      resolveId(id) { if (id === 'date-contrast-fixture' || normalizePath(id).endsWith('/date-contrast-fixture')) return '\0date-contrast-fixture' },
      load(id) { if (id === '\0date-contrast-fixture') return fixture },
    }],
    build: { write: false, minify: false, lib: { entry: 'date-contrast-fixture', formats: ['iife'], name: 'DateContrastFixture' } },
  })
  const output = Array.isArray(result) ? result[0].output : result.output
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
    page.on('pageerror', error => console.error(error.message))
    await page.setContent('<!doctype html><html><head></head><body><main id="root"></main></body></html>')
    for (const asset of output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))) await page.addStyleTag({ content: String(asset.source) })
    await page.addScriptTag({ content: output.find(item => item.type === 'chunk').code })
    await page.getByLabel('Fecha', { exact: true }).waitFor()
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark)
      await page.waitForTimeout(250)
      for (const label of ['Fecha', 'Fecha y hora', 'Selector', 'Compacto']) {
        const control = page.getByLabel(label, { exact: true })
        assert.equal(await control.isEnabled(), true)
        for (const state of ['idle', 'hover', 'focus']) {
          await page.mouse.move(0, 0)
          await control.evaluate(el => el.blur())
          if (state === 'hover') await control.hover()
          if (state === 'focus') await control.focus()
          const scan = await page.evaluate(contrastScan)
          assert.deepEqual(scan.failures, [], `${dark ? 'dark' : 'light'} ${label} ${state}: ${scan.failures.join(' | ')}`)
        }
      }
    }
  } finally { await browser.close() }
})
