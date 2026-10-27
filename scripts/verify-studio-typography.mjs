// Real React + Fabric, synthetic in-memory document, local fonts. No database/API.
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = resolve(root, '.artifacts/studio/typography')
await mkdir(output, { recursive: true })
const require = createRequire(resolve(root, 'packages/module-compiler/package.json'))
const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
const { build } = require('esbuild')
const bundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/typography-ui.jsx')],
  nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', minify: true,
  write: false, define: { 'import.meta.env.BASE_URL': JSON.stringify('/') }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'one-react-runtime', setup(builder) {
    builder.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: desktopRequire.resolve(args.path) }))
  } }] })
const assets = resolve(root, 'apps/desktop/dist/assets')
const cssFile = (await readdir(assets)).find(name => /^styles-.*\.css$/.test(name))
const css = await readFile(resolve(assets, cssFile))
const server = createServer(async (request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); return }
  if (request.url === '/fixture.css') { response.setHeader('Content-Type', 'text/css'); response.end(css); return }
  if (/^\/studio-fonts\/[a-z0-9-]+\.ttf$/.test(request.url)) {
    response.setHeader('Content-Type', 'font/ttf'); response.end(await readFile(resolve(root, 'apps/desktop/public', request.url.slice(1)))); return
  }
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  response.setHeader('Content-Type', 'text/html')
  response.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="height:100dvh;overflow:hidden"></div><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
