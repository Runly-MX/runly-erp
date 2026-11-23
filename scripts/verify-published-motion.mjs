// Real-browser check of the ERP PUBLISHED-page pipeline for Phase 3: the same SSR module and public runtime that published sites use
// render a page with every effect; Chromium and WebKit verify server-visible content, hydration, reduced motion, the overflow sweep
// 320-1920, fluid type, focal point and Ken Burns. Tooling lives in the sibling Atlas checkout (scripts/lib/browser.mjs).
//   node scripts/verify-published-motion.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { buildWebsitePublicRuntime, buildWebsiteSsr } from './build-website-public-runtime.mjs'

const atlasRoot = resolve(fileURLToPath(new URL('../../atlas-web-builder/', import.meta.url)))
const { inEngines, serve, tools } = await import(pathToFileURL(join(atlasRoot, 'scripts/lib/browser.mjs')).href)
const { auditOverflow, overflowFailures, DEFAULT_WIDTHS } = await import(pathToFileURL(join(atlasRoot, 'scripts/audit-overflow.mjs')).href)

const png = await tools().sharp({ create: { width: 1600, height: 800, channels: 3, background: '#3b5bdb' } }).png().toBuffer()
const dataUrl = `data:image/png;base64,${png.toString('base64')}`
const publishedBuilderData = {
  schemaVersion: 1, id: 'published', slug: '/', title: 'Publicada', visibility: 'public', seo: {},
  regions: { main: { id: 'main', children: ['headline', 'intro', 'spacer', 'reveal', 'kb', 'photo', 'slide', 'cta'] } },
  blocks: {
    headline: { id: 'headline', type: 'TextElementBlock', props: { text: 'Titular fluido', tag: 'h1', widthMode: 'fill', fluidType: true, fontSizeMin: 20, fontSizeMax: 48, _animation: { preset: 'slide-up', distance: 60, duration: 700 } }, children: {} },
    intro: { id: 'intro', type: 'TextElementBlock', props: { text: 'Texto de entrada visible desde el servidor', widthMode: 'fill', _animation: { preset: 'blur-in', blur: 12 }, _scrollReveal: true }, children: {} },
    spacer: { id: 'spacer', type: 'BoxBlock', props: { widthMode: 'fill', minHeight: 1400 }, children: { children: [] } },
    reveal: { id: 'reveal', type: 'TextElementBlock', props: { text: 'Aparece al hacer scroll', widthMode: 'fill', _animation: { preset: 'zoom-in', scaleFrom: 0.8 }, _scrollReveal: true, _parallax: { speed: 0.25 } }, children: {} },
    kb: { id: 'kb', type: 'ImageElementBlock', props: { src: dataUrl, alt: 'Ken Burns', widthMode: 'fill', fit: 'cover', imageHeight: 320, focalX: 20, focalY: 30, mobileFocalX: 60, mobileFocalY: 40, _kenburns: { zoom: 1.2, pan: 'left', duration: 6000 } }, children: {} },
    photo: { id: 'photo', type: 'ImageBlock', props: { src: dataUrl, alt: 'Foto', aspectRatio: '16 / 9', objectFit: 'cover', width: '100%', focalX: 20, focalY: 30, mobileFocalX: 60, mobileFocalY: 40 }, children: {} },
    slide: { id: 'slide', type: 'TextElementBlock', props: { text: 'Entra desde la derecha', widthMode: 'fill', _animation: { preset: 'slide-left', distance: 400 }, _scrollReveal: true }, children: {} },
    cta: { id: 'cta', type: 'ButtonElementBlock', props: { label: 'Comprar', href: '#', _hover: { scale: '1.05', duration: 100 }, _pressed: { scale: 0.95 } }, children: {} },
  },
}
const page = { id: 'page-1', title: 'Publicada', routePath: '/', publishedBuilderData }
const theme = { tokens: { fluid: { enabled: true } } }
const snapshot = { releaseId: 'rehearsal', site: { id: 'site-1', company: 'demo', analyticsMode: 'off' }, page, theme }

