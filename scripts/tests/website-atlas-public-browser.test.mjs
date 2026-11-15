import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {chromium} from 'playwright'
import {sectionsToAtlasPage} from '../../packages/studio-interchange/src/website-document.js'
import {buildWebsitePublicRuntime,buildWebsiteSsr} from '../build-website-public-runtime.mjs'

test('published Atlas 0.6 renders responsive geometry in the real ERP public runtime and SSR',async()=>{
  const output=resolve('.artifacts/atlas-0.6.0-public')
  const files=await buildWebsitePublicRuntime(output)
  assert.equal(files['entry.js'].rendererVersion,'0.6.0')
  await buildWebsiteSsr(output,files['entry.js'].hash)
  const {renderPage}=await import(pathToFileURL(resolve(output,'ssr.mjs')))
  const document=sectionsToAtlasPage({path:'/',title:'Prueba pública',sections:[
    {type:'BoxBlock',props:{layout:'free',tabletLayout:'free',mobileLayout:'free',heightMode:'fixed',height:500,widthMode:'fill'},children:{children:[
      {type:'TextElementBlock',props:{text:'Geometría publicada',position:'absolute',offsetX:100,offsetY:40,widthMode:'fixed',width:280,heightMode:'fixed',height:80,tabletOffsetX:60,tabletWidth:240,mobileAnchorX:'center',mobileOffsetX:0,mobileWidthMode:'percent',mobileWidthPercent:80,mobileOffsetY:100}},
    ]}},
  ]})
  const snapshot={releaseId:'atlas-test',site:{id:'laboratory',company:'laboratory'},page:{publishedBuilderData:document},theme:null}
  const ssr=renderPage({page:snapshot.page,theme:null,config:{}})
  assert.ok(ssr.hydrate);assert.match(ssr.html,/Geometría publicada/)
  const errors=[],server=createServer((req,res)=>{
    const path=new URL(req.url,'http://example.test').pathname
    if(path==='/public/website/resolve'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(snapshot));return}
    const file=files[path.slice(1)]
    if(file){res.setHeader('Content-Type',file.mime);res.end(file.bytes);return}
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html data-release="atlas-test"><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><style>body{margin:0}</style></head><body><div id="runly-public-root" data-ssr="hydrate">${ssr.html}</div><script type="module" src="/entry.js"></script></body></html>`)
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  let browser
  try{
    browser=await chromium.launch({headless:true})
    const page=await browser.newPage()
    page.on('pageerror',error=>errors.push(error.message))
    for(const width of [1280,900,768,600,375]){
      await page.setViewportSize({width,height:800})
      await page.goto(`http://127.0.0.1:${server.address().port}/`)
      await page.waitForFunction(()=>window.RUNLY_CONFIG?.siteId==='laboratory')
      const text=page.locator('.atlas-element-text').filter({hasText:'Geometría publicada'})
      const rect=await text.boundingBox()
      const mobile=width<640,tablet=width<1024
      const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1,`${width}: ${actual} != ${expected}`)
      near(rect.width,mobile?width*.8:tablet?240:280)
      near(rect.x,mobile?width*.1:tablet?60:100)
      near(rect.y,mobile?100:40)
      near(rect.height,80)
    }
    assert.deepEqual(errors,[])
    await mkdir(output,{recursive:true});await page.screenshot({path:resolve(output,'mobile.png')})
    await writeFile(resolve(output,'result.json'),JSON.stringify({version:'0.6.0',widths:[1280,900,768,600,375],ssr:true,hydrationErrors:errors}))
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})
