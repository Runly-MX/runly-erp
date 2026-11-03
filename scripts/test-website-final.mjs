import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import {get as httpGet} from 'node:http'
import pg from 'pg'
import {chromium} from 'playwright'
// Final consolidated checks that no earlier script covers: cross-company opacity on
// every Website mutation added since S4, secret-free public output, and keyboard,
// landmark and accessible-name checks of the real UI.
const dir='.artifacts/website-integration',c=JSON.parse(await readFile(dir+'/private.json','utf8'))
if(!/^runly-studio-e2e-[a-f0-9]+$/.test(c.name)||!c.env.DATABASE_URL.includes(`@127.0.0.1:${c.ports.db}/`))throw Error('DISPOSABLE_LAB_REQUIRED')
const db=new pg.Pool({connectionString:c.env.DATABASE_URL}),results=[],errors=[]
assert.equal((await db.query('SELECT id FROM runly_studio_test.environment')).rows[0].id,c.name)
const key=()=>randomBytes(20).toString('hex'),suffix=Date.now().toString(36),company=c.companies[0].id
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS',name)}
async function login(index){const r=await fetch(c.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:c.users[index].email,password:c.users[index].password})});assert.equal(r.status,200);return (await r.json()).data.access_token}
async function call(path,{method='GET',body,auth,companyId=company}={}){
 const r=await fetch(c.urls.api+path,{method,headers:{Authorization:`Bearer ${auth}`,'X-Runly-Company-Id':companyId,'Content-Type':'application/json','Idempotency-Key':key()},...(body!==undefined&&{body:JSON.stringify(body)})})
 return {status:r.status,text:await r.text()}
}
const browser=await chromium.launch({headless:true})
try{
 const owner=await login(0),foreign=await login(3),secret='Final Secret Site '+suffix
 const created=await call('/website/sites',{method:'POST',auth:owner,body:{name:secret}});assert.equal(created.status,201)
 const site=JSON.parse(created.text).data.id
 await check('foreign company cannot read or mutate any Website resource of another company',async()=>{
  const state=JSON.parse((await call(`/website/sites/${site}/state`,{auth:owner})).text).data
  const attempts=[
   ['GET',`/website/sites/${site}`],['GET',`/website/sites/${site}/state`],['GET',`/website/sites/${site}/pages`],
   ['GET',`/website/sites/${site}/blog/posts`],['GET',`/website/sites/${site}/catalog/products`],
   ['PUT',`/website/sites/${site}/catalog/selection`,{productIds:[],expectedRevision:0}],
   ['POST',`/website/sites/${site}/templates/atlas-negocio/apply`,{pageIds:['home'],expectedRevision:state.draftRevision}],
   ['POST',`/website/sites/${site}/releases`,{kind:'builder',expectedDraftRevision:state.draftRevision,expectedPublicationRevision:state.publicationRevision,baseReleaseId:null,changes:{publishPageIds:[],unpublishPostIds:['00000000-0000-7000-8000-000000000001']}}],
   ['PATCH',`/website/site/${site}`,{name:'hijacked'}],
  ]
  for(const [method,path,body] of attempts)for(const companyId of [c.companies[1].id,company]){
   const r=await call(path,{method,body,auth:foreign,companyId})
   assert.ok([400,403,404].includes(r.status),`${method} ${path} with ${companyId===company?'company A header':'own company header'}: ${r.status} ${r.text.slice(0,200)}`)
   assert.ok(!r.text.includes(secret),`${method} ${path} leaked the site name`)
  }
  assert.equal(JSON.parse((await call(`/website/sites/${site}`,{auth:owner})).text).data.name,secret)
 })
 await check('public output never exposes operational credentials',async()=>{
  const saved=await call(`/website/site/${site}`,{method:'PATCH',auth:owner,body:{stripeSecretKey:'sk_test_final_secret_'+suffix,turnstileSecretKey:'turnstile_final_secret_'+suffix}})
  assert.equal(saved.status,200)
  assert.ok(!saved.text.includes('final_secret_'+suffix),'admin response echoes a secret')
  const host=`final-${site}.content.localhost`
  await db.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true) ON CONFLICT DO NOTHING",[host,company,site])
  const body=await new Promise((resolve,reject)=>httpGet(c.urls.api+'/public/website/resolve?path=/',{headers:{Host:host}},r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>resolve(d))}).on('error',reject))
  assert.ok(!/final_secret|sk_test|smtp/i.test(body),'public resolve body contains a secret-like value')
 })
 await check('real UI: landmarks, accessible names, keyboard, dark and mobile',async()=>{
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});await ctx.route('**/*',r=>{const u=new URL(r.request().url());return u.protocol==='http:'&&Object.values(c.ports).includes(Number(u.port))&&(u.hostname==='127.0.0.1'||u.hostname.endsWith('.localhost'))?r.continue():r.abort()})
  const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto(c.urls.web+'/app/');await page.getByLabel('Correo o nombre de usuario').fill(c.users[0].email);await page.locator('#password').fill(c.users[0].password)
  await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL('**/app/home')
  for(const section of ['overview','pages','blog','forms','catalog','appearance','settings']){
   await page.goto(c.urls.web+`/app/m/runly.website/sites/${site}/${section}`);await page.getByRole('navigation',{name:'Secciones del sitio'}).waitFor()
   assert.equal(await page.getByRole('main').count(),1,`${section}: exactly one main landmark`)
   const unnamed=await page.evaluate(()=>[...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab]')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;return !(e.getAttribute('aria-label')||e.getAttribute('aria-labelledby')||e.textContent.trim()||e.getAttribute('title')||e.labels?.length||e.getAttribute('placeholder'))}).map(e=>e.outerHTML.slice(0,100)))
   assert.deepEqual(unnamed,[],`${section}: controls without accessible name`)
  }
  await page.goto(c.urls.web+`/app/m/runly.website/sites/${site}/overview`);await page.getByRole('navigation',{name:'Secciones del sitio'}).waitFor()
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(()=>document.activeElement&&document.activeElement!==document.body),'Tab moves focus into the page')
  await page.getByRole('button',{name:'Publicar'}).first().focus();await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await dialog.waitFor()
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  await page.setViewportSize({width:390,height:800});await page.emulateMedia({colorScheme:'dark'})
  for(const section of ['overview','pages','blog','catalog','appearance']){
   await page.goto(c.urls.web+`/app/m/runly.website/sites/${site}/${section}`);await page.getByRole('region').first().waitFor();await page.waitForTimeout(400)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${section}: no horizontal scroll at 390px`)
  }
  await ctx.close()
 })
 assert.deepEqual(errors,[]);console.log('PASS',results.length,'final checks')
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message});console.error(error.message);process.exitCode=1}
finally{await writeFile(dir+'/final-results.json',JSON.stringify({results,errors},null,2));await browser.close();await db.end()}
