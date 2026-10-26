// Real React UI + SDK + service + SQL, fixture auth/storage. Disposable DB only.
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import pg from 'pg'
import { chromium } from 'playwright'
import { createStudioService } from '../apps/api/src/routes/studio/studio-service.js'
import { database } from './fixtures/studio/postgres-adapter.mjs'
import { installMinimalStudioAccess } from './fixtures/studio/minimal-access.mjs'
import { createBlank,insertText,insertShape,showFiles,selectLayer,exportImage } from './fixtures/studio/editor-controls.mjs'
import { searchTemplates } from '../apps/shared/studio/templates.js'

const root = fileURLToPath(new URL('../', import.meta.url)), output = resolve(root, '.artifacts/studio')
const url = process.env.STUDIO_TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/studio_verification') throw Error('DISPOSABLE_STUDIO_DATABASE_REQUIRED')
const schema = `studio_ui_${Date.now()}`
const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` })
const company = '00000000-0000-4000-8000-000000000001', owner = '00000000-0000-4000-8000-000000000002'
const assetId = '00000000-0000-4000-8000-000000000005'
await pool.query(`DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$`)
await pool.query(`CREATE SCHEMA ${schema}`)
await pool.query(`CREATE TABLE company(id uuid PRIMARY KEY); CREATE TABLE user_profile(id uuid PRIMARY KEY);
  CREATE TABLE file_asset(id uuid PRIMARY KEY, entity_id uuid, uploaded_by_id uuid, enabled boolean, mime_type text);
  CREATE TABLE audit_log(action text NOT NULL, entity_id uuid, metadata jsonb);`)
await pool.query(await readFile(resolve(root, 'prisma/migrations/20261130000000_studio_design/migration.sql'), 'utf8'))
await installMinimalStudioAccess(pool)
await pool.query('INSERT INTO company VALUES ($1);', [company]); await pool.query('INSERT INTO user_profile(id) VALUES ($1)', [owner])
const service = createStudioService({ prisma: database(pool, pool) })
const require = createRequire(resolve(root, 'packages/module-compiler/package.json'))
const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
const { build } = require('esbuild')
const bundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/ui.jsx')], nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true,
  platform: 'browser', format: 'esm', jsx: 'automatic', minify: true, write: false, loader: { '.css': 'empty', '.svg': 'dataurl', '.woff2': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'fixture-identity-only', setup(build) {
    build.onResolve({ filter: /AuthProvider\.jsx$/ }, () => ({ path: resolve(root, 'scripts/fixtures/studio/auth.js') }))
    build.onResolve({ filter: /useStudioRealtime\.js$/ }, () => ({ path: resolve(root, 'scripts/fixtures/studio/realtime.js') }))
    build.onResolve({ filter: /\/lib\/runly\.js$/ }, () => ({ path: resolve(root, 'scripts/fixtures/studio/client.js') }))
    build.onResolve({ filter: /^(react|react-dom|@tanstack\/react-query)(\/.*)?$/ }, args => ({ path: desktopRequire.resolve(args.path) }))
  } }] })
await mkdir(output, { recursive: true })
const assets = resolve(root, 'apps/desktop/dist/assets'), cssName = (await readdir(assets)).find(name => /^styles-.*\.css$/.test(name))
const css = await readFile(resolve(assets, cssName))
let originalImage, failNextSave = false, conflictNextSave = false
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); return }
  if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); return }
  if (request.url === '/fixture-image.png') { response.setHeader('Content-Type', 'image/png'); response.end(originalImage); return }
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="height:100dvh;overflow:auto"></div><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/studio/templates**',route=>route.fulfill({json:{data:searchTemplates(Object.fromEntries(new URL(route.request().url()).searchParams))}}))
  await page.route('**/studio/designs**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname
    assert.equal(request.headers()['x-runly-company-id'], company)
    assert.equal(request.headers().authorization, 'Bearer studio-fixture-token')
    if(pathname.endsWith('/credits')){await route.fulfill({json:{data:[]}});return}
    if (request.method() === 'PUT' && failNextSave) {
      failNextSave = false
      await route.fulfill({ status: 503, json: { error: 'Fallo temporal de prueba' } }); return
    }
    if (request.method() === 'PUT' && conflictNextSave) {
      conflictNextSave = false
      await route.fulfill({ status: 409, json: { error: 'Hay una versión más reciente. Conserva tus cambios y vuelve a abrir el diseño.' } }); return
    }
    try {
      const id = pathname.split('/')[3]
      const data = request.method() === 'POST' ? await service.create(company, owner, request.postDataJSON()) :
        request.method() === 'PUT' ? await service.update(company, owner, id, request.postDataJSON()) :
          id ? await service.get(company, owner, id) : await service.list(company, owner)
      await route.fulfill({ json: { data }, status: request.method() === 'POST' ? 201 : 200 })
    } catch (error) { await route.fulfill({ json: { error: error.message }, status: error.status ?? 500 }) }
  })
  await page.route('**/files/upload', async route => {
    const request = route.request(), body = await new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData()
    assert.equal(body.get('moduleKey'), 'runly.files'); assert.equal(body.get('entityType'), 'AtlasFile')
    originalImage = Buffer.from(await body.get('file').arrayBuffer())
    await pool.query('INSERT INTO file_asset VALUES ($1,$2,$3,true,$4)', [assetId, company, owner, 'image/png'])
    await route.fulfill({ json: { data: { id: assetId } } })
  })
  await page.route('**/files/*/signed-url', route => route.fulfill({ json: { signedUrl: `${origin}/fixture-image.png` } }))
  await page.route('**/studio/designs/*/assets/*/signed-url', route => route.fulfill({ json: { data: { signedUrl: `${origin}/fixture-image.png` } } }))
  await page.goto(origin)
  await createBlank(page)
  await insertText(page)
  await page.getByLabel('Texto del elemento', { exact: true }).fill('Primera composición real')
  await page.getByLabel('Posición X', { exact: true }).fill('120')
  await insertShape(page,'Rectángulo')
  await page.getByLabel('Ancho', { exact: true }).fill('280')
  await page.getByLabel('Posición Y', { exact: true }).fill('400')
  await insertShape(page,'Círculo')
  await page.getByLabel('Posición X', { exact: true }).fill('500')
  await page.getByLabel('Posición Y', { exact: true }).fill('400')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 24
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, 40, 24)
    return canvas.toDataURL().split(',')[1]
  })
  await showFiles(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await selectLayer(page,4)
  await page.getByLabel('Ancho', { exact: true }).fill('160')
  await page.getByLabel('Posición X', { exact: true }).fill('700')
  await page.getByLabel('Nombre del diseño').fill('Composición de prueba')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('status').filter({ hasText: /^Guardado/ }).waitFor()
  const designId = new URL(page.url()).searchParams.get('design')
  const persisted = await service.get(company, owner, designId)
  assert.equal(persisted.document.objects.length, 4)
  assert.equal(persisted.document.objects[0].text, 'Primera composición real')
  assert.equal(persisted.document.objects[0].x, 120)
  assert.equal(persisted.document.objects[1].width, 280)
  assert.equal(persisted.document.objects[3].fileAssetId, assetId)
  assert.equal(persisted.document.objects[3].width, 160)
  assert.equal(persisted.document.objects[3].x, 700)
  await page.reload()
  await selectLayer(page,1)
  await page.getByLabel('Texto del elemento', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Primera composición real')
  // A failed save must preserve local edits and leave the stored revision intact.
  await page.getByLabel('Texto del elemento', { exact: true }).fill('Recuperado tras fallo temporal')
  failNextSave = true
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByText('Fallo temporal de prueba', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Recuperado tras fallo temporal')
  assert.equal((await service.get(company, owner, designId)).revision, persisted.revision)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('status').filter({ hasText: /^Guardado/ }).waitFor()
  assert.equal((await service.get(company, owner, designId)).document.objects[0].text, 'Recuperado tras fallo temporal')
  await page.getByLabel('Texto del elemento', { exact: true }).fill('Cambios locales en conflicto')
  conflictNextSave = true
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByText('Hay una versión más reciente. Conserva tus cambios y vuelve a abrir el diseño.', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Cambios locales en conflicto')
  assert.equal((await service.get(company, owner, designId)).document.objects[0].text, 'Recuperado tras fallo temporal')
  const downloadPromise = page.waitForEvent('download')
  await exportImage(page)
  const download = await downloadPromise
  await download.saveAs(resolve(output, 'ui-export.png'))
  const bytes = await readFile(resolve(output, 'ui-export.png'))
  assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1080)
  await page.screenshot({ path: resolve(output, 'studio-desktop.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(output, 'studio-dark.png'), fullPage: true, animations: 'disabled' })
  await page.setViewportSize({ width: 375, height: 900 })
  await page.screenshot({ path: resolve(output, 'studio-mobile.png'), fullPage: true })
  await selectLayer(page,1)
  await page.keyboard.press('Escape')
  await page.getByRole('button',{name:'Propiedades',exact:true}).click()
  await page.screenshot({ path: resolve(output, 'studio-mobile-inspector.png'), fullPage: true })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'ui-result.json'), JSON.stringify({ passed: true, objects: 4, pngBytes: bytes.length,
    png: [1080, 1080], realPostgres: true, auth: 'fixture', storage: 'fixture-original-bytes', saveFailureRecovery: true, revisionConflictPreservesEdits: true, viewports: [1440, 375], errors }, null, 2))
  console.log('Studio UI passed: create, edit text/shapes/image, save in PostgreSQL, reload editable, export PNG, dark/mobile layout.')
} catch(error) {
  for(const context of browser?.contexts()??[])for(const page of context.pages())await page.screenshot({path:resolve(output,'studio-ui-failure.png'),fullPage:true}).catch(()=>{})
  throw error
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); await pool.end() }
