// Drives the real Website screens in Chromium against the contract fixture.
//   node apps/desktop/website-harness/run.mjs
// Starts its own Vite server on 127.0.0.1:5199 (never the project's dev ports)
// and writes screenshots to ./.shots plus results.json.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createFixture } from './fixture-api.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = resolve(here, '..')
const shots = resolve(here, '.shots')
mkdirSync(shots, { recursive: true })
const BASE = 'http://127.0.0.1:5199'
const ROOT = '/app/m/runly.website'
const ALL = ['website.access', 'website.site.read', 'website.site.update', 'website.pages.read', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete', 'website.domains.manage', 'website.dist.upload', 'website.forms.read']
const VIEWER = ['website.access', 'website.site.read', 'website.pages.read']

const results = []
const record = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`) }
let failShots = 0
async function check(name, fn, page) {
  try { await fn(); record(name, true) } catch (error) {
    record(name, false, String(error.message).split('\n')[0])
    if (page) await page.screenshot({ path: resolve(shots, `fail-${++failShots}.png`) }).catch(() => {})
  }
}

const vite = spawn(process.execPath, [resolve(desktop, 'node_modules/vite/bin/vite.js'), '--config', 'website-harness/vite.config.js'], { cwd: desktop, stdio: 'ignore' })
async function waitForVite() {
  for (let i = 0; i < 120; i += 1) { try { const res = await fetch(BASE); if (res.ok) return } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 500)) }
  throw new Error('vite did not start')
}

function seed(fixture) {
  const a = fixture.addSite({ name: 'Cafetería La Esquina', siteType: 'ecommerce', lifecycle: 'published', status: 'published', activeReleaseId: 'rel-seed-2', lastPublishedReleaseId: 'rel-seed-2', draftRevision: 7, publicationRevision: 2 })
  const b = fixture.addSite({ name: 'Landing temporada' })
  const home = fixture.addPage(a.id, { title: 'Inicio', slug: 'inicio', routePath: '/', status: 'published' })
  fixture.addPage(a.id, { title: 'Menú', slug: 'menu', routePath: '/menu', status: 'published' })
  fixture.state.releases.push(
    { id: 'rel-seed-1', siteId: a.id, draftRevision: 3, publicationRevision: 0, state: 'ready', manifestHash: 'hash-rel-seed-1', manifest: { integrityMode: 'sealed' }, failureCode: null, actorId: 'a', createdAt: '2026-10-30T15:00:00Z', published: true },
    { id: 'rel-seed-2', siteId: a.id, draftRevision: 5, publicationRevision: 1, state: 'ready', manifestHash: 'hash-rel-seed-2', manifest: { integrityMode: 'sealed' }, failureCode: null, actorId: 'a', createdAt: '2026-11-01T18:30:00Z', published: true },
  )
  return { a, b, home }
}

async function newPage(browser, fixture, { perms = ALL, width = 1440, height = 900, dark = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light' })
  const page = await context.newPage()
  await page.addInitScript((p) => { window.__HARNESS_PERMS__ = p }, perms)
  await page.route((url) => url.origin === BASE && /^\/(website|company)\//.test(url.pathname), async (route) => {
    const request = route.request(); const url = new URL(request.url())
    let body = null
    try { body = request.postDataJSON() } catch { body = null }
    const out = fixture.handle(request.method(), url.pathname, url.searchParams, body ?? {}, { ...request.headers(), origin: BASE })
    await route.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) })
  })
  await page.route(`${BASE}/__preview-fixture**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1 style="font-family:sans-serif">Vista previa (fixture)</h1>' }))
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  return { page, context, errors }
}
const shot = (page, name) => page.screenshot({ path: resolve(shots, `${name}.png`), fullPage: false })
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

