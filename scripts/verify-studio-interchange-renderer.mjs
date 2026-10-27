import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { buildPrintPdf } from '../apps/api/src/routes/studio/studio-print.js'
const root = process.cwd(), output = resolve('.artifacts/studio/interchange')
const require = createRequire(resolve('packages/module-compiler/package.json')), apiRequire = createRequire(resolve('apps/api/package.json'))
const { build } = require('esbuild'), { PDFDocument, PDFName } = apiRequire('pdf-lib')
const payload = JSON.parse(await readFile(resolve(output, 'roundtrip.json'), 'utf8'))
const bundle = await build({ entryPoints: [resolve('scripts/fixtures/studio/interchange-renderer.js')], nodePaths: [resolve('apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', write: false, define: { 'import.meta.env.BASE_URL': JSON.stringify('/') } })
const server = createServer(async (req, res) => {
  if (/^\/studio-fonts\/[a-z0-9-]+\.ttf$/.test(req.url)) { res.end(await readFile(resolve(root, 'apps/desktop/public', req.url.slice(1)))); return }
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].contents); return }
  res.end('<!doctype html><html><body><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
try {
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.waitForFunction(() => !!window.verifyInterchangeRendering)
  const result = await page.evaluate(data => window.verifyInterchangeRendering(data), payload)
  for (const profile of ['rgb', 'cmyk']) {
    const originals = await PDFDocument.create(), imported = await PDFDocument.create()
    for (const [index, entry] of result.pages.entries()) {
      const sources = []
      for (const [label, destination] of [['source', originals], ['destination', imported]]) {
        const png = Buffer.from(entry[label], 'base64')
        await writeFile(resolve(output, `${label}-${index + 1}.png`), png)
        const pdf = await PDFDocument.load(await buildPrintPdf({ image: png, widthMm: entry.width / 300 * 25.4, heightMm: entry.height / 300 * 25.4, profile, title: 'Portable roundtrip' }))
        const images = pdf.context.enumerateIndirectObjects().map(([, o]) => o).filter(o => o.dict?.get?.(PDFName.of('Subtype'))?.toString() === '/Image')
        assert.equal(images.length, 1); sources.push(images[0].getContents())
        const [copy] = await destination.copyPages(pdf, [0]); destination.addPage(copy)
      }
      assert.deepEqual(sources[0], sources[1], 'Embedded PDF pixels differ after import')
    }
    await writeFile(resolve(output, `${profile}-source.pdf`), await originals.save())
    await writeFile(resolve(output, `${profile}-imported.pdf`), await imported.save())
  }
  assert.deepEqual(errors, [])
  const report = { pages: result.pages.map(({ source: _source, destination: _destination, ...dimensions }) => dimensions), unchanged: result.unchanged, undoRedo: result.undoRedo, pdfProfiles: ['rgb','cmyk'], errors }
  await writeFile(resolve(output, 'renderer-result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report))
} finally { await browser?.close(); await new Promise(r => server.close(r)) }
