import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createStudioPrintJobs } from '../apps/api/src/routes/studio/studio-print-jobs.js'
import { documentPages } from '../apps/shared/studio/pages.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(resolve(root, 'packages/module-compiler/package.json'))
const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
const apiRequire = createRequire(resolve(root, 'apps/api/package.json'))
const { PDFDocument, PDFName } = apiRequire('pdf-lib')
const output = resolve(root, '.artifacts/studio/viewport')
await mkdir(output, { recursive: true })
const { build } = require('esbuild')
const bundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/viewport.jsx')], nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false, define: { 'import.meta.env.BASE_URL': JSON.stringify('/') },
  plugins: [{ name: 'react', setup(build) { build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: desktopRequire.resolve(args.path) })) } }] })
const workspaceBundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/viewport-workspace.jsx')], nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', minify: true, write: false, define: { 'import.meta.env.BASE_URL': JSON.stringify('/') }, loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
  plugins: [{ name: 'react', setup(build) { build.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: desktopRequire.resolve(args.path) })) } }] })
const assets = resolve(root, 'apps/desktop/dist/assets')
const css = await readFile(resolve(assets, (await readdir(assets)).find(name => /^styles-.*\.css$/.test(name))))
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/studio-fonts/')) { try { res.end(await readFile(resolve(root, 'apps/desktop/public', req.url.slice(1)))) } catch { res.writeHead(404); res.end() }; return }
  if (req.url === '/workspace.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(workspaceBundle.outputFiles[0].contents); return }
  if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
  if (req.url === '/workspace') { res.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root" style="height:100dvh"></div><script type="module" src="/workspace.js"></script></body></html>'); return }
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); return }
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>svg{position:absolute;inset:0;pointer-events:none}canvas{display:block}</style></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.viewportTest?.view.size.width > 0)
  const drift = await page.evaluate(async () => {
    const { view } = window.viewportTest
    view.changeZoom(2)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const rect = view.paper.current.getBoundingClientRect(), anchor = { x: rect.left + 400 * 2, y: rect.top + 300 * 2 }
    const errors = []
    for (let batch = 0; batch < 10; batch++) {
      for (let n = 0; n < 10; n++) view.viewport.current.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: batch % 2 ? 3 : -3, clientX: anchor.x, clientY: anchor.y, cancelable: true }))
      await new Promise(r => requestAnimationFrame(r))
      const paper = view.paper.current.getBoundingClientRect(), z = window.viewportTest.view.zoom
      errors.push(Math.hypot(paper.left + 400 * z - anchor.x, paper.top + 300 * z - anchor.y))
    }
    return Math.max(...errors)
  })
  const text = await page.evaluate(() => window.textExportTest().catch(error => ({ error: error.message })))
  console.log(JSON.stringify({ maxAnchorDrift: drift, text }))
  assert.ok(drift <= 1, `Anchor moved ${drift}px (tolerance 1 CSS px)`)
  assert.equal(text.error, undefined)
  assert.equal(text.canonical, true)
  assert.equal(text.unchanged, true)
  const measurements = []
  for (const dpr of [1, 2]) for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, hasTouch: true, colorScheme: theme })
    const target = await context.newPage()
    target.on('pageerror', error => errors.push(error.message))
    await target.goto(`http://127.0.0.1:${server.address().port}`)
    await target.waitForFunction(() => window.viewportTest?.view.size.width > 0)
    for (const dimensions of [{ width: 800, height: 600 }, { width: 480, height: 900 }]) {
      await target.evaluate(options => window.setupViewportScene(options), dimensions)
      const fitError = await target.evaluate(() => {
        const view = window.viewportTest.view, sheet = view.paper.current.getBoundingClientRect(), viewport = view.viewport.current.getBoundingClientRect()
        return Math.hypot(sheet.left + sheet.width / 2 - viewport.left - view.viewport.current.clientWidth / 2, sheet.top + sheet.height / 2 - viewport.top - view.viewport.current.clientHeight / 2)
      })
      assert.ok(fitError <= 1, `Fit center drift ${fitError}`)
      const result = await target.evaluate(async () => {
        const frame = () => new Promise(r => requestAnimationFrame(r))
        const test = () => window.viewportTest
        const before = JSON.stringify(test().editor.current.snapshot())
        test().editor.current.select('text')
        const anchorRect = document.querySelector('[data-marker]').getBoundingClientRect()
        const anchor = { x: anchorRect.left, y: anchorRect.top }
        let maxDrift = 0, maxRelative = 0
        const measure = () => {
          const marker = document.querySelector('[data-marker]').getBoundingClientRect(), paper = test().view.paper.current.getBoundingClientRect()
          maxDrift = Math.max(maxDrift, Math.hypot(marker.left - anchor.x, marker.top - anchor.y))
          maxRelative = Math.max(maxRelative, Math.abs(marker.left - paper.left - 400 * test().view.zoom), Math.abs(marker.top - paper.top - 300 * test().view.zoom))
          const upper = document.querySelector('.upper-canvas').getBoundingClientRect()
          maxRelative = Math.max(maxRelative, Math.abs(upper.left - paper.left), Math.abs(upper.top - paper.top))
        }
        for (let batch = 0; batch < 10; batch++) {
          for (let n = 0; n < 10; n++) test().view.viewport.current.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: batch % 2 ? 3 : -3, clientX: anchor.x, clientY: anchor.y, cancelable: true }))
          await frame(); measure()
        }
        for (const zoom of [0.05, 4, 0.05, 4, 1]) {
          // Exercise the cursor path with both zoom extremes.
          const view = test().view, rect = view.paper.current.getBoundingClientRect()
          const marker = document.querySelector('[data-marker]').getBoundingClientRect()
          const delta = -Math.log(zoom / view.zoom) / 0.002
          view.viewport.current.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: delta, clientX: marker.left, clientY: marker.top, cancelable: true }))
          await frame()
          const now = document.querySelector('[data-marker]').getBoundingClientRect()
          maxDrift = Math.max(maxDrift, Math.hypot(now.left - marker.left, now.top - marker.top))
          if (Math.abs(test().view.zoom - zoom) > 1e-6) throw Error('Wrong zoom limit')
          if (!Number.isFinite(rect.left)) throw Error('Invalid paper geometry')
        }
        // Rapid button-style functional updates must accumulate before commit.
        for (let n = 0; n < 8; n++) test().view.changeZoom(value => value * 1.2)
        await frame()
        if (test().view.zoom !== 4) throw Error('Lost rapid button updates')
        // A pending cursor zoom survives a simultaneous panel resize.
        test().view.viewport.current.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 3, clientX: anchor.x, clientY: anchor.y, cancelable: true }))
        test().setPanel(60); await frame(); await frame(); await frame()
        const during = document.querySelector('[data-marker]').getBoundingClientRect()
        test().setPanel(0); await frame(); await frame(); await frame()
        const after = document.querySelector('[data-marker]').getBoundingClientRect()
        maxDrift = Math.max(maxDrift, Math.hypot(after.left - during.left, after.top - during.top))
        if (before !== JSON.stringify(test().editor.current.snapshot()) || window.viewportChanges) throw Error('Viewport edited document/history')
        return { maxDrift, maxRelative }
      })
      assert.ok(result.maxDrift <= 1, `${width}/${dpr}/${theme}: anchor drift ${result.maxDrift}`)
      assert.ok(result.maxRelative <= 0.05, `Object/paper drift ${result.maxRelative}`)
      measurements.push({ viewportWidth: width, dpr, theme, page: dimensions, ...result })
    }
    await target.evaluate(() => window.setupViewportScene())
    const textPoint = await target.evaluate(() => {
      const view = window.viewportTest.view, rect = view.paper.current.getBoundingClientRect()
      return { x: rect.left + 150 * view.zoom, y: rect.top + 110 * view.zoom }
    })
    await target.mouse.dblclick(textPoint.x, textPoint.y)
    assert.equal(await target.evaluate(() => window.viewportTest.editor.current.isEditingText()), true)
    const typing = await target.evaluate(async () => {
      const { editor, view } = window.viewportTest, before = JSON.stringify(editor.current.snapshot())
      view.changeZoom(value => value * 1.2)
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      return { editing: editor.current.isEditingText(), unchanged: before === JSON.stringify(editor.current.snapshot()) }
    })
    assert.deepEqual(typing, { editing: true, unchanged: true })
    // Native trusted pinch events, including movement of the gesture center.
    await target.evaluate(async () => { window.viewportTest.view.fit(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))) })
    const pinch = await target.evaluate(() => {
      const view = window.viewportTest.view, rect = view.viewport.current.getBoundingClientRect(), paper = view.paper.current.getBoundingClientRect()
      const x = rect.left + rect.width / 2, y = 440
      return { x, y, dx: (x - paper.left) / view.zoom, dy: (y - paper.top) / view.zoom }
    })
    const cdp = await context.newCDPSession(target)
    const touches = (x, y, distance) => [{ x: x - distance, y, id: 1 }, { x: x + distance, y, id: 2 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(pinch.x, pinch.y, 40) })
    for (let n = 1; n <= 10; n++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(pinch.x + n, pinch.y + n, 40 + n * 2) })
      await target.evaluate(() => new Promise(r => requestAnimationFrame(r)))
      const error = await target.evaluate(({ dx, dy, x, y }) => {
        const view = window.viewportTest.view, rect = view.paper.current.getBoundingClientRect()
        return Math.hypot(rect.left + dx * view.zoom - x, rect.top + dy * view.zoom - y)
      }, { ...pinch, x: pinch.x + n, y: pinch.y + n })
      assert.ok(error <= 1, `Pinch+pan drift ${error}`)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    const handle = await target.evaluate(async () => {
      const { editor, view } = window.viewportTest
      editor.current.deselect(); editor.current.select('text'); view.changeZoom(0.05)
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const paper = view.paper.current.getBoundingClientRect()
      return { x: paper.left + 80 * 0.05 - 4, y: paper.top + 100 * 0.05 - 4, before: JSON.stringify(editor.current.snapshot()) }
    })
    // The drawn handle is 11 CSS px even at 5%; its 4px rim must be hittable.
    await target.waitForTimeout(450) // Fabric suppresses ghost mouse input after touch.
    await target.mouse.move(handle.x, handle.y); await target.mouse.down()
    await target.mouse.move(handle.x - 10, handle.y - 10, { steps: 3 }); await target.mouse.up()
    assert.notEqual(await target.evaluate(() => JSON.stringify(window.viewportTest.editor.current.snapshot())), handle.before, 'Visible control rim is not hittable after zoom')
    await context.close()
  }
  const workspaceResults = []
  for (const width of [390, 820, 1440]) for (const theme of ['light', 'dark']) {
    const target = await browser.newPage({ viewport: { width, height: 1000 } })
    target.on('pageerror', error => errors.push(error.message))
    await target.goto(`http://127.0.0.1:${server.address().port}/workspace`)
    await target.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
    await target.waitForFunction(() => !!window.workspaceEditor)
    await target.evaluate(() => window.workspaceEditor.select('text'))
    await target.waitForTimeout(100)
    await target.getByRole('button', { name: 'Ajustar a la pantalla', exact: true }).click()
    await target.waitForTimeout(100)
    const fitGeometry = await target.evaluate(() => {
      const viewport = document.querySelector('[aria-label="Lienzo"]'), paper = document.querySelector('.canvas-container').parentElement
      const area = viewport.getBoundingClientRect(), sheet = paper.getBoundingClientRect()
      return { error: Math.hypot(sheet.left + sheet.width / 2 - area.left - viewport.clientWidth / 2, sheet.top + sheet.height / 2 - area.top - viewport.clientHeight / 2), area: area.toJSON(), sheet: sheet.toJSON(), style: paper.style.cssText }
    })
    assert.ok(fitGeometry.error <= 1, `Workspace fit ${JSON.stringify(fitGeometry)}`)
    const result = await target.evaluate(async () => {
      const viewport = document.querySelector('[aria-label="Lienzo"]'), paper = document.querySelector('.canvas-container').parentElement
      const cursor = document.querySelector('[aria-label="Cursor de Colaborador"]')
      const before = JSON.stringify(window.workspaceEditor.snapshot())
      const origin = cursor.getBoundingClientRect(), anchor = { x: origin.left, y: origin.top }
      let maxDrift = 0, cursorSizeDrift = 0
      for (let batch = 0; batch < 10; batch++) {
        for (let n = 0; n < 10; n++) viewport.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: batch % 2 ? 3 : -3, clientX: anchor.x, clientY: anchor.y, cancelable: true }))
        await new Promise(r => requestAnimationFrame(r))
        const current = cursor.getBoundingClientRect(), sheet = paper.getBoundingClientRect(), zoom = sheet.width / 800
        maxDrift = Math.max(maxDrift, Math.hypot(current.left - anchor.x, current.top - anchor.y))
        cursorSizeDrift = Math.max(cursorSizeDrift, Math.abs(current.height - origin.height))
        const upper = document.querySelector('.upper-canvas').getBoundingClientRect()
        if (Math.abs(upper.left - sheet.left) > 0.05 || Math.abs(upper.top - sheet.top) > 0.05) throw Error('Fabric canvas left paper')
        if (Math.abs(current.left - sheet.left - 400 * zoom) > 0.05) throw Error('Remote cursor left document point')
      }
      return { maxDrift, cursorSizeDrift, unchanged: JSON.stringify(window.workspaceEditor.snapshot()) === before }
    })
    assert.ok(result.maxDrift <= 1, `Workspace anchor ${result.maxDrift}`)
    assert.ok(result.cursorSizeDrift <= 0.05, `Remote cursor zoom animation ${result.cursorSizeDrift}`)
    assert.equal(result.unchanged, true)
    await target.screenshot({ path: resolve(output, `workspace-${width}-${theme}.png`) })
    workspaceResults.push({ width, theme, ...result }); await target.close()
  }
  // Browser Textbox -> real progressive print jobs -> independent PDF structure.
  const doc = await page.evaluate(() => window.setupTextPages())
  const scenes = documentPages(doc), revision = { value: 1 }
  const jobs = createStudioPrintJobs({ getDesign: async () => ({ document: doc, revision: revision.value, name: 'Texto multipágina sintético' }), authorizeAssets: async () => {} })
  const pdfs = []
  for (const profile of ['rgb', 'cmyk']) for (const ids of [['page-1'], scenes.map(s => s.page.id), ['page-1', 'p2', 'p3', 'p5']]) {
    const job = await jobs.create('company', 'actor', 'design', { revision: 1, pages: ids.map(pageId => ({ pageId, ppi: 300 })), bleed: false, cropMarks: false, profile })
    for (const entry of job.pages) {
      const png = Buffer.from(await page.evaluate(id => window.textPages.render(id), entry.pageId), 'base64')
      await jobs.append('company', 'actor', 'design', job.id, entry.pageId, png)
    }
    const bytes = await jobs.finish('company', 'actor', 'design', job.id), pdf = await PDFDocument.load(bytes)
    assert.equal(pdf.getPageCount(), ids.length)
    for (const [index, result] of pdf.getPages().entries()) {
      const scene = scenes.find(s => s.page.id === job.pages[index].pageId)
      assert.ok(Math.abs(result.getWidth() - scene.page.width * 72 / 300) < 0.001)
      assert.ok(Math.abs(result.getHeight() - scene.page.height * 72 / 300) < 0.001)
    }
    const images = pdf.context.enumerateIndirectObjects().map(([, o]) => o).filter(o => o.dict?.get?.(PDFName.of('Subtype'))?.toString() === '/Image')
    assert.equal(images.length, ids.length)
    assert.ok(images.every(o => o.dict.get(PDFName.of('ColorSpace')).toString() === (profile === 'rgb' ? '/DeviceRGB' : '/DeviceCMYK')))
    const name = `${profile}-${ids.length}.pdf`
    await writeFile(resolve(output, name), bytes); pdfs.push(name)
  }
  const collaboration = await page.evaluate(() => window.textPages.verify())
  assert.equal(collaboration.unchanged, true)
  assert.equal(collaboration.rejected, true)
  assert.equal(collaboration.revoked, true)
  await page.evaluate(() => window.textPages.destroy())
  const stale = await jobs.create('company', 'actor', 'design', { revision: 1, pages: [{ pageId: 'page-1', ppi: 300 }], bleed: false, cropMarks: false, profile: 'rgb' })
  revision.value++
  await assert.rejects(jobs.append('company', 'actor', 'design', stale.id, 'page-1', Buffer.from('unused')), { status: 409 })
  assert.deepEqual(errors, [])
  const report = { maxAnchorDrift: Math.max(...measurements.map(m => m.maxDrift)), measurements, workspaceResults, textEditing: true, pinchPan: true, pdfs, collaboration, serverRevisionRejected: true }
  await writeFile(resolve(output, 'result.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ maxAnchorDrift: report.maxAnchorDrift, scenarios: measurements.length, workspaceResults, pdfs, collaboration, serverRevisionRejected: true }))
} finally { await browser?.close(); await new Promise(r => server.close(r)) }
