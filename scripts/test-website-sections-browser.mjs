// Real application, authentication, API, PostgreSQL and private Storage.
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createRequire} from 'node:module'
import pg from 'pg'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
const dir=resolve('.artifacts/website-integration')
const JSZip=createRequire(new URL('../apps/api/package.json',import.meta.url))('jszip')
const c=JSON.parse(await readFile(dir+'/private.json','utf8'))
if(!/^runly-studio-e2e-[a-f0-9]+$/.test(c.name)||!c.env.DATABASE_URL.includes(`@127.0.0.1:${c.ports.db}/`))throw Error('DISPOSABLE_LAB_REQUIRED')
const db=new pg.Pool({connectionString:c.env.DATABASE_URL})
assert.equal((await db.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,c.name)
const browser=await chromium.launch({headless:true}),results=[],errors=[]
const suffix=Date.now().toString(36),root='/app/m/runly.website',company=c.companies[0].id
let page,alpha,beta,pageId,formId
const button=(p,name)=>p.getByRole('button',{name,exact:true})
const dialog=p=>p.getByRole('dialog')
const editor=()=>`${c.urls.web}${root}/sites/${alpha}/pages/${pageId}/editor`
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS',name)}
async function context(){
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}})
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());return u.protocol==='http:'&&Object.values(c.ports).includes(Number(u.port))&&(u.hostname==='127.0.0.1'||u.hostname.endsWith('.localhost'))?r.continue():r.abort()})
 ctx.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message))});return ctx
}
async function login(ctx,index){
 const p=await ctx.newPage();await p.goto(c.urls.web+'/app/')
 await p.getByLabel('Correo o nombre de usuario').fill(c.users[index].email);await p.locator('#password').fill(c.users[index].password)
 await button(p,'Acceder al sistema').click();await p.waitForURL('**/app/home');return p
}
async function site(p,name,zip=false){
 await p.goto(c.urls.web+root+'/sites/new');await p.getByRole('radio',{name:zip?/Importar un sitio/:/Sitio informativo/}).click()
 await button(p,'Siguiente').click();await p.getByLabel('Nombre del sitio').fill(name);await button(p,'Siguiente').click()
 if(!zip)await button(p,'Crear sitio en blanco').click()
 await p.waitForURL(zip?/\/sites\/[^/]+\/import/:/\/sites\/[^/]+\/overview/)
 return p.url().split('/sites/')[1].split('/')[0]
}
async function drag(p,label){
 const source=button(p,`Insertar ${label}`);await source.scrollIntoViewIfNeeded()
 const a=await source.boundingBox(),b=await p.locator('.atlas-wb-canvas').boundingBox()
 await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();await p.mouse.move(a.x+a.width/2+15,a.y+a.height/2,{steps:5})
 await p.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:25});await p.mouse.up()
 // dnd-kit briefly captures clicks after a drop; let that gesture finish.
 await p.waitForTimeout(100)
}
async function save(p){const response=p.waitForResponse(r=>r.url().endsWith('/draft')&&r.request().method()==='PUT');await button(p,'Guardar borrador').click();assert.equal((await response).status(),200)}
async function publish(p){
 await button(p,'Publicar lo guardado').click();await button(p,'Preparar publicación').click();await button(p,'Activar versión').click()
 await p.getByText('Tu sitio está publicado',{exact:true}).waitFor();await button(dialog(p),'Cerrar').first().click()
}
async function request(p,path,companyId=company,method='GET',body){
 return p.evaluate(async({api,path,companyId,method,body})=>{
  const session=Object.keys(localStorage).filter(k=>k.startsWith('sb-')&&k.endsWith('-auth-token')).map(k=>JSON.parse(localStorage.getItem(k))).find(s=>s?.access_token)
  const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${session.access_token}`,'X-Runly-Company-Id':companyId,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},...(body&&{body:JSON.stringify(body)})})
  return {status:response.status,body:await response.json()}
 },{api:c.urls.api,path,companyId,method,body})
}
let siteA,siteB,postId,themeId,pageB
const val=async(sql,params=[])=>(await db.query(sql,params)).rows
try{
 // Catalog access for the admin role used by the lab (the reader role keeps none).
 await db.query(`INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),m.role_id,p.id FROM membership m,permission p WHERE m.user_id=$1 AND m.company_id=$2 AND p.key LIKE 'catalog.%' ON CONFLICT DO NOTHING`,[c.users[0].id,company])
 const ctx=await context()
 await check('login and two sites (default + secondary)',async()=>{
  page=await login(ctx,0)
  if(!(await val('SELECT id FROM website_site WHERE company_id=$1 AND default_for_company',[company])).length)await site(page,'Sections Default '+suffix)
  siteA=(await val('SELECT id FROM website_site WHERE company_id=$1 AND default_for_company',[company]))[0].id
  siteB=await site(page,'Sections Second '+suffix)
  assert.notEqual(siteA,siteB)
 })
 await check('every section opens for the secondary site without the old default-only notice',async()=>{
  for(const s of ['blog','catalog','forms','appearance','advanced','payments','settings']){
   await page.goto(c.urls.web+root+`/sites/${siteB}/${s}`);await page.getByRole('main').waitFor()
   assert.equal(await page.getByText('Esta sección aún no admite este sitio').count(),0,s);assert.equal(await page.getByText('Acceso restringido').count(),0,s)
  }
 })
 await check('blog: create a post in site B only',async()=>{
  await page.goto(c.urls.web+root+`/sites/${siteB}/blog`);await button(page,'Nuevo post').click()
  await dialog(page).getByLabel('Titulo').fill('Entrada B '+suffix)
  const created=page.waitForResponse(r=>r.url().endsWith('/website/blog/posts')&&r.request().method()==='POST')
  await dialog(page).locator('button[type=submit]').click();const body=await (await created).json();postId=body.id??body.data?.id
  await page.waitForURL(new RegExp(`/sites/${siteB}/blog/${postId}$`))
  await button(page,'Guardar borrador').waitFor()
  const rows=await val('SELECT site_id,slug FROM website_blog_post WHERE id=$1',[postId]);assert.equal(rows[0].site_id,siteB)
  await page.screenshot({path:dir+'/sections-blog-editor.png'})
  await page.getByRole('button',{name:/Blog/}).first().click();await page.getByText('Entrada B '+suffix).waitFor()
  await page.goto(c.urls.web+root+`/sites/${siteA}/blog`);await page.getByRole('main').waitFor()
  assert.equal(await page.getByText('Entrada B '+suffix).count(),0)
 })
 await check('blog post can be selected for publication in the publish sheet',async()=>{
  await page.goto(c.urls.web+root+`/sites/${siteB}/overview`)
  await page.getByRole('button',{name:'Publicar'}).first().click()
  await page.getByLabel('Publicar la entrada Entrada B '+suffix).waitFor()
  await page.keyboard.press('Escape')
 })
 await check('appearance: theme and menu are per site',async()=>{
  await page.goto(c.urls.web+root+`/sites/${siteB}/appearance`)
  await page.getByRole('button',{name:'Usar este tema'}).waitFor()
  themeId=(await val('SELECT id FROM website_theme WHERE site_id=$1 AND enabled ORDER BY created_at LIMIT 1',[siteB]))[0].id
  assert.equal((await val('SELECT count(*)::int n FROM website_theme WHERE site_id=$1 AND id=$2',[siteA,themeId]))[0].n,0)
  const applied=page.waitForResponse(r=>r.url().includes(`/website/sites/${siteB}`)&&r.request().method()==='PATCH')
  await button(page,'Usar este tema').click();assert.equal((await applied).status(),200)
  const identity=(await val('SELECT draft_identity FROM website_site WHERE id=$1',[siteB]))[0].draft_identity
  assert.equal(identity.themeId,themeId)
  assert.equal((await val('SELECT draft_identity FROM website_site WHERE id=$1',[siteA]))[0].draft_identity?.themeId??null,null)
  await page.getByRole('tab',{name:'Menús'}).click();await page.getByRole('button',{name:/Nuevo menu|Crear primer menu/}).first().click()
  await dialog(page).getByLabel('Nombre').fill('Menu B '+suffix);await dialog(page).locator('button:has-text("Crear")').last().click()
  await page.getByText('Menu B '+suffix).first().waitFor()
  assert.equal((await val('SELECT count(*)::int n FROM website_menu WHERE site_id=$1 AND name=$2',[siteB,'Menu B '+suffix]))[0].n,1)
  assert.equal((await val('SELECT count(*)::int n FROM website_menu WHERE site_id=$1 AND name=$2',[siteA,'Menu B '+suffix]))[0].n,0)
  await page.screenshot({path:dir+'/sections-appearance.png'})
 })
 await check('templates are offered for a non-default site',async()=>{
  await page.getByRole('tab',{name:'Plantillas'}).click()
  await page.getByRole('button',{name:/Negocio/}).first().waitFor()
  assert.equal(await page.getByText('Las plantillas todavía no admiten este sitio').count(),0)
 })
 await check('advanced settings and payments save to the selected site only',async()=>{
  await page.goto(c.urls.web+root+`/sites/${siteB}/advanced`);await page.getByRole('tab',{name:/Analitica/}).click()
  await page.getByLabel('Turnstile Site Key').fill('1x00000000000000000000AA')
  const saved=page.waitForResponse(r=>r.url().includes(`/website/site/${siteB}`)&&r.request().method()==='PATCH')
  await page.getByRole('button',{name:/Guardar/}).last().click();assert.equal((await saved).status(),200)
  assert.equal((await val('SELECT turnstile_site_key FROM website_site WHERE id=$1',[siteB]))[0].turnstile_site_key,'1x00000000000000000000AA')
  assert.notEqual((await val('SELECT turnstile_site_key FROM website_site WHERE id=$1',[siteA]))[0].turnstile_site_key,'1x00000000000000000000AA')
  assert.equal(await page.getByRole('tab',{name:'Fuente del sitio'}).count(),0)
  await page.goto(c.urls.web+root+`/sites/${siteB}/payments`);await page.getByRole('button',{name:/Configurar|Editar/}).first().click()
  await page.getByLabel('Clave publicable (Publishable Key)').fill('pk_test_sections')
  const paid=page.waitForResponse(r=>r.url().includes(`/website/site/${siteB}`)&&r.request().method()==='PATCH')
  await page.getByRole('dialog').getByRole('button',{name:/Guardar/}).click();assert.equal((await paid).status(),200)
  assert.equal((await val('SELECT stripe_publishable_key FROM website_site WHERE id=$1',[siteB]))[0].stripe_publishable_key,'pk_test_sections')
  assert.notEqual((await val('SELECT stripe_publishable_key FROM website_site WHERE id=$1',[siteA]))[0].stripe_publishable_key,'pk_test_sections')
 })
 await check('forms: unresolved legacy form is blocked, then resolved explicitly',async()=>{
  const legacy=(await val(`INSERT INTO website_form(id,company_id,site_id,name,submit_label,updated_at) VALUES(uuidv7(),$1,$2,$3,'Enviar',now()) RETURNING id`,[company,siteB,'Legacy '+suffix]))[0].id
  await page.goto(c.urls.web+root+`/sites/${siteB}/forms?form=${legacy}`)
  await page.locator('[data-publishability]').waitFor()
  const state=await page.locator('[data-publishability]').getAttribute('data-publishability')
  assert.ok(['owner_unresolved','owner_ambiguous'].includes(state),state)
  await page.screenshot({path:dir+'/sections-forms-blocked.png'})
  if(state==='owner_unresolved'){
   await button(page,'Confirmar que pertenece a este sitio').click()
   await page.locator('[data-publishability="publishable"]').waitFor()
  }
 })
 await check('catalog: published vs available, independent of POS, per-site usage',async()=>{
  const mk=async(name,slug,published,pos)=>(await val(`INSERT INTO catalog_product(id,company_id,product_type,name,slug,price,currency,published,pos_enabled,enabled) VALUES(uuidv7(),$1,'SIMPLE',$2,$3,120,'MXN',$4,$5,true) RETURNING id`,[company,name,slug,published,pos]))[0].id
  await mk('Taza '+suffix,'taza-'+suffix,true,false)
  const mesa=await mk('Mesa '+suffix,'mesa-'+suffix,false,true)
  await page.goto(c.urls.web+root+`/sites/${siteB}/catalog`)
  await page.getByText('Taza '+suffix,{exact:true}).waitFor();assert.equal(await page.getByText('Mesa '+suffix,{exact:true}).count(),0)
  await page.getByRole('tab',{name:'Disponibles para publicar'}).click();await page.getByText('Mesa '+suffix,{exact:true}).waitFor()
  await page.getByRole('button',{name:'Acciones de Mesa '+suffix}).click();await page.getByRole('menuitem',{name:'Habilitar para web (empresa)'}).click()
  await page.getByRole('tab',{name:'En la web'}).click();await page.getByText('Mesa '+suffix,{exact:true}).waitFor()
  const row=(await val('SELECT published,pos_enabled FROM catalog_product WHERE id=$1',[mesa]))[0];assert.equal(row.published,true);assert.equal(row.pos_enabled,true)
  await page.goto(c.urls.web+root+`/sites/${siteB}/pages`);await button(page,'Nueva página').first().click()
  await dialog(page).getByLabel(/Título/).fill('Tienda');await button(page,'Crear página').click()
  await page.waitForURL(/\/pages\/[^/]+\/editor/);pageB=page.url().split('/pages/')[1].split('/')[0]
  await button(page,'Guardar borrador').waitFor();await drag(page,'Encabezado');await save(page)
  await page.goto(c.urls.web+root+`/sites/${siteB}/catalog`)
  await page.getByRole('button',{name:'Acciones de Mesa '+suffix}).click();await page.getByRole('menuitem',{name:'Añadir a una página'}).click()
  await dialog(page).getByText('Elige una página').click();await page.getByRole('option',{name:/Tienda/}).click()
  await button(dialog(page),'Añadir producto').click();await dialog(page).waitFor({state:'hidden'})
  const draft=(await request(page,`/website/sites/${siteB}/pages/${pageB}/draft`)).body.data
  assert.ok(Object.values(draft.document.blocks).some(b=>b.type==='ProductCardBlock'&&b.props.productId==='mesa-'+suffix))
  await page.reload();await page.getByRole('row',{name:/Mesa/}).getByText('Tienda').waitFor()
  await page.screenshot({path:dir+'/sections-catalog.png'})
  await page.getByRole('button',{name:'Acciones de Mesa '+suffix}).click();await page.getByRole('menuitem',{name:'Deshabilitar para web (empresa)'}).click()
  await page.getByText(/Hoy aparece en: Tienda/).waitFor()
  await dialog(page).getByRole('button',{name:'Quitar de la web'}).click();await dialog(page).waitFor({state:'hidden'})
  const after=(await val('SELECT published,pos_enabled FROM catalog_product WHERE id=$1',[mesa]))[0];assert.equal(after.published,false);assert.equal(after.pos_enabled,true)
  assert.equal((await val("SELECT count(*)::int n FROM catalog_product WHERE company_id=$1 AND slug LIKE '%'||$2",[company,suffix]))[0].n,2)
 })
 await check('reader without catalog permission cannot browse or change products',async()=>{
  const readerCtx=await context(),reader=await login(readerCtx,2)
  await reader.goto(c.urls.web+root+`/sites/${siteB}/catalog`)
  await reader.getByText('Acceso restringido',{exact:true}).waitFor()
 })
 await check('catalog and forms: dark theme and 390px viewport without horizontal scroll',async()=>{
  await page.goto(c.urls.web+root+`/sites/${siteB}/catalog`);await page.getByRole('main').waitFor()
  await page.evaluate(()=>document.documentElement.classList.add('dark'))
  await page.screenshot({path:dir+'/sections-catalog-dark.png'})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true)
  await page.screenshot({path:dir+'/sections-catalog-mobile.png'})
  await page.goto(c.urls.web+root+`/sites/${siteB}/forms`);await page.getByRole('main').waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true)
  await page.setViewportSize({width:1440,height:1000})
 })
 assert.deepEqual(errors,[]);console.log('PASS',results.length,'cases; no page errors')
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message});console.error(error.message);if(page)await page.screenshot({path:dir+'/sections-failure.png'});process.exitCode=1}
finally{await writeFile(dir+'/sections-results.json',JSON.stringify({results,errors},null,2));await browser.close();await db.end()}
