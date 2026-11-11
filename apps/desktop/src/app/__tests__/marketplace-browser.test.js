import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

test('integrated Marketplace isolates feeds, opens the real import dialog and asks before changing resources', { timeout: 60000 }, async () => {
  const require = createRequire(new URL('../../../package.json', import.meta.url))
  const { build } = createRequire(new URL('../../../../../packages/module-compiler/package.json', import.meta.url))('esbuild')
  const { chromium } = require('playwright')
  const fixture = { resourceKey: 'studio.example-template', type: 'studio_template', title: 'Plantilla de prueba', description: 'Recurso sintético para probar la interfaz.', version: '1.0.0', releaseId: '11111111-1111-4111-8111-111111111111', publisher: { handle: 'example', displayName: 'Example Publisher' }, license: 'CC-BY-4.0', eligible: true, trust: 'resource', availability: 'available', compatibility: { runly: { min: '0.1.0' } } }
  const data = { catalog: { verified: true, installable: true, freshness: 'fresh', sequence: 1 }, items: [fixture] }
  const automationData = { ...data, items: [{ ...fixture, type: 'automation', resourceKey: 'automation.example', title: 'Automatización de prueba' }] }
  const source = { mode: 'runly', resourcesUrl: 'https://mirror.example.test/index.json', effective: { resourcesUrl: 'https://mirror.example.test/index.json' }, defaults: { officialUrl: 'https://catalog.example.test/official', communityUrl: 'https://catalog.example.test/community', resourcesUrl: 'https://catalog.example.test/resources/index.json' }, managedKeys: [], trust: [], policy: { allowCachedView: true, maxCacheAgeDays: 30, installFreshHours: 24, installMaxAgeHours: 72 } }
  const calls = [], saves = []
  const bundle = await build({ stdin: { contents: `
    import {createRoot} from 'react-dom/client';
    import {MemoryRouter} from 'react-router-dom';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import MarketplaceScreen from './src/app/MarketplaceScreen.jsx';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><MarketplaceScreen/></MemoryRouter></QueryClientProvider>);
  `, resolveDir: fileURLToPath(new URL('../../../', import.meta.url)), loader: 'jsx' }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, loader: { '.css': 'empty', '.svg': 'dataurl' }, plugins: [{ name: 'fixture-identity-and-api', setup(build) {
    build.onResolve({ filter: /AuthProvider(?:\.jsx)?$/ }, () => ({ path: 'auth', namespace: 'fixture' }))
    build.onResolve({ filter: /useRuntimeModules(?:\.js)?$/ }, () => ({ path: 'modules', namespace: 'fixture' }))
    build.onResolve({ filter: /\/lib\/runly(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'auth' ? `export const useAuth=()=>({session:{access_token:'fixture-token'},profileCompanyId:'example-company',userProfile:{id:'example-user',isAdmin:!location.pathname.includes('limited'),permissions:['studio.view']}});`
      : args.path === 'modules' ? `export const useRuntimeModules=()=>({availableModules:[{key:'runly.studio'},{key:'runly.automations'}]});`
      : `import {createRunlyClient} from ${JSON.stringify(fileURLToPath(new URL('../../../../../packages/sdk/src/index.js', import.meta.url)))};export const runly=createRunlyClient({baseUrl:location.origin+'/api',getActiveCompanyId:()=> 'example-company'});`, resolveDir: fileURLToPath(new URL('../../../', import.meta.url)) }))
    build.onResolve({ filter: /^(react|react-dom|@tanstack\/react-query)(\/.*)?$/ }, args => ({ path: require.resolve(args.path) }))
  } }] })
  const server = createServer(async (req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); return }
    if (!req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="es"><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'); return }
    calls.push([req.method, req.url]); res.setHeader('Content-Type', 'application/json')
    let out
    if (req.url === '/api/module-catalog/v2/source') {
      if (req.method === 'PUT') { const chunks = []; for await (const chunk of req) chunks.push(chunk); saves.push(JSON.parse(Buffer.concat(chunks))) }
      out = source
    } else if (req.url === '/api/module-catalog/v2') out = { enabled: true, status: 'not_published', modules: [], catalogs: { official: { configured: true, error: 'catalog_not_published', diagnostic: { httpStatus: 404 } } } }
    else if (req.url.includes('type=website_template')) out = { ...data, items: [{ ...fixture, type: 'website_template', resourceKey: 'website.example', title: 'Website de prueba' }] }
    else if (req.url.includes('type=automation') || req.url.includes('/automations/marketplace/resources')) out = automationData
    else if (req.url.includes('type=solution')) out = { ...data, items: [] }
    else out = data
    res.end(JSON.stringify({ data: out }))
  })
  let browser
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage(); page.setDefaultTimeout(8000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const origin = `http://127.0.0.1:${server.address().port}`
    await page.goto(origin)
    await page.getByText('Feeds de módulos no disponibles en el origen', { exact: true }).waitFor()
    await page.getByRole('radio', { name: 'Plantillas Studio', exact: true }).click()
    await page.getByText('Plantilla de prueba', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Importar copia editable' }).click()
    await page.getByRole('dialog').waitFor()
    assert.equal(await page.getByRole('radio', { name: /Desde Marketplace/ }).getAttribute('aria-checked'), 'true')
    assert.ok(await page.getByRole('button', { name: 'Revisar', exact: true }).isEnabled())
    assert.equal(calls.some(([method]) => method === 'POST'), false, 'opening a card never creates or prepares anything')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('radio', { name: 'Website', exact: true }).click()
    await page.getByText('Website de prueba', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /Importar|Instalar/ }).count(), 0)
    await page.getByRole('radio', { name: 'Automatizaciones', exact: true }).click()
    await page.getByRole('button', { name: 'Revisar importación', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    assert.equal(calls.some(([method]) => method === 'POST'), false, 'automation still needs review and consent')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Configurar Marketplace', exact: true }).click()
    const checkbox = page.getByRole('checkbox', { name: 'Autorizar también el cambio de origen de recursos' })
    assert.equal(await checkbox.isChecked(), false)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(Object.hasOwn(saves[0], 'resourcesUrl'), false)
    await page.getByRole('button', { name: 'Configurar Marketplace', exact: true }).click()
    await checkbox.check()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(saves[1].resourcesUrl, source.defaults.resourcesUrl)
    await page.goto(origin + '/limited')
    await page.getByText('Plantilla de prueba', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Importar copia editable' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Configurar Marketplace', exact: true }).count(), 0)
    assert.deepEqual(errors, [])
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
})