const runtime = await buildWebsitePublicRuntime()
const scratch = mkdtempSync(join(tmpdir(), 'published-motion-'))
let server
try {
  await buildWebsiteSsr(scratch, runtime['entry.js'].hash)
  const { renderPage } = await import(pathToFileURL(join(scratch, 'ssr.mjs')).href)
  const { html } = renderPage({ page, theme, config: { company: 'demo', apiUrl: 'http://localhost' } })
  assert.ok(html.includes('Texto de entrada visible desde el servidor'))
  assert.ok(!/opacity:\s*0(?![.\d])/.test(html) && !html.includes('atlas-reveal--pending') && !/visibility:\s*hidden/.test(html), 'published server HTML hides content')

  // Commerce and account markers render on the server without a site configured (no network, no hidden content).
  const commerce = { schemaVersion: 1, id: 'c', slug: '/carrito', title: 'Carrito', visibility: 'public', seo: {}, regions: { main: { id: 'main', children: ['cart', 'thanks', 'account'] } }, blocks: {
    cart: { id: 'cart', type: 'CartPageBlock', props: { mode: 'cart' }, children: {} }, thanks: { id: 'thanks', type: 'CartPageBlock', props: { mode: 'thanks' }, children: {} }, account: { id: 'account', type: 'AccountPortalBlock', props: {}, children: {} } } }
  const shop = renderPage({ page: { id: 'p2', title: 'Carrito', routePath: '/carrito', publishedBuilderData: commerce }, theme, config: { company: 'demo', apiUrl: 'http://localhost' } }).html
  assert.ok(shop.includes('Gracias por tu compra') && !/opacity:\s*0(?![.\d])/.test(shop), 'commerce markers render on the server')

  const document = (withScript) => `<!doctype html><html lang="es" data-release="rehearsal"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="margin:0"><div id="runly-public-root" data-ssr="hydrate">${html}</div>${withScript ? '<script type="module" src="/entry.js"></script>' : ''}</body></html>`
  server = await serve({
    '/': { body: document(true) }, '/nojs': { body: document(false) },
    '/style.css': { body: runtime['style.css'].bytes, type: 'text/css' }, '/entry.js': { body: runtime['entry.js'].bytes, type: 'text/javascript' },
    '/public/website/resolve': { body: JSON.stringify(snapshot), type: 'application/json' },
  })
  const origin = server.origin
  const summary = await inEngines(async (browserPage, engine, errors) => {
    // Without JavaScript the published page is complete and visible.
    const noJs = await browserPage.context().browser().newContext({ javaScriptEnabled: false })
    const bare = await noJs.newPage(); await bare.goto(`${origin}/nojs`); await bare.waitForTimeout(1200)
    for (const text of ['Titular fluido', 'Texto de entrada visible desde el servidor', 'Aparece al hacer scroll', 'Entra desde la derecha']) {
      const opacity = await bare.getByText(text).evaluate((node) => { let value = 1; for (let n = node; n; n = n.parentElement) value *= Number(getComputedStyle(n).opacity); return value })
      assert.equal(opacity, 1, `${engine}: "${text}" visible without JavaScript`)
    }
    await noJs.close()
    // Hydration with the real runtime, then the sweep.
    await browserPage.goto(`${origin}/`); await browserPage.waitForTimeout(800)
    const sweep = await auditOverflow(browserPage, { url: `${origin}/`, widths: DEFAULT_WIDTHS })
    assert.deepEqual(overflowFailures(sweep), [], `${engine}: overflow ${JSON.stringify(overflowFailures(sweep))}`)
    const sizes = {}
    for (const width of [360, 820, 1280]) { await browserPage.setViewportSize({ width, height: 900 }); await browserPage.goto(`${origin}/`); sizes[width] = await browserPage.getByText('Titular fluido').evaluate((node) => parseFloat(getComputedStyle(node).fontSize)) }
    assert.ok(Math.abs(sizes[360] - 20) < 0.6 && Math.abs(sizes[820] - 34) < 0.8 && Math.abs(sizes[1280] - 48) < 0.6, `${engine}: fluid ${JSON.stringify(sizes)}`)
    await browserPage.setViewportSize({ width: 390, height: 844 }); await browserPage.goto(`${origin}/`)
    assert.deepEqual(await browserPage.evaluate(() => [...document.querySelectorAll('img')].map((img) => getComputedStyle(img).objectPosition)), ['60% 40%', '60% 40%'], `${engine}: mobile focal`)
    assert.equal(await browserPage.locator('.atlas-kenburns').count(), 1)
    assert.deepEqual(errors.filter((message) => !/Failed to load resource|favicon/i.test(message)), [], `${engine}: console errors`)
    return { sizes, overflowWidths: DEFAULT_WIDTHS.length }
  })
  const reduced = await inEngines(async (browserPage, engine) => {
    await browserPage.goto(`${origin}/`)
    await browserPage.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((done) => setTimeout(done, 30)) } })
    await browserPage.waitForTimeout(500)
    const running = await browserPage.evaluate(() => document.getAnimations().filter((a) => /^atlas-/.test(a.animationName ?? '')).length)
    assert.equal(running, 0, `${engine}: reduced motion leaves ${running} effect animations`)
    assert.equal(await browserPage.locator('.atlas-reveal--pending').count(), 0)
    return {}
  }, { context: { reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } } })
  console.log(JSON.stringify({ ok: true, runtime: runtime['entry.js'].rendererVersion, engines: summary.map((s) => s.engine), reducedMotionEngines: reduced.map((r) => r.engine), sizes: summary[0].sizes }, null, 1))
} finally { await server?.close(); rmSync(scratch, { recursive: true, force: true }); void writeFileSync }
