import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(resolve(root, 'packages/module-compiler/package.json'))
const { build } = require('esbuild')
const output = resolve(root, '.artifacts/studio')
await mkdir(output, { recursive: true })
const bundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/browser.js')], nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', minify: true, write: false })
await writeFile(resolve(output, 'renderer-spike.js'), bundle.outputFiles[0].contents)
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); return }
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="es"><body><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => typeof window.studioVerification === 'function')
  const result = await page.evaluate(() => window.studioVerification())
  assert.deepEqual(result.saved, result.reopened)
  assert.equal(result.saved.objects[0].text, 'Texto modificado')
  assert.equal(result.saved.objects[0].rotation, 12)
  assert.equal(result.reopened.objects[0].scaleX, 1.4); assert.equal(result.reopened.objects[0].scaleY, 0.8)
  assert.equal(result.png.width, 640); assert.equal(result.png.height, 480)
  assert.deepEqual(result.png.blue, [37, 99, 235, 255])
  assert.deepEqual(result.png.image, [245, 158, 11, 255])
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'renderer-spike.png'), fullPage: true })
  await writeFile(resolve(output, 'renderer-result.json'), JSON.stringify({ ...result, fixtureBundleBytes: bundle.outputFiles[0].contents.length }, null, 2))
  console.log(JSON.stringify({ checks: 'editable text/shapes/image roundtrip, PNG dimensions and original image pixels', benchmarks: result.benchmarks, fixtureBundleBytes: bundle.outputFiles[0].contents.length }))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
