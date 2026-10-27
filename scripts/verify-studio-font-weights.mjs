// Real UI + FontFace + Fabric + PNG; local files only, no API or database.
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import {chromium} from 'playwright'
const root=resolve('.'),output=resolve('.artifacts/studio/font-weights')
await mkdir(output,{recursive:true})
const require=createRequire(resolve('packages/module-compiler/package.json')),{build}=require('esbuild')
const desktopRequire=createRequire(resolve('apps/desktop/package.json'))
const built=await build({entryPoints:[resolve('scripts/fixtures/studio/font-weights.jsx')],nodePaths:[resolve('apps/desktop/node_modules')],bundle:true,platform:'browser',format:'esm',jsx:'automatic',write:false,minify:true,define:{'import.meta.env.BASE_URL':JSON.stringify('/')},loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'},plugins:[{name:'react',setup(b){b.onResolve({filter:/^(react|react-dom)(\/.*)?$/},args=>({path:desktopRequire.resolve(args.path)}))}}]})
let css=''
try{for(const file of await readdir('apps/desktop/dist/assets'))if(file.endsWith('.css'))css+=await readFile(resolve('apps/desktop/dist/assets',file),'utf8')}catch{}
const server=createServer(async(req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(built.outputFiles[0].contents);return}
  if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return}
  if(/^\/studio-fonts\/[a-z0-9-]+\.ttf$/.test(req.url)){
    try{res.setHeader('Content-Type','font/ttf');res.end(await readFile(resolve(root,'apps/desktop/public',req.url.slice(1))))}catch{res.writeHead(404);res.end()}
    return
  }
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
let browser,page
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  browser=await chromium.launch({channel:'chrome',headless:true})
  page=await browser.newPage({viewport:{width:1200,height:800}})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const origin=`http://127.0.0.1:${server.address().port}`
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  await page.goto(origin);await page.waitForFunction(()=>window.fontWeightsEditor)
  const result=await page.evaluate(()=>window.verifyFontFaces())
  const selector=page.getByRole('combobox',{name:'Estilo de la fuente',exact:true})
  await selector.click();assert.equal(await page.getByRole('option').count(),18)
  await page.getByRole('option',{name:'Fina',exact:true}).click()
  await page.waitForFunction(()=>window.fontWeightsEditor.snapshot().objects[0].fontVariant==='thin')
  await selector.click();await page.getByRole('option',{name:'Extranegrita',exact:true}).click()
  await page.waitForFunction(()=>window.fontWeightsEditor.snapshot().objects[0].fontVariant==='extrabold')
  await selector.click();await page.getByRole('option',{name:'Negrita cursiva',exact:true}).click()
  await page.waitForFunction(()=>window.fontWeightsEditor.snapshot().objects[0].fontVariant==='boldItalic')
  const size=page.getByRole('textbox',{name:'Tamaño de letra',exact:true})
  await size.fill('144');await size.press('Tab')
  await page.waitForFunction(()=>window.fontWeightsEditor.snapshot().objects[0].fontSize===144)
  await page.evaluate(async()=>{window.fontWeightsEditor.patch({fontSize:64});await window.fontWeightsEditor.flush()})
  result.document=await page.evaluate(()=>window.fontWeightsEditor.snapshot())
  result.png=await page.evaluate(async()=>{
    const blob=await window.fontWeightsEditor.exportPng(),image=await createImageBitmap(blob)
    const result={width:image.width,height:image.height,bytes:blob.size};image.close();return result
  })
  assert.equal(result.png.width,1000);assert.equal(result.png.height,300)
  assert.equal(result.document.objects[0].fontVariant,'boldItalic')
  result.reopened=await page.evaluate(()=>window.verifyReopenedWeight())
  assert.deepEqual(errors,[])
  await page.evaluate(()=>window.fontWeightsEditor.select(window.fontWeightsEditor.snapshot().objects[0].id))
  await selector.waitFor();await selector.click()
  await page.screenshot({path:resolve(output,'weights-menu.png')})
  await page.keyboard.press('Escape')
  await page.screenshot({path:resolve(output,'bold-italic-ui.png')})
  await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2))
  await page.evaluate(()=>window.fontWeightsEditor.destroy())
  console.log(JSON.stringify({passed:true,faces:result.faces,familiesTested:result.samples.map(s=>s.family),stylesInSelector:18,png:result.png}))
}catch(error){if(page){await page.screenshot({path:resolve(output,'failure.png')}).catch(()=>{});console.log(await page.locator('body').innerText());console.log(await page.evaluate(()=>({root:document.getElementById('root').innerHTML.slice(0,1500),scene:window.fontWeightsEditor?.snapshot()})))}throw error}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