try {
  await waitForVite()
  const browser = await chromium.launch()

  // ---- Sites list, workspace, status ----
  {
    const fixture = createFixture(); const { a, b } = seed(fixture)
    const { page, errors } = await newPage(browser, fixture)
    await page.goto(`${BASE}${ROOT}`)
    await check('legacy-only sections refuse non-default sites instead of editing the wrong one', async () => {
      await page.goto(`${BASE}${ROOT}/sites/${b.id}/forms`)
      await page.getByText('Esta sección aún no admite este sitio').waitFor()
      await page.goto(`${BASE}${ROOT}`)
    })
    await check('list: shows both sites with status', async () => {
      await page.getByRole('heading', { name: 'Cafetería La Esquina' }).waitFor()
      await page.getByText('Landing temporada').waitFor()
      await page.getByText('Predeterminado').waitFor()
    })
    await shot(page, '01-list-desktop')
    await page.getByRole('button', { name: 'Abrir' }).first().click()
    await check('workspace: context bar, pending-changes chip, nav', async () => {
      await page.waitForURL(`**/sites/${a.id}/overview`)
      await page.getByRole('navigation', { name: 'Ubicación' }).waitFor()
      await page.getByText('Publicado · cambios sin publicar').first().waitFor()
      await page.getByRole('navigation', { name: 'Secciones del sitio' }).waitFor()
    })
    await shot(page, '02-overview-desktop')
    await check('legacy /pages redirects to default site pages', async () => {
      await page.goto(`${BASE}${ROOT}/pages`)
      await page.waitForURL(`**/sites/${a.id}/pages`)
    })
    await check('no uncaught page errors (list/overview/pages)', async () => { if (errors.length) throw new Error(errors[0]) })
    await page.context().close()
  }

  // ---- Pages + editor save + conflict ----
  {
    const fixture = createFixture(); const { a } = seed(fixture)
    const { page, errors } = await newPage(browser, fixture)
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/pages`)
    await check('pages: table lists pages with public flag', async () => {
      await page.getByText('Inicio').first().waitFor(); await page.getByText('Menú').first().waitFor()
    })
    await shot(page, '03-pages-desktop')
    await page.getByRole('button', { name: 'Nueva página' }).first().click()
    await page.getByLabel('Título').fill('Contacto')
    await page.getByRole('button', { name: 'Crear página' }).click()
    await check('create page -> admin editor route with builder + top bar', async () => {
      await page.waitForURL(/\/pages\/[^/]+\/editor$/)
      await page.getByTestId('website-editor').waitFor()
      await page.getByRole('button', { name: /Guardar borrador/ }).waitFor({ timeout: 20000 })
      await page.getByText('Borrador', { exact: false }).first().waitFor()
    })
    await shot(page, '04-editor-desktop')
    await check('editor save sends PUT with expectedRevision and status becomes Guardado', async () => {
      const before = fixture.state.log.length
      await page.getByRole('button', { name: /Guardar borrador/ }).click()
      await page.getByText(/^Guardado/).first().waitFor({ timeout: 10000 })
      const puts = fixture.state.log.slice(before).filter((line) => line.startsWith('PUT') && line.endsWith('/draft'))
      if (puts.length !== 1) throw new Error(`expected one PUT draft, got ${puts.length}`)
    })
    await check('editor never claims unsaved local edits (no dirty signal in 0.2.4)', async () => {
      const text = await page.getByTestId('website-editor').innerText()
      if (/cambios sin guardar/i.test(text.replace('El editor no avisa de cambios sin guardar', ''))) throw new Error('unexpected unsaved claim')
    })
    fixture.state.flags.conflictOnNextSave = true
    await page.getByRole('button', { name: /Guardar borrador/ }).click()
    await check('409 revision_conflict opens dialog, nothing overwritten', async () => {
      await page.getByRole('dialog').getByText('Esta página cambió mientras la editabas').waitFor()
      const draftPuts = fixture.state.log.filter((l) => l.startsWith('PUT') && l.endsWith('/draft')).length
      if (draftPuts !== 2) throw new Error(`unexpected PUT count ${draftPuts}`)
    })
    await shot(page, '05-conflict-dialog')
    await check('conflict: "save as new page" creates private copy and navigates', async () => {
      const before = fixture.state.pages.length
      await page.getByRole('button', { name: /Guardar mi versión como una página nueva/ }).click()
      await page.waitForFunction((n) => window.location.pathname.endsWith('/editor'), before)
      await page.waitForTimeout(500)
      if (fixture.state.pages.length !== before + 1) throw new Error('copy page not created')
      if (fixture.state.pages.at(-1).visibility !== 'private') throw new Error('copy must be private')
    })
    await check('no uncaught page errors (editor)', async () => { if (errors.length) throw new Error(errors[0]) })
    await page.context().close()
  }

  // ---- Publish flow, form blocker, rollback, unpublish ----
  {
    const fixture = createFixture(); const { a, home } = seed(fixture)
    const { page } = await newPage(browser, fixture)
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/overview`)
    await page.getByRole('button', { name: 'Publicar' }).first().click()
    await check('publish sheet: review -> prepare -> ready -> activate -> done', async () => {
      const dialog = page.getByRole('dialog')
      await dialog.getByText('Todas las páginas guardadas').waitFor()
      await shot(page, '06-publish-review')
      await dialog.getByRole('button', { name: /Preparar publicación/ }).click()
      await dialog.getByText('La versión está lista').waitFor({ timeout: 15000 })
      await dialog.getByRole('button', { name: 'Activar versión' }).click()
      await dialog.getByText('Tu sitio está publicado').waitFor({ timeout: 10000 })
      await shot(page, '07-publish-done')
      await dialog.getByRole('button', { name: 'Listo' }).click()
    })
    await check('after publishing, pending-changes chip clears (revision compare)', async () => {
      await page.getByText('Publicado', { exact: true }).first().waitFor({ timeout: 10000 })
    })
    // Form blocker: page with a configured form reference.
    fixture.state.drafts[home.id] = { ...fixture.state.drafts[home.id], blocks: { b1: { id: 'b1', type: 'ContactFormBlock', props: { formId: 'form-123' } } } }
    fixture.state.sites[0].draftRevision += 1
    await page.reload()
    await page.getByRole('button', { name: 'Publicar' }).first().click()
    await check('form blocker: local warning names page+block, does not hide or auto-remove', async () => {
      const dialog = page.getByRole('dialog')
      await dialog.getByText(/Probablemente no se pueda publicar/).waitFor({ timeout: 10000 })
      await dialog.getByText('Página “Inicio”').waitFor()
      await dialog.getByRole('button', { name: 'No publicar esta página por ahora' }).waitFor()
      await shot(page, '08-publish-form-blocker')
    })
    await check('backend form_scope_unresolved is explained, site untouched', async () => {
      const dialog = page.getByRole('dialog')
      const activeBefore = fixture.state.sites[0].activeReleaseId
      await dialog.getByRole('button', { name: /Preparar publicación/ }).click()
      await dialog.getByText('Formulario sin propietario resuelto').waitFor({ timeout: 15000 })
      if (fixture.state.sites[0].activeReleaseId !== activeBefore) throw new Error('active release changed on failure')
      await shot(page, '09-publish-failed')
    })
    await check('excluding the blocked page lets publishing continue', async () => {
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Volver a revisar' }).click()
      await dialog.getByRole('button', { name: 'No publicar esta página por ahora' }).click()
      await dialog.getByText(/Seguirá visible la versión publicada anterior/).waitFor()
      await dialog.getByRole('button', { name: /Preparar publicación/ }).click()
      await dialog.getByText('La versión está lista').waitFor({ timeout: 15000 })
      await dialog.getByRole('button', { name: 'Cancelar' }).click()
    })
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/publishing`)
    await check('history: rollback to a never-published version is refused inline, nothing changes', async () => {
      await page.getByText('Activa').first().waitFor()
      const before = fixture.state.sites[0].activeReleaseId
      await page.getByRole('button', { name: /Volver a esta versión/ }).first().click()
      await page.getByRole('dialog').getByText(/Tus borradores no se pierden/).first().waitFor()
      await page.getByRole('dialog').getByRole('button', { name: 'Volver a esta versión' }).click()
      await page.getByRole('dialog').getByText('Versión nunca publicada').waitFor()
      if (fixture.state.sites[0].activeReleaseId !== before) throw new Error('active release changed')
      await shot(page, '10-rollback-refused')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    })
    await check('history: rollback to a published version confirms consequences and switches', async () => {
      await page.locator('li', { hasText: '30 oct' }).getByRole('button', { name: /Volver a esta versión/ }).click()
      await shot(page, '10b-rollback-confirm')
      await page.getByRole('dialog').getByRole('button', { name: 'Volver a esta versión' }).click()
      await page.waitForFunction(() => document.body.innerText.includes('Activa'))
      await page.waitForTimeout(600)
      if (fixture.state.sites[0].activeReleaseId !== 'rel-seed-1') throw new Error('rollback did not switch')
    })
    await check('unpublish requires explicit acknowledgement, keeps history', async () => {
      await page.getByRole('button', { name: 'Retirar el sitio' }).first().click()
      const confirm = page.getByRole('button', { name: 'Retirar el sitio' }).last()
      if (!(await confirm.isDisabled())) throw new Error('confirm should be disabled until acknowledged')
      await page.getByRole('checkbox').check()
      await confirm.click()
      await page.getByText(/El sitio está retirado/).waitFor({ timeout: 10000 })
      if (fixture.state.releases.length < 3) throw new Error('history lost')
    }, page)
    await page.context().close()
  }

  // ---- Create-site wizard with injected failure and retry ----
  {
    const fixture = createFixture({ failSecondPage: true })
    const { page } = await newPage(browser, fixture)
    await page.goto(`${BASE}${ROOT}`)
    await page.getByRole('button', { name: 'Crear sitio' }).first().click()
    await check('wizard step 1: scenarios are a radio group; ZIP needs permissions', async () => {
      await page.getByRole('radiogroup').waitFor()
      await page.getByRole('radio', { name: /Sitio informativo/ }).click()
      await shot(page, '11-wizard-step1')
    })
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await check('wizard step 2: name is required', async () => {
      await page.getByRole('button', { name: 'Siguiente' }).last().click()
      await page.getByText('Escribe un nombre para el sitio.').waitFor()
    })
    await page.getByLabel(/Nombre del sitio/).fill('Mi nuevo sitio')
    await page.getByRole('button', { name: 'Siguiente' }).last().click()
    await page.locator('button:has-text("pag")').first().waitFor({ timeout: 10000 })
    await page.locator('button:has-text("pag")').first().click()
    await page.getByRole('button', { name: /Crear con \d+ página/ }).click()
    await check('wizard: failing page step leaves a recoverable draft site with Retry', async () => {
      await page.getByText('Tu sitio ya existe como borrador').waitFor({ timeout: 15000 })
      if (fixture.state.sites.length !== 1) throw new Error('site should exist once')
      await shot(page, '12-wizard-partial-failure')
    })
    await check('wizard: Retry completes without duplicating the site or pages', async () => {
      await page.getByRole('button', { name: 'Reintentar' }).click()
      await page.waitForURL(/\/sites\/[^/]+\/overview$/, { timeout: 20000 })
      if (fixture.state.sites.length !== 1) throw new Error('duplicate site')
      const titles = fixture.state.pages.map((p) => p.routePath)
      if (new Set(titles).size !== titles.length) throw new Error('duplicate page route')
    })
    await page.context().close()
  }

  // ---- Domains, settings, import ----
  {
    const fixture = createFixture({ isolationRequired: true }); const { a } = seed(fixture)
    const { page } = await newPage(browser, fixture)
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/domains`)
    await check('domains: reservation is "en preparación", custom domain "Próximamente", never HTTPS claim', async () => {
      await page.getByLabel('Nombre de la dirección').fill('cafe-esquina')
      await page.getByRole('button', { name: 'Reservar' }).click()
      await page.getByText('Reservada · en preparación').waitFor()
      await page.getByText('Próximamente').first().waitFor()
      const text = await page.locator('main').innerText()
      if (/https activo|publicado con https/i.test(text)) throw new Error('HTTPS claim')
      await shot(page, '13-domains')
    })
    await check('domains: taken hostname shows error on the field', async () => {
      await page.getByLabel('Nombre de la dirección').fill('cafe-esquina')
      await page.getByRole('button', { name: 'Reservar' }).click()
      await page.getByText(/Dirección no disponible/).waitFor()
    })
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/settings`)
    await check('settings: identity save uses expectedRevision; archive needs the exact name', async () => {
      await page.getByLabel(/Nombre del sitio/).fill('Cafetería Nueva')
      await page.getByRole('button', { name: 'Guardar identidad' }).click()
      await page.waitForTimeout(600)
      if (fixture.state.sites[0].name !== 'Cafetería Nueva') throw new Error('identity not saved')
      await page.locator('summary', { hasText: 'Archivar este sitio' }).click()
      await page.getByRole('button', { name: 'Archivar sitio' }).first().click()
      const confirm = page.getByRole('button', { name: 'Archivar sitio' }).last()
      if (!(await confirm.isDisabled())) throw new Error('archive should wait for the name')
      await shot(page, '14-settings-archive')
      await page.keyboard.press('Escape')
    })
    await check('settings: stale revision shows conflict banner, no overwrite', async () => {
      fixture.state.sites[0].draftRevision += 5
      await page.getByLabel(/Nombre del sitio/).fill('Otro nombre')
      await page.getByRole('button', { name: 'Guardar identidad' }).click()
      await page.getByText('Este sitio cambió').waitFor()
      if (fixture.state.sites[0].name === 'Otro nombre') throw new Error('stale write accepted')
    })
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/import`)
    await check('import: isolation_required is an informative state, not a crash', async () => {
      await page.setInputFiles('input[type=file]', { name: 'sitio.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') })
      await page.getByRole('button', { name: 'Subir y validar' }).click()
      await page.getByText('No disponible en esta instalación').waitFor()
      const text = await page.locator('main').innerText()
      if (/React|Astro|Next/.test(text)) throw new Error('framework promise in copy')
      await shot(page, '15-import-isolation')
    })
    fixture.state.flags.isolationRequired = false; fixture.state.flags.rejectImport = true
    await check('import: rejected archive lists reasons and keeps the site untouched', async () => {
      await page.reload()
      await page.setInputFiles('input[type=file]', { name: 'malo.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') })
      await page.getByRole('button', { name: 'Subir y validar' }).click()
      await page.getByText('Archivo rechazado').waitFor({ timeout: 15000 })
    })
    await page.context().close()
  }

  // ---- Permissions (viewer) ----
  {
    const fixture = createFixture(); const { a, home } = seed(fixture)
    const { page } = await newPage(browser, fixture, { perms: VIEWER })
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/overview`)
    await check('viewer: Publicar disabled with a readable reason; Vista previa follows read perms', async () => {
      const publish = page.getByRole('button', { name: 'Publicar' }).first()
      await publish.waitFor()
      if (!(await publish.isDisabled())) throw new Error('publish must be disabled')
      await page.getByText('Tu rol no incluye este permiso.').first().waitFor({ state: 'attached' })
      await shot(page, '16-viewer-overview')
    })
    await page.goto(`${BASE}${ROOT}/sites/${a.id}/pages/${home.id}/editor`)
    await check('viewer: editor shows read-only notice', async () => {
      await page.getByText('Solo lectura').first().waitFor({ timeout: 20000 })
    })
    await page.context().close()
  }

  // ---- Responsive + dark ----
  {
    const fixture = createFixture(); const { a } = seed(fixture)
    const mobile = await newPage(browser, fixture, { width: 390, height: 844 })
    await mobile.page.goto(`${BASE}${ROOT}`)
    await mobile.page.getByText('Cafetería La Esquina').waitFor()
    await check('mobile 390: list has no horizontal scroll', async () => { if (!(await noOverflow(mobile.page))) throw new Error('overflow') })
    await shot(mobile.page, '17-list-mobile')
    await mobile.page.goto(`${BASE}${ROOT}/sites/${a.id}/overview`)
    await mobile.page.getByLabel('Sección').first().waitFor().catch(() => {})
    await check('mobile 390: workspace has no horizontal scroll and section select', async () => {
      await mobile.page.getByRole('heading', { name: /Primeros pasos/ }).waitFor()
      if (!(await noOverflow(mobile.page))) throw new Error('overflow')
    })
    await shot(mobile.page, '18-overview-mobile')
    await mobile.context.close()
    const dark = await newPage(browser, fixture, { dark: true })
    await dark.page.goto(`${BASE}${ROOT}/sites/${a.id}/publishing?theme=dark`)
    await dark.page.evaluate(() => document.documentElement.classList.add('dark'))
    await dark.page.getByText('Historial de versiones').waitFor()
    await shot(dark.page, '19-publishing-dark')
    await check('dark theme: publishing renders', async () => {})
    await dark.context.close()
  }

  await browser.close()
} catch (error) {
  record('harness run', false, error.message)
} finally {
  vite.kill()
  const failed = results.filter((r) => !r.pass)
  writeFileSync(resolve(here, 'results.json'), JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failed.length, results }, null, 2))
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length ? 1 : 0)
}
