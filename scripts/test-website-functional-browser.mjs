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
try{
 const ctx=await context()
 await check('real login and company',async()=>{page=await login(ctx,0);await page.getByText('Studio Test A',{exact:true}).waitFor()})
 await check('create site through wizard',async()=>{alpha=await site(page,'Acceptance Alpha '+suffix)})
 await check('create/edit/save/reload builder 0.2.4',async()=>{
  await page.goto(c.urls.web+root+`/sites/${alpha}/pages`);await button(page,'Nueva página').first().click()
  await dialog(page).getByLabel(/Título/).fill('Inicio');await button(page,'Crear página').click()
  await page.waitForURL(/\/pages\/[^/]+\/editor/);pageId=page.url().split('/pages/')[1].split('/')[0]
  await button(page,'Guardar borrador').waitFor();await drag(page,'Encabezado')
  await page.locator('input[value="Encabezado"]').fill('Acceptance version one');await save(page)
  await page.reload();await page.getByText('Acceptance version one',{exact:true}).waitFor()
 })
 await check('Website-owned form, field and C-4',async()=>{
  await page.goto(c.urls.web+root+`/sites/${alpha}/forms`);await button(page,'Nuevo formulario').click()
  await dialog(page).getByLabel(/Nombre/).fill('Acceptance Contact '+suffix)
  const created=page.waitForResponse(r=>r.url().endsWith('/website/forms')&&r.request().method()==='POST')
  await button(page,'Crear formulario').click();formId=(await (await created).json()).id
  await button(page,'+ Agregar campo').click();await dialog(page).getByLabel(/Etiqueta/).fill('Nombre visitante')
  await button(dialog(page),'Agregar').click();await dialog(page).waitFor({state:'hidden'})
  await page.locator('[data-publishability="publishable"]').waitFor()
 })
 await check('C-3 structured readonly preflight and site form picker',async()=>{
  await page.goto(editor());await button(page,'Guardar borrador').waitFor();await drag(page,'Formulario de contacto');await save(page)
  const counts=async()=>(await db.query('SELECT (SELECT count(*) FROM website_release) AS releases,(SELECT count(*) FROM website_draft_command) AS receipts')).rows[0]
  const before=await counts(),report=await request(page,`/website/sites/${alpha}/releases/preflight`,company,'POST',{kind:'builder',changes:{publishPageIds:[pageId],includeThemeAndMenus:true}})
  assert.equal(report.status,200);assert.equal(report.body.data.canPublish,false)
  assert.ok(report.body.data.issues.some(i=>i.pageId===pageId&&i.blockId&&i.code&&i.remediation));assert.deepEqual(await counts(),before)
  await page.locator('select.atlas-wb-field__select').selectOption(formId);await save(page)
 })
 await check('publish and authoritative C-2',async()=>{
  await publish(page);const state=(await request(page,`/website/sites/${alpha}/state`)).body.data
  assert.equal(state.hasUnpublishedChanges,false);assert.equal(state.pages.find(p=>p.id===pageId).publicState,'published')
 })
 // New installation-owned loopback binding; no DNS or existing hostname changes.
 const host=`acceptance-${suffix}.content.localhost`,url=`http://${host}:${c.ports.api}/inicio`
 await db.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true)",[host,company,alpha])
 const publicCtx=await context(),publicPage=await publicCtx.newPage()
 await check('public form submission without ERP session',async()=>{
  await publicPage.goto(url);await publicPage.getByText('Acceptance version one',{exact:true}).waitFor()
  await publicPage.getByLabel(/Nombre visitante/).fill('Acceptance visitor '+suffix);await button(publicPage,'Enviar').click()
  await publicPage.getByText('Mensaje enviado correctamente',{exact:true}).waitFor()
 })
 await check('authorized administrative response read',async()=>{
  await page.goto(c.urls.web+root+`/sites/${alpha}/forms`);await page.getByRole('tab',{name:/Envíos/}).click()
  await page.getByText('Acceptance visitor '+suffix,{exact:false}).waitFor()
 })
 await check('second version, C-5 integrity and immutable rollback',async()=>{
  await page.goto(editor());await page.locator('.atlas-wb-canvas').getByText('Acceptance version one',{exact:true}).click()
  await page.locator('input[value="Acceptance version one"]').fill('Acceptance version two');await save(page);await publish(page)
  await publicPage.reload();await publicPage.getByText('Acceptance version two',{exact:true}).waitFor()
  await page.goto(c.urls.web+root+`/sites/${alpha}/publishing`);await page.getByText('Integridad: Sellada',{exact:true}).waitFor()
  await button(page,'Volver a esta versión').last().click();await button(dialog(page),'Volver a esta versión').click();await dialog(page).waitFor({state:'hidden'})
  await publicPage.reload();await publicPage.getByText('Acceptance version one',{exact:true}).waitFor()
  assert.equal((await request(page,`/website/sites/${alpha}/state`)).body.data.hasUnpublishedChanges,true)
 })
 await check('409 conflict and explicit discard/reload',async()=>{
  await page.goto(editor());await button(page,'Guardar borrador').waitFor()
  const stale=await ctx.newPage();await stale.goto(editor());await button(stale,'Guardar borrador').waitFor();await save(page)
  const response=stale.waitForResponse(r=>r.url().endsWith('/draft')&&r.request().method()==='PUT');await button(stale,'Guardar borrador').click()
  assert.equal((await response).status(),409);await stale.getByText('Esta página cambió mientras la editabas',{exact:true}).waitFor()
  await button(stale,'Descartar mis cambios y cargar la versión guardada').click();await dialog(stale).waitFor({state:'hidden'});await stale.close()
 })
 await check('reader cannot edit or publish',async()=>{
  const p=await login(await context(),2);await p.goto(editor());await p.getByText('Solo lectura',{exact:true}).first().waitFor()
  assert.equal(await button(p,'Guardar borrador').count(),0)
  assert.equal((await request(p,`/website/sites/${alpha}/releases/preflight`,company,'POST',{kind:'builder'})).status,403)
 })
 await check('foreign company identifiers remain opaque',async()=>{
  const p=await login(await context(),3),read=await request(p,`/website/sites/${alpha}`,c.companies[1].id)
  assert.equal(read.status,404);assert.ok(!JSON.stringify(read.body).includes('Acceptance Alpha'))
  assert.equal((await request(p,`/website/sites/${alpha}/pages/${pageId}/draft`,c.companies[1].id,'PUT',{document:{},expectedRevision:0})).status,404)
 })
 await check('website.access alone cannot open /sites',async()=>{
  const role=(await db.query("INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,'Access only',now()) RETURNING id",[company,'acceptance.access.'+suffix])).rows[0].id
  await db.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='website.access'",[role])
  await db.query('UPDATE membership SET role_id=$1 WHERE user_id=$2',[role,c.users[1].id])
  const p=await login(await context(),1);await p.goto(c.urls.web+root+'/sites');await p.getByText('Acceso restringido',{exact:true}).first().waitFor()
  assert.equal((await request(p,'/website/sites')).status,403)
 })
 await check('second site keeps form ownership separate',async()=>{
  beta=await site(page,'Acceptance ZIP '+suffix,true);await page.goto(c.urls.web+root+`/sites/${beta}/forms`)
  await page.getByText('Sin formularios',{exact:true}).waitFor();assert.equal((await request(page,`/website/sites/${beta}/forms`)).body.data.some(f=>f.id===formId),false)
 })
 await check('ZIP import, execution, cookie isolation and revocation',async()=>{
  await page.goto(c.urls.web+root+`/sites/${beta}/import`);const zip=new JSZip()
  zip.file('index.html','<!doctype html><h1>Acceptance ZIP OK</h1><script src="probe.abc123.js"></script>')
  zip.file('probe.abc123.js','document.body.dataset.executed="yes";localStorage.setItem("preview-only","yes");document.body.dataset.opener=String(window.opener===null)')
  const file=dir+'/acceptance.zip';await writeFile(file,await zip.generateAsync({type:'nodebuffer'}));await page.locator('input[type=file]').setInputFiles(file)
  await button(page,'Subir y validar').click();await button(page,'Preparar versión').click();await button(page,'Ver vista previa').click()
  const popup=page.waitForEvent('popup');await page.getByRole('link',{name:'Abrir en otra pestaña'}).click();const preview=await popup
  await preview.getByRole('heading',{name:'Acceptance ZIP OK'}).waitFor();await preview.waitForFunction(()=>document.body.dataset.executed==='yes')
  assert.equal(await preview.locator('body').getAttribute('data-opener'),'true');assert.equal(await page.evaluate(()=>localStorage.getItem('preview-only')),null)
  const cookies=await ctx.cookies(preview.url());assert.equal(cookies.length,1)
  assert.deepEqual([cookies[0].name,cookies[0].secure,cookies[0].httpOnly,cookies[0].sameSite],['__Host-runly-preview',true,true,'Strict'])
  assert.equal(await preview.evaluate(async()=> (await fetch('/website/sites')).status),404)
  const anonymous=await publicCtx.newPage();assert.equal((await anonymous.goto(preview.url())).status(),404)
  await preview.screenshot({path:dir+'/acceptance-preview.png'})
  const revoked=page.waitForResponse(r=>r.url().includes('/previews/')&&r.request().method()==='DELETE')
  await button(dialog(page),'Cerrar').first().click();assert.equal((await revoked).status(),200)
  assert.equal((await preview.reload()).status(),404)
 })
 await check('public ?edit=1 and private ERP paths remain closed',async()=>{
  await publicPage.goto(url+'?edit=1');await publicPage.getByText('Acceptance version one',{exact:true}).waitFor()
  assert.equal(await button(publicPage,'Guardar borrador').count(),0);assert.equal(await publicPage.evaluate(async()=> (await fetch('/website/sites')).status),404)
  await publicPage.screenshot({path:dir+'/acceptance-public.png'})
 })
 assert.deepEqual(errors,[]);console.log('PASS',results.length,'cases; no page errors')
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message});console.error(error.message);if(page)await page.screenshot({path:dir+'/acceptance-failure.png'});process.exitCode=1}
finally{await writeFile(dir+'/acceptance-results.json',JSON.stringify({results,errors},null,2));await browser.close();await db.end()}
