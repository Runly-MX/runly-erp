// Explicit browser acceptance on the disposable loopback lab, no real ERP login.
import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const artifact=resolve('.artifacts/website-s4'),lab=JSON.parse(await readFile(resolve(artifact,'browser-lab.json'),'utf8')),base=new URL(lab.url)
if(base.hostname!=='127.0.0.1'||base.protocol!=='http:'||base.pathname!=='/lab/')throw Error('Disposable loopback lab required')
let browser,links;const outcomes=[]
before(async()=>{
 browser=await chromium.launch({headless:true})
 const response=await fetch(new URL('/lab/previews',base),{method:'POST',headers:{Origin:base.origin}});assert.equal(response.status,200);links=await response.json();assert.ok(links.every(p=>!p.error))
 await mkdir(resolve(artifact,'browser'),{recursive:true})
})
after(async()=>{await browser?.close();await writeFile(resolve(artifact,'browser/results.json'),JSON.stringify(outcomes,null,2))})
async function context(){
 const ctx=await browser.newContext({viewport:{width:1600,height:1000}})
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='http:'&&u.port===base.port&&(u.hostname==='127.0.0.1'||u.hostname.endsWith('.localhost'))?route.continue():route.abort('blockedbyclient')})
 return ctx
}
for(const [framework,heading]of [['static','S4 Static OK'],['react','S4 React OK'],['vue','S4 Vue OK'],['angular','S4 Angular OK'],['astro','S4 Astro OK'],['next','S4 Next OK']])test(`real ${framework} build executes in private preview`,async()=>{
 const ctx=await context(),page=await ctx.newPage(),link=links.find(p=>p.framework===framework)
 try{
   const failures=[];page.on('pageerror',e=>failures.push(e.message));await page.goto(link.url);await page.getByRole('heading',{name:heading,exact:true}).waitFor()
   assert.equal(new URL(page.url()).hash,'');assert.equal(new URL(page.url()).pathname,'/')
   const cookies=await ctx.cookies(page.url());assert.equal(cookies.length,1);assert.equal(cookies[0].name,'__Host-runly-preview');assert.equal(cookies[0].httpOnly,true);assert.equal(cookies[0].secure,true);assert.equal(cookies[0].sameSite,'Strict');assert.equal(cookies[0].domain,new URL(link.url).hostname)
   assert.deepEqual(failures,[])
   if(framework==='static'){
     await page.waitForFunction(()=>document.body.dataset.script==='OK'&&getComputedStyle(document.body).backgroundColor==='rgb(238, 238, 255)')
     assert.equal(await page.locator('body').getAttribute('data-script'),'OK');assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(238, 238, 255)')
   }
   if(framework==='next'){await page.getByRole('button',{name:'Count 0',exact:true}).click();await page.getByRole('button',{name:'Count 1',exact:true}).waitFor()}
   await page.screenshot({path:resolve(artifact,`browser/${framework}.png`),fullPage:true})
   if(['astro','next'].includes(framework)){await page.goto(new URL('/about/',page.url()).href);await page.getByRole('heading',{name:`S4 ${framework==='next'?'Next':'Astro'} About OK`,exact:true}).waitFor()}
   const missing=await page.evaluate(async()=> (await fetch('/missing-chunk.js')).status);assert.equal(missing,404)
   outcomes.push({case:framework,status:'passed',privateCookie:true,missingAsset404:true})
 }finally{await ctx.close()}
})
test('browser enforces origin, cookie, CSRF, Storage and service-worker isolation',async()=>{
 const ctx=await context(),page=await ctx.newPage()
 try{
   // Seed only synthetic credentials on the isolated lab's administrative origin.
   await page.goto(new URL('/lab/editor/candidate',base).href);await page.getByRole('toolbar',{name:'Atlas WB'}).waitFor()
   assert.equal(await page.evaluate(()=>localStorage.getItem('runly-lab-admin-session')),'synthetic-admin-only')
   await page.goto(links.find(p=>p.framework==='security').url);await page.locator('#result').filter({hasText:'adminStorage'}).waitFor()
   const result=JSON.parse(await page.locator('#result').innerText());assert.equal(result.cookie,'');assert.equal(result.adminStorage,null);assert.equal(result.csrf,'blocked');assert.equal(result.serviceWorker,'blocked');assert.notEqual(result.adminRouteStatus,200)
   const state=await(await fetch(new URL('/lab/security-state',base))).json();assert.equal(state.csrfHits,0)
   const headers=await page.evaluate(async()=>Object.fromEntries((await fetch('/')).headers));assert.match(headers['content-security-policy'],/connect-src 'self'/);assert.equal(headers['access-control-allow-origin'],undefined)
   const csrf=await page.evaluate(async()=> (await fetch('/public/storefront/forms/submit',{method:'POST',body:'{}'})).status);assert.equal(csrf,404)
   const other=links.find(p=>p.framework==='static'),otherPage=await ctx.newPage(),unbootstrapped=await otherPage.goto(new URL('/',other.url).href);assert.equal(unbootstrapped.status(),404);await otherPage.close()
   await page.screenshot({path:resolve(artifact,'browser/isolation.png'),fullPage:true});outcomes.push({case:'isolation',status:'passed',...result,csrfHits:0})
 }finally{await ctx.close()}
})
test('installed 0.2.4 edits, saves, reloads, publishes and opens in 0.2.0',async()=>{
 const ctx=await context(),page=await ctx.newPage()
 try{
   await page.goto(new URL('/lab/editor/candidate',base).href);await page.getByRole('toolbar',{name:'Atlas WB'}).waitFor()
   const initial=await(await fetch(new URL('/lab/state',base))).json();await page.getByRole('heading',{name:initial.document.blocks.hero.props.title,exact:true}).click()
   await page.getByRole('complementary',{name:'Propiedades'}).locator('input[type=text]').first().fill('S4 Playwright persisted 0.2.4')
   await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await page.getByRole('status').filter({hasText:'SAVED 0.2.4'}).waitFor()
   await page.reload();await page.getByRole('heading',{name:'S4 Playwright persisted 0.2.4',exact:true}).waitFor()
   await page.getByRole('button',{name:'Publicar',exact:true}).click();await page.getByRole('status').filter({hasText:'PUBLISHED 0.2.4'}).waitFor()
   await page.goto(new URL('/lab/editor/installed',base).href);await page.getByText('S4 lab 0.2.0',{exact:true}).waitFor();await page.getByRole('heading',{name:'S4 Playwright persisted 0.2.4',exact:true}).waitFor()
   await page.goto(new URL('/lab/preview-builder',base).href);await page.getByRole('heading',{name:'S4 Playwright persisted 0.2.4',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');assert.notEqual(new URL(page.url()).hostname,base.hostname)
   await page.screenshot({path:resolve(artifact,'browser/builder.png'),fullPage:true});outcomes.push({case:'builder-0.2.4-and-reversal',status:'passed'})
 }finally{await ctx.close()}
})
