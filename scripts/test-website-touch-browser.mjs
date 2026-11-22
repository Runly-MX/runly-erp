// Disposable loopback: actual public route, SSR and hydration; no database or publication.
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {once} from 'node:events'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {chromium,webkit} from 'playwright'
import {buildWebsitePublicRuntime,buildWebsiteSsr} from './build-website-public-runtime.mjs'
import {serveWebsiteRelease,createPublicReleaseRoutes} from '../apps/api/src/routes/website/public-release-routes.js'
const require=createRequire(new URL('../apps/api/package.json',import.meta.url))
const {Hono}=require('hono'),{serve}=require('@hono/node-server')

test('public touch: legacy viewport, release hydration, native links and mobile menu', {timeout:90000},async()=>{
 const output=resolve('.artifacts/website-touch');await mkdir(output,{recursive:true})
 const candidate=process.env.WEBSITE_TEST_ATLAS_ROOT?{atlasRoot:process.env.WEBSITE_TEST_ATLAS_ROOT}:{}
 const files=await buildWebsitePublicRuntime(null,candidate),ssr=await buildWebsiteSsr(null,files['entry.js'].hash,candidate)
 await writeFile(resolve(output,'ssr.mjs'),ssr)
 const {renderPage}=await import(pathToFileURL(resolve(output,'ssr.mjs')).href)
 const doc={schemaVersion:1,id:'touch',title:'Touch',slug:'/',visibility:'public',regions:{main:{children:['nav','heading','button']}},blocks:{
  nav:{id:'nav',type:'NavbarBlock',props:{brand:'Touch site',links:'Destino | /destination',ctaLabel:'',mobileBreakpoint:'768px'}},
  heading:{id:'heading',type:'HeadingBlock',props:{text:'Public touch',level:'h1'}},
  button:{id:'button',type:'ButtonBlock',props:{label:'Visit destination',href:'/destination',newTab:false}},
 },seo:{}}
 if(candidate.atlasRoot){doc.regions.main.children.push('responsive');doc.blocks.responsive={id:'responsive',type:'TextElementBlock',props:{text:'Responsive public',tag:'h2',fontSize:48,tabletFontSize:36,mobileFontSize:24,widthMode:'fill'}}}
 const pageData={id:'touch-page',title:'Touch',path:'/',publishedBuilderData:doc}
 const site={id:'touch-site',sourceType:'builder',company:'touch-company'}
 const release={id:'touch-release',manifest:{kind:'builder',identity:{},runtime:{assets:files}}}
 let legacy=false
 const gateway={resolve:async()=>({site,release:legacy?null:release}),response:()=>({site,page:pageData,theme:{}}),asset:async(c,id,hash)=>Object.values(files).find(f=>f.hash===hash)}
 const app=new Hono()
 app.route('/public/website',createPublicReleaseRoutes({gateway,runtime:async()=>files}))
 app.get('/public/website/resolve',c=>c.json({site,page:pageData,theme:{},releaseId:legacy?null:release.id}))
 app.get('/destination',c=>c.html('<h1>Destination reached</h1>'))
 app.get('/',c=>serveWebsiteRelease(c,gateway,'/',async()=>files,async args=>renderPage(args)))
 const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});if(!server.listening)await once(server,'listening')
 const url=`http://127.0.0.1:${server.address().port}`,results=[]
 try{
  for(const [name,engine]of [['chromium',chromium],['webkit',webkit]]){
   const browser=await engine.launch()
   try{
    for(legacy of [true,false]){
     const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage(),errors=[]
     page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
     await page.goto(url)
     const viewport=await page.locator('meta[name=viewport]').count()
     if(process.env.WEBSITE_TOUCH_BASELINE)results.push({name,legacy,viewport})
     else assert.equal(viewport,1,'Historical HTML must declare a mobile viewport')
     if(!viewport){await page.screenshot({path:resolve(output,`${name}-legacy-before.png`)});await context.close();continue}
     await page.getByRole('heading',{name:'Public touch',exact:true}).waitFor()
     await page.screenshot({path:resolve(output,`${name}-${legacy?'legacy':'release'}-loaded.png`)})
     const menu=page.getByRole('button',{name:'Abrir menú',exact:true})
     await menu.tap();await page.getByRole('button',{name:'Cerrar menú',exact:true}).waitFor()
     const hit=await page.getByRole('button',{name:'Cerrar menú',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})
     assert.equal(hit,true)
     await page.screenshot({path:resolve(output,`${name}-${legacy?'legacy':'release'}-portrait.png`)})
     await page.getByRole('link',{name:'Destino',exact:true}).filter({visible:true}).tap();await page.getByRole('heading',{name:'Destination reached'}).waitFor()
     await page.goto(url);await page.getByRole('link',{name:'Visit destination',exact:true}).tap();await page.getByRole('heading',{name:'Destination reached'}).waitFor()
     for(const size of [{width:320,height:700},{width:430,height:932},{width:844,height:390}]){
      await page.setViewportSize(size);await page.goto(url);await page.getByRole('heading',{name:'Public touch',exact:true}).waitFor()
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Public page horizontal overflow')
      await page.screenshot({path:resolve(output,`${name}-${legacy?'legacy':'release'}-${size.width}.png`)})
     }
     if(candidate.atlasRoot)for(const width of [320,360,390,768,820,1024,1280,1440,1920]){
      await page.setViewportSize({width,height:900});await page.goto(url)
      const heading=page.getByRole('heading',{name:'Responsive public',exact:true});await heading.waitFor()
      assert.equal(await heading.evaluate(node=>getComputedStyle(node).fontSize),width<640?'24px':width<1024?'36px':'48px')
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'SSR/hydration candidate overflow')
     }
     assert.deepEqual(errors,[]);results.push({name,legacy,hydration:legacy?'client render':'SSR hydrate',passed:true,physicalIOS:false});await context.close()
    }
   }finally{await browser.close()}
  }
  await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2))
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
