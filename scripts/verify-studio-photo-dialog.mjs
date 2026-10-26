import {createRequire} from 'node:module'
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const require=createRequire(resolve('packages/module-compiler/package.json')),desktop=createRequire(resolve('apps/desktop/package.json'))
const {build}=require('esbuild'),directory=resolve('.artifacts/studio/photo-dialog');await mkdir(directory,{recursive:true})
const result=await build({entryPoints:[resolve('scripts/fixtures/studio/photo-dialog.jsx')],nodePaths:[resolve('apps/desktop/node_modules')],bundle:true,platform:'browser',format:'esm',jsx:'automatic',minify:true,write:false,
  loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'},plugins:[{name:'one-react',setup(b){b.onResolve({filter:/^(react|react-dom)(\/.*)?$/},a=>({path:desktop.resolve(a.path)}))}}]})
const assets=resolve('apps/desktop/dist/assets'),css=await readFile(resolve(assets,(await readdir(assets)).find(name=>/^styles-.*\.css$/.test(name))))
const server=createServer((req,res)=>{
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].contents);return}
  if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);return}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>')
})
let browser
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true})
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message))
  const origin=`http://127.0.0.1:${server.address().port}`
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort())
  await page.goto(origin)
  const checks=[]
  for(const full of [true,false]){
    await page.evaluate(()=>window.photoDialogResult=null)
    await page.getByRole('button',{name:full?'Editar a resolución original':'Editar modo Files/Notes',exact:true}).click()
    await page.getByLabel('Imagen en edición',{exact:true}).waitFor()
    await page.getByRole('tab',{name:'Girar',exact:true}).click();await page.getByRole('button',{name:'Girar a la derecha',exact:true}).click()
    const before=page.getByRole('button',{name:'Mantén pulsado para ver el original',exact:true})
    await before.dispatchEvent('pointerdown',{pointerId:1})
    await page.getByLabel('Imagen original',{exact:true}).waitFor();await before.dispatchEvent('pointerup',{pointerId:1})
    await page.screenshot({path:resolve(directory,full?'original-resolution.png':'legacy-resolution.png'),animations:'disabled'})
    await page.getByRole('button',{name:'Guardar copia',exact:true}).click()
    await page.waitForFunction(()=>Boolean(window.photoDialogResult))
    const saved=await page.evaluate(()=>window.photoDialogResult)
    assert.equal(saved.width,full?1200:900);assert.equal(saved.height,full?2400:1800)
    checks.push({mode:full?'Studio original':'Files/Notes default',...saved})
  }
  assert.deepEqual(errors,[]);await writeFile(resolve(directory,'result.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}))
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
