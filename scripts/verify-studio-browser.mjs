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
const bundle = await build({ entryPoints: [resolve(root, 'scripts/fixtures/studio/browser.js')], nodePaths: [resolve(root, 'apps/desktop/node_modules')], bundle: true, platform: 'browser', format: 'esm', minify: true, write: false,define:{'import.meta.env.BASE_URL':JSON.stringify('/')} })
await writeFile(resolve(output, 'renderer-spike.js'), bundle.outputFiles[0].contents)
const server = createServer((request, response) => {
  if (/^\/studio-fonts\/[a-z0-9-]+\.ttf$/.test(request.url)) {
    readFile(resolve(root,'apps/desktop/public',request.url.slice(1))).then(bytes=>{response.setHeader('Content-Type','font/ttf');response.end(bytes)},()=>{response.writeHead(404);response.end()});return
  }
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
  result.shapes=await page.evaluate(()=>window.studioShapeVerification())
  result.multimedia = await page.evaluate(() => window.studioPhotoVerification())
  result.advanced=await page.evaluate(()=>window.studioAdvancedVerification())
  result.remoteResource=await page.evaluate(()=>window.studioRemoteResourceVerification())
  result.rc2Export=await page.evaluate(()=>window.rc2ExportVerification())
  for(const zoom of [1,0.5,2]){
    const box=await page.evaluate(z=>window.setupStudioSnap(z),zoom)
    await page.mouse.move(box.x+130*zoom,box.y+130*zoom);await page.mouse.down();await page.mouse.move(box.x+300*zoom-2,box.y+130*zoom,{steps:5});await page.mouse.up()
    const snapped=await page.evaluate(()=>({doc:window.snapTest.editor.snapshot(),guides:window.snapTest.guides}))
    assert.ok(Math.abs(snapped.doc.objects[0].x-270)<1e-6,`screen-pixel snapping at zoom ${zoom}: ${snapped.doc.objects[0].x}`)
    assert.ok(snapped.guides.some(gs=>gs.some(g=>g.axis==='x'&&g.position===320)))
    assert.deepEqual(snapped.guides.at(-1),[])
    await page.evaluate(()=>window.snapTest.editor.undo())
    await page.keyboard.down('Alt');await page.mouse.move(box.x+130*zoom,box.y+130*zoom);await page.mouse.down();await page.mouse.move(box.x+300*zoom-2,box.y+130*zoom,{steps:5});await page.mouse.up();await page.keyboard.up('Alt')
    assert.ok(Math.abs((await page.evaluate(()=>window.snapTest.editor.snapshot())).objects[0].x-(270-2/zoom))<1e-6)
    await page.evaluate(()=>window.snapTest.editor.destroy())
  }
  assert.deepEqual(result.saved, result.reopened)
  for(const [zoom,width,rotation,pan]of [[1,300,0,0],[0.5,301,0,30],[2,300,30,-10],[1,301,-20,20]]){
    const {bounds,cx,cy}=await page.evaluate(options=>window.setupCanonicalSnap(options),{zoom,width,rotation,pan})
    await page.mouse.move(bounds.x+cx*zoom,bounds.y+cy*zoom);await page.mouse.down();await page.mouse.move(bounds.x+540*zoom-2,bounds.y+cy*zoom,{steps:6});await page.mouse.up()
    const item=(await page.evaluate(()=>window.snapTest.editor.snapshot())).objects[0],a=item.rotation*Math.PI/180,center=item.x+item.width/2*Math.cos(a)-item.height/2*Math.sin(a)
    assert.ok(Math.abs(center-540)<1e-6,`canonical ellipse center at guide 540: ${center} (zoom=${zoom}, width=${width}, rotation=${rotation})`)
    await page.evaluate(()=>window.snapTest.editor.destroy())
  }
  assert.equal(result.saved.objects[0].text, 'Texto modificado')
  assert.equal(result.saved.objects[0].rotation, 12)
  assert.equal(result.reopened.objects[0].scaleX, 1.4); assert.equal(result.reopened.objects[0].scaleY, 0.8)
  assert.equal(result.png.width, 640); assert.equal(result.png.height, 480)
  assert.deepEqual(result.png.blue, [37, 99, 235, 255])
  assert.deepEqual(result.png.image, [245, 158, 11, 255])
  assert.ok(result.fonts.length>=6);assert.equal(result.vector.recolorPixels,true)
  assert.deepEqual(errors, [])
  const failedContext=await browser.newContext(),failedPage=await failedContext.newPage()
  await failedPage.route('**/studio-fonts/pacifico.ttf',route=>route.abort())
  await failedPage.goto(`http://127.0.0.1:${server.address().port}`)
  await failedPage.waitForFunction(()=>typeof window.studioFontFailure==='function')
  result.fontFailure=await failedPage.evaluate(()=>window.studioFontFailure());await failedContext.close()
  await page.screenshot({ path: resolve(output, 'renderer-spike.png'), fullPage: true })
  await writeFile(resolve(output, 'renderer-result.json'), JSON.stringify({ ...result, fixtureBundleBytes: bundle.outputFiles[0].contents.length }, null, 2))
  console.log(JSON.stringify({ checks: 'editable text/shapes/image roundtrip, PNG dimensions and original image pixels', benchmarks: result.benchmarks, fixtureBundleBytes: bundle.outputFiles[0].contents.length }))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