const errors = [], screenshots = [], checks = []
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await page.goto(origin)
  await page.waitForFunction(() => Boolean(window.studioUX))
  await page.evaluate(() => window.studioUX.select('object-1'))
  const toolbar = page.getByRole('toolbar', { name: 'Opciones de la selección' })
  await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).click()
  const lato = page.getByRole('option', { name: /^Lato/ })
  await page.waitForFunction(() => document.fonts.check('16px Lato') && [...document.fonts].some(face => face.family === 'Lato'))
  await page.waitForFunction(() => ['Lato', 'Playfair Display', 'Bebas Neue', 'Pacifico', 'Oswald', 'Space Mono'].every(family => [...document.fonts].some(face => face.family.replace(/["']/g, '') === family && face.status === 'loaded' && face.weight === '400')))
  await lato.click()
  await page.waitForFunction(() => window.studioUX.snapshot().objects[0].fontFamily === 'Lato')
  assert.equal(await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).innerText(), 'Lato')
  await toolbar.getByRole('combobox', { name: 'Variante tipográfica' }).click()
  assert.equal(await page.getByRole('option', { name: 'Negrita · No disponible', exact: true }).getAttribute('aria-disabled'), 'true')
  assert.equal(await page.getByRole('option', { name: 'Cursiva · No disponible', exact: true }).getAttribute('aria-disabled'), 'true')
  await page.keyboard.press('Escape')
  checks.push('Real local font samples and disabled unavailable variants')

  // Keyboard undo keeps both the toolbar and inspector synchronized by stable ID.
  await page.getByRole('application').focus()
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.studioUX.snapshot().objects[0].fontFamily === 'sans-serif')
  await toolbar.waitFor()
  assert.equal(await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).innerText(), 'Sistema')
  assert.equal(await page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Ideas que toman forma')
  await page.keyboard.press('Control+Shift+z')
  await page.waitForFunction(() => window.studioUX.snapshot().objects[0].fontFamily === 'Lato')
  assert.equal(await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).innerText(), 'Lato')
  checks.push('Ctrl+Z and Ctrl+Shift+Z preserve single selection and synchronize toolbar/inspector')

  await page.getByLabel('Texto del elemento', { exact: true }).fill('Texto de prueba\nSegunda línea')
  await page.getByLabel('Posición X', { exact: true }).fill('90')
  await page.getByRole('application').focus()
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.studioUX.snapshot().objects[0].x === 60)
  assert.equal(await page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Texto de prueba\nSegunda línea')
  await toolbar.getByRole('button', { name: /^Color del texto:/ }).click()
  await page.getByRole('radio', { name: '#d946ef', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.studioUX.snapshot().objects[0].fill), '#d946ef')
  const size = toolbar.getByRole('textbox', { name: 'Tamaño de letra', exact: true })
  await size.fill('56'); await size.press('Enter')
  await page.waitForFunction(() => window.studioUX.snapshot().objects[0].fontSize === 56)
  await page.getByRole('application').focus(); await page.keyboard.press('Control+z')
  assert.equal(await size.inputValue(), '48')
  checks.push('Multiline text, transform undo, contextual color and size edits')

  await toolbar.getByRole('button', { name: 'Bloquear', exact: true }).click()
  assert.equal(await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).isDisabled(), true)
  await page.getByRole('application').focus(); await page.keyboard.press('Control+z')
  assert.equal(await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).isDisabled(), false)
  checks.push('Locked text disables formatting; undo restores editable selection')

  // Multi-selection survives history and disappears when every selected ID is removed by undo.
  await page.evaluate(async () => {
    window.studioUX.selectMany(['object-1', 'object-2']); await window.studioUX.align('left', 'page'); await window.studioUX.undo()
  })
  await toolbar.getByText('2 seleccionados').waitFor()
  await page.evaluate(async () => { await window.studioUX.add('ellipse'); await window.studioUX.undo() })
  await toolbar.waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    await window.studioUX.add('ellipse')
    const added = window.studioUX.snapshot().objects.at(-1).id
    window.studioUX.selectMany(['object-1', added]); await window.studioUX.undo()
  })
  await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).waitFor()
  checks.push('Multi-selection survives history; undo creation clears nonexistent selection')

  const paper = await page.getByLabel('Lienzo editable de Studio', { exact: true }).boundingBox()
  await page.mouse.click(paper.x + 80 * paper.width / 800, paper.y + 180 * paper.height / 600, { button: 'right' })
  await page.getByRole('menuitem', { name: /^Copiar/ }).click()
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('menuitem', { name: /Agrupar/ }).count(), 0)
  checks.push('Right-click targets text and invokes real clipboard action')

  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    // A docked panel becomes a modal sheet on phones; close it before testing the canvas.
    if (width === 390) {
      await page.getByRole('dialog', { name: 'Elementos', exact: true }).waitFor()
      await page.getByRole('dialog', { name: 'Elementos', exact: true }).focus()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Elementos', exact: true }).waitFor({ state: 'hidden' })
    }
    await page.evaluate(() => window.studioUX.select('object-1'))
    for (const theme of ['light', 'dark']) {
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
      await toolbar.waitFor()
      await page.waitForTimeout(350)
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        toolbar: (() => { const r = document.querySelector('[role=toolbar]').getBoundingClientRect(); return { left: r.left, right: r.right } })() }))
      assert.ok(dimensions.scroll <= dimensions.width, `page overflow at ${width}/${theme}`)
      assert.ok(dimensions.toolbar.left >= 0 && dimensions.toolbar.right <= width, `toolbar overflow at ${width}/${theme}`)
      const file = `editor-${width}-${theme}.png`
      await page.screenshot({ path: resolve(output, file), animations: 'disabled' }); screenshots.push(file)
    }
  }
  checks.push('390/820/1440 px, light/dark, no page or toolbar overflow')
  await page.setViewportSize({ width: 390, height: 1000 })
  await toolbar.getByRole('button', { name: 'Propiedades', exact: true }).click()
  await page.getByRole('dialog', { name: 'Propiedades', exact: true }).getByLabel('Texto del elemento', { exact: true }).fill('Edición móvil')
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.studioUX.snapshot().objects[0].text), 'Edición móvil')
  await page.getByRole('navigation', { name: 'Herramientas de diseño' }).getByRole('button', { name: 'Elementos', exact: true }).click()
  await page.getByRole('dialog', { name: 'Elementos', exact: true }).getByText('Bandas decorativas', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Línea', exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  checks.push('Mobile properties sheet edits real text; rectangle strips are not labeled as lines')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await toolbar.getByRole('combobox', { name: 'Tipografía', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('listbox').waitFor()
  await page.screenshot({ path: resolve(output, 'font-menu-mobile.png'), animations: 'disabled' })
  screenshots.push('font-menu-mobile.png')
  await page.keyboard.press('Escape')
  checks.push('Font menu keyboard access with reduced motion')

  const failedPage = await browser.newPage({ viewport: { width: 820, height: 1000 } })
  failedPage.on('pageerror', error => errors.push(error.message))
  await failedPage.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  await failedPage.route('**/studio-fonts/pacifico.ttf', route => route.abort())
  await failedPage.goto(origin)
  await failedPage.waitForFunction(() => Boolean(window.studioUX))
  await failedPage.evaluate(() => window.studioUX.select('object-1'))
  const failedPicker = failedPage.getByRole('toolbar').getByRole('combobox', { name: 'Tipografía', exact: true })
  await failedPicker.click()
  const failedOption = failedPage.getByRole('option', { name: /^Pacifico/ })
  await failedOption.getByText('No disponible. Abre de nuevo para reintentar.', { exact: true }).waitFor()
  assert.equal(await failedOption.getAttribute('aria-disabled'), 'true')
  assert.equal(await failedPage.evaluate(() => window.studioUX.snapshot().objects[0].fontFamily), 'sans-serif')
  await failedPage.keyboard.press('Escape')
  await failedPage.unroute('**/studio-fonts/pacifico.ttf')
  await failedPicker.click()
  await failedPage.waitForFunction(() => [...document.fonts].some(face => face.family === 'Pacifico' && face.status === 'loaded'))
  await failedPage.getByRole('option', { name: /^Pacifico/ }).click()
  await failedPage.waitForFunction(() => window.studioUX.snapshot().objects[0].fontFamily === 'Pacifico')
  await failedPage.close()
  checks.push('Font failure disables preview without changing document; reopening retries successfully')
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ checks, screenshots, errors }, null, 2))
  console.log(JSON.stringify({ checks, screenshots, errors }))
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    await page.screenshot({ path: resolve(output, 'failure.png'), animations: 'disabled' }).catch(() => {})
    console.error(JSON.stringify({ checks, errors, fonts: await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, weight: face.weight, status: face.status }))).catch(() => []) }))
  }
  throw error
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
