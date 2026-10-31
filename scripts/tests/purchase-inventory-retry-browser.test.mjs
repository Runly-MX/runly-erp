// The real dialog with local API/auth doubles: no server, database or credentials.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

test('inventory creation dialog retains the operation key after network errors and a parent refresh', async () => {
  const require = createRequire(new URL('../../apps/desktop/package.json', import.meta.url))
  const { build, normalizePath } = await import(pathToFileURL(require.resolve('vite')).href)
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)
  const { default: tailwindcss } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
  const source = name => JSON.stringify(normalizePath(fileURLToPath(new URL(name, import.meta.url))))
  const fixture = `
    import { createElement, useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
    import { CreateInventoryFromLineDialog } from ${source('../../apps/desktop/src/modules/runly.purchases/components/detail/CreateInventoryFromLineDialog.jsx')};
    import ${source('../../apps/desktop/src/styles.css')};
    window.calls = []; window.dialogClosed = false;
    function Host() {
      const [line, setLine] = useState({ id: 'line', description: 'Gabinete', quantity: 2, inventoryCount: 0 });
      const [open, setOpen] = useState(true);
      window.refreshParent = () => setLine(value => ({ ...value }));
      return createElement(CreateInventoryFromLineDialog, { line, open, onOpenChange: value => { window.dialogClosed = !value; setOpen(value); } });
    }
    createRoot(document.getElementById('root')).render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Host)));
  `
  const result = await build({
    root: fileURLToPath(new URL('../../apps/desktop/', import.meta.url)), configFile: false, logLevel: 'silent',
    resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] }, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [react(), tailwindcss(), {
      name: 'purchase-inventory-dialog-fixture',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'purchase-inventory-dialog-fixture' || normalizePath(id).endsWith('/purchase-inventory-dialog-fixture')) return '\0purchase-inventory-dialog-fixture'
        if (id === '@runly/ui') return '\0purchase-dialog-ui'
        if (id.endsWith('/usePurchases.js')) return '\0purchase-dialog-mutation'
        if (id.endsWith('/AuthProvider.jsx')) return '\0purchase-dialog-auth'
        if (id.endsWith('/lib/runly.js')) return '\0purchase-dialog-api'
      },
      load(id) {
        if (id === '\0purchase-inventory-dialog-fixture') return fixture
        if (id === '\0purchase-dialog-ui') return `
          export { Button } from ${source('../../packages/ui/src/components/Button.jsx')};
          export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from ${source('../../packages/ui/src/components/Dialog.jsx')};
          export { NumberField, TextField } from ${source('../../packages/ui/src/components/FormFieldsInput.jsx')};
          export { SelectField } from ${source('../../packages/ui/src/components/FormFieldsDateSelect.jsx')};
        `
        if (id === '\0purchase-dialog-auth') return `export const useAuth = () => ({ session: { access_token: 'fixture-token' } });`
        if (id === '\0purchase-dialog-api') return `export const runly = { inventory: { listCategories: async () => ({data:[]}), listLocations: async () => ({data:[]}) } };`
        if (id === '\0purchase-dialog-mutation') return `export const errorText = (e) => e.message; export const useCreateInventoryFromLine = () => ({ isPending: false, mutateAsync: async input => { window.calls.push(input); if (window.calls.length <= 2) throw Error('Network error'); return []; } });`
      },
    }],
    build: { write: false, minify: false, lib: { entry: 'purchase-inventory-dialog-fixture', formats: ['iife'], name: 'PurchaseInventoryDialogFixture' } },
  })
  const output = Array.isArray(result) ? result[0].output : result.output
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.stack))
    await page.setContent('<!doctype html><html><head></head><body><div id="root"></div></body></html>')
    for (const asset of output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))) await page.addStyleTag({ content: String(asset.source) })
    await page.addScriptTag({ content: output.find(item => item.type === 'chunk').code })
    await page.waitForTimeout(100)
    assert.deepEqual(errors, [])
    const submit = page.getByRole('button', { name: 'Crear 2 activos', exact: true })
    await submit.waitFor().catch(error => { throw Error(`${error.message}; page errors: ${errors.join(' | ')}`) })
    assert.match(await page.getByRole('dialog').innerText(), /bienes registrados en Inventarios/)
    assert.match(await page.getByRole('dialog').innerText(), /no registra la recepción física/)
    await submit.click()
    await page.waitForFunction(() => window.calls.length === 1)
    await page.evaluate(() => window.refreshParent())
    await page.waitForTimeout(100)
    await submit.click()
    await page.waitForFunction(() => window.calls.length === 2)
    let calls = await page.evaluate(() => window.calls)
    assert.match(calls[0].idempotencyKey, /^[0-9a-f]{32}$/)
    assert.equal(calls[0].idempotencyKey, calls[1].idempotencyKey)
    await page.getByLabel('Nombre', { exact: true }).first().fill('Gabinete corregido')
    await submit.click()
    await page.waitForFunction(() => window.dialogClosed)
    calls = await page.evaluate(() => window.calls)
    assert.notEqual(calls[2].idempotencyKey, calls[0].idempotencyKey)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
