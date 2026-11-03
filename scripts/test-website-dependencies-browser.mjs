import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import pg from 'pg'
import {chromium} from 'playwright'
const dir='.artifacts/website-integration',c=JSON.parse(await readFile(dir+'/private.json')),f=JSON.parse(await readFile(dir+'/dependencies-fixture.json'))
if(!/^runly-studio-e2e-/.test(c.name)||!c.env.DATABASE_URL.includes(`@127.0.0.1:${c.ports.db}/`))throw Error('DISPOSABLE_LAB_REQUIRED')
const db=new pg.Pool({connectionString:c.env.DATABASE_URL});assert.equal((await db.query('SELECT id FROM runly_studio_test.environment')).rows[0].id,c.name)
const productName='Browser inclusion '+f.product1
await db.query('UPDATE catalog_product SET name=$1 WHERE id=$2',[productName,f.product1])
const publicHost=`deps-${f.siteA}.content.localhost`
await db.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true) ON CONFLICT DO NOTHING",[publicHost,c.companies[0].id,f.siteA])
const browser=await chromium.launch({headless:true}),results=[],errors=[]
let page
const button=(p,name)=>p.getByRole('button',{name,exact:true}),url=(site,section)=>c.urls.web+`/app/m/runly.website/sites/${site}/${section}`
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS',name)}
async function login(index){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>{const u=new URL(r.request().url());return u.protocol==='http:'&&Object.values(c.ports).includes(Number(u.port))&&(u.hostname==='127.0.0.1'||u.hostname.endsWith('.localhost'))?r.continue():r.abort()});const p=await ctx.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));await p.goto(c.urls.web+'/app/');await p.getByLabel('Correo o nombre de usuario').fill(c.users[index].email);await p.locator('#password').fill(c.users[index].password);await button(p,'Acceder al sistema').click();await p.waitForURL('**/app/home');return p}
try{
 page=await login(0)
 await check('explicit routes and restricted navigation',async()=>{
  for(const section of ['catalog','advanced','payments']){await page.goto(url(f.siteA,section));await page.getByRole('navigation',{name:'Secciones del sitio'}).waitFor();assert.equal(await page.getByText('Acceso restringido',{exact:true}).count(),0)}
  const reader=await login(2);await reader.goto(url(f.siteA,'pages'));const nav=reader.getByRole('navigation',{name:'Secciones del sitio'});await nav.waitFor()
  assert.equal(await button(nav,'Catálogo').count(),0);assert.equal(await button(nav,'Pagos').count(),0);assert.equal(await button(nav,'Correo y analítica').count(),0)
  await reader.goto(url(f.siteA,'payments'));await reader.getByText('Acceso restringido',{exact:true}).waitFor();await reader.close()
 })
 await check('catalog selection consumes server usedBy without changing global publication',async()=>{
  const publicCtx=await browser.newContext(),publicPage=await publicCtx.newPage()
  publicPage.on('pageerror',e=>errors.push(e.message))
  await publicPage.goto(`http://${publicHost}:${c.ports.api}/blog/dependency-post`)
  await publicPage.getByText(productName,{exact:true}).waitFor({timeout:10000})
  await page.goto(url(f.siteA,'catalog'));await page.getByPlaceholder('Buscar producto…').fill(productName)
  const row=page.getByRole('row').filter({hasText:productName});await row.waitFor()
  await row.getByText('Incluido en este sitio',{exact:true}).waitFor()
  await button(row,'Acciones de '+productName).click()
  const changed=page.waitForResponse(r=>r.url().endsWith('/catalog/products/'+f.product1)&&r.request().method()==='PUT')
  await page.getByRole('menuitem',{name:'Excluir de este sitio',exact:true}).click();assert.equal((await changed).status(),200)
  await row.getByText('No incluido en este sitio',{exact:true}).waitFor()
  await publicPage.reload();await publicPage.getByText('Producto no encontrado o no publicado.',{exact:true}).waitFor()
  assert.deepEqual((await db.query('SELECT published,pos_enabled FROM catalog_product WHERE id=$1',[f.product1])).rows[0],{published:true,pos_enabled:true})
  await button(row,'Acciones de '+productName).click();await page.getByRole('menuitem',{name:'Incluir en este sitio',exact:true}).click();await row.getByText('Incluido en este sitio',{exact:true}).waitFor()
  await publicPage.reload();await publicPage.getByText(productName,{exact:true}).waitFor();await publicCtx.close()
  await page.screenshot({path:dir+'/dependencies-catalog.png'})
 })
 await check('template application targets the chosen nondefault site',async()=>{
  await page.goto(url(f.templateTarget,'appearance'));await page.getByRole('tab',{name:'Plantillas',exact:true}).click()
  await button(page,/Negocio & Servicios/).click();assert.equal(new URL(page.url()).searchParams.get('siteId'),f.templateTarget)
  const applied=page.waitForResponse(r=>r.url().includes('/templates/atlas-negocio/apply')&&r.request().method()==='POST')
  await button(page,/Aplicar/).click();assert.equal((await applied).status(),200)
  await page.waitForURL(new RegExp('/sites/'+f.templateTarget+'/pages/[^/]+/editor'))
  await button(page,'Guardar borrador').waitFor()
  assert.equal((await db.query('SELECT count(*)::int n FROM website_page WHERE site_id=$1',[f.templateTarget])).rows[0].n,4)
 })
 await check('explicit blog withdrawal from the real publication sheet',async()=>{
  await page.goto(url(f.siteA,'overview'));await button(page,'Publicar').first().click()
  await page.getByRole('checkbox',{name:'Todas las páginas guardadas',exact:true}).uncheck()
  await page.getByRole('checkbox',{name:'Retirar la entrada Dependency post',exact:true}).check()
  const prepared=page.waitForResponse(r=>r.url().endsWith('/releases')&&r.request().method()==='POST')
  await button(page,'Preparar publicación').click();const release=(await (await prepared).json()).data;assert.ok(!release.manifest.routes.some(r=>r.sourceId===f.postId))
  await button(page,'Activar versión').click();await page.getByText('Tu sitio está publicado',{exact:true}).waitFor()
  assert.ok((await db.query('SELECT draft_builder_data FROM website_blog_post WHERE id=$1',[f.postId])).rows[0].draft_builder_data.blocks.card)
 })
 await check('ambiguous form requires explicit confirmation in frontend',async()=>{
  await page.goto(url(f.ambiguousSite,'forms')+'?form='+f.ambiguousForm)
  await button(page,'Resolver propiedad…').click();await page.getByRole('dialog').getByText('Resolver propiedad ambigua',{exact:true}).waitFor()
  const resolved=page.waitForResponse(r=>r.url().endsWith(`/forms/${f.ambiguousForm}/scope`)&&r.request().method()==='POST')
  await button(page.getByRole('dialog'),'Asignar a este sitio').click();assert.equal((await resolved).status(),200)
  await page.getByRole('dialog').waitFor({state:'hidden'})
  assert.equal((await db.query('SELECT owner_website_site_id FROM website_form_scope WHERE form_id=$1',[f.ambiguousForm])).rows[0].owner_website_site_id,f.ambiguousSite)
 })
 assert.deepEqual(errors,[]);console.log('PASS',results.length,'affected browser paths')
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message});console.error(error.message);if(page)await page.screenshot({path:dir+'/dependencies-browser-failure.png'});process.exitCode=1}
finally{await writeFile(dir+'/dependencies-browser-results.json',JSON.stringify({results,errors},null,2));await browser.close();await db.end()}
