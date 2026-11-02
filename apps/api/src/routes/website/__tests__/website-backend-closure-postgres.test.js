import {chromium} from 'playwright'
import {createStorefrontCaptureRoutes} from '../../storefront/storefront-capture-routes.js'
import {createFormsService} from '../../../services/forms-service.js'
import {createStorefrontCaptureService} from '../../../services/storefront-capture-service.js'
import {createWebsiteFormScopeService} from '../../../services/website-form-scope-service.js'
import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {PrismaClient} from '@prisma/client'
import {PrismaPg} from '@prisma/adapter-pg'
import {execFileSync} from 'node:child_process'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {Hono} from 'hono'
import {serve} from '@hono/node-server'
import {request} from 'node:http'
import {buildWebsitePublicRuntime} from '../../../../../../scripts/build-website-public-runtime.mjs'
import {createWebsiteService} from '../website-service.js'
import {createWebsiteAccess} from '../../../services/website-authorization-service.js'
import {createWebsitePublicationContext} from '../../../services/website-publication-context.js'
import {createPublicWebsiteRouter,createPublicCatalogRouter} from '../../public-website.js'
import {createWebsiteRouter} from '../index.js'
import {createDistServeService} from '../../../services/dist-serve-service.js'
import {createWebsiteOriginGuard} from '../../../services/website-origin-guard.js'
import {createWebsiteAdapter} from '../../../mcp/adapters/website.js'
import {createWebsiteDomain} from '../../../../../../packages/sdk/src/domains/website.js'
import {testPermission,ALL} from './security-fixtures.js'
const url=process.env.RUNLY_WEBSITE_TEST_DATABASE_URL,marker=process.env.RUNLY_WEBSITE_TEST_DISPOSABLE
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/website_s2_test'||!/^runly-website-test-[a-f0-9-]+$/.test(marker??''))throw new Error('Disposable runner required')
if(execFileSync('docker',['port',marker,'5432/tcp'],{encoding:'utf8'}).trim()!==`127.0.0.1:${new URL(url).port}`)throw new Error('Not the disposable database')
let db,peer,root,runtime,n=0
const doc=text=>({schemaVersion:1,regions:{main:{children:['a']}},blocks:{a:{id:'a',type:'HeroBlock',props:{title:text}}}})
const error=(code,status)=>e=>e.code===code&&(!status||e.status===status)
before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});peer=new PrismaClient({adapter:new PrismaPg({connectionString:url})});root=await mkdtemp(join(tmpdir(),'website-s3-'));runtime=await buildWebsitePublicRuntime()})
after(async()=>{await db?.$disconnect();await peer?.$disconnect();if(root&&resolve(root).startsWith(resolve(tmpdir())))await rm(root,{recursive:true})})
const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text id`)[0].id
async function fixture(options={}) {
 const k=++n,folder=join(root,String(k)),files=new Map()
 const storage={async put(key,bytes,mime){const path=resolve(folder,key);assert.ok(path.startsWith(resolve(folder)));await mkdir(resolve(path,'..'),{recursive:true});try{await writeFile(path,bytes,{flag:'wx'});files.set(key,{bytes,mime})}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(path),bytes)}},async get(key){const path=resolve(folder,key);assert.ok(path.startsWith(resolve(folder)));return readFile(path)}}
 const company=await db.company.create({data:{id:await uuid(),name:'Release fixture',slug:`closure-${k}`}})
 const actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),email:`closure-${k}@example.test`,displayName:'Release test'}})
 const access=createWebsiteAccess({companyId:company.id,actorId:actor.id,can:()=>true})
 const ctx={companyId:company.id,access},publication=createWebsitePublicationContext({prisma:db,storage,runtime:async()=>runtime,namespaceRoot:'sites.example.test',adminHosts:['erp.example.test'],...options})
 const svc=createWebsiteService({prisma:db,publicationContext:publication}),site=await svc.createSite({...ctx,data:{name:'A'}})
 const page=await svc.createPage({...ctx,siteId:site.id,data:{title:'Home',slug:'home',routePath:'/'}})
 await svc.saveDraft({...ctx,pageId:page.id,builderData:doc('first'),expectedRevision:0})
 const args={...ctx,siteId:site.id},host=await publication.gateway.reserve({...args,slug:`closure-${k}`})
 const prepare=async(key=`release-prepare-attempt-${k}`,extra={})=>{const current=await db.websiteSite.findUnique({where:{id:site.id}});return publication.releases.prepare({...args,kind:'builder',baseReleaseId:current.activeReleaseId,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,changes:{publishPageIds:[page.id],includeThemeAndMenus:true},idempotencyKey:key,...extra})}
 const activate=(r,key=`release-activate-attempt-${k}`,engine=publication.releases)=>engine.activate({...args,releaseId:r.id,expectedDraftRevision:r.draftRevision,expectedPublicationRevision:r.publicationRevision,manifestHash:r.manifestHash,idempotencyKey:key})
 const c={req:{url:`http://${host.hostname}/`,header:name=>name.toLowerCase()==='host'?host.hostname:undefined}}
 return {ctx,args,company,actor,site,page,svc,publication,prepare,activate,storage,files,folder,host,c}
}

const formDoc=(id)=>({schemaVersion:1,id:'page_fixture',slug:'/',title:'Contact',visibility:'public',layoutId:null,regions:{main:{id:'region_main',children:['contact']}},blocks:{contact:{id:'contact',type:'ContactFormBlock',props:{formId:id}}},seo:{title:'',description:'',canonical:null,ogImageAssetId:null},updatedAt:'2026-11-02T00:00:00.000Z'})
async function formFixture(options={}) {
 const f=await fixture(options),forms=createFormsService({prisma:db});
 const form=await forms.createForm({...f.args,data:{name:'Contact',createsLead:false}});
 await forms.createFormField({...f.ctx,formId:form.id,data:{name:'email',label:'Correo',fieldType:'email',required:true}});
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:formDoc(form.id),expectedRevision:1});
 return {...f,forms,form};
}
test('C-1 is actor and site scoped; foreign tenants see an opaque 404',async()=>{
 const f=await fixture(),other=await fixture();
 const restricted=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p==='website.site.read'});
 const state=await f.publication.contracts.state({...f.args,access:restricted});
 assert.deepEqual(state.pages,[]);
 assert.equal(state.capabilities['pages.publish'].allowed,false);assert.equal(state.capabilities['pages.publish'].reason.requiredPermission,'website.pages.publish');
 assert.equal(state.capabilities['calendar.publish'].allowed,false);assert.equal(state.capabilities['submissions.delete'].allowed,false);
 await assert.rejects(f.publication.contracts.state({...f.args,siteId:other.site.id}),error('resource_not_found',404));
});
test('C-2 compares semantic page and global state, save unchanged, rollback and unpublish',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r);
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,false);
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:{...doc('first'),updatedAt:'2026-11-02T01:00:00.000Z'},expectedRevision:1});
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,false);
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('second'),expectedRevision:2});
 let state=await f.publication.contracts.state(f.args);assert.equal(state.hasUnpublishedChanges,true);assert.equal(state.pages[0].publicState,'changed');
 const second=await f.prepare('second-state-prepare-key');await f.activate(second,'second-state-activate-key');
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,false);
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}});
 await f.publication.releases.rollback({...f.args,releaseId:r.id,expectedPublicationRevision:current.publicationRevision,idempotencyKey:'state-rollback-attempt-key'});
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,true);
 const now=await db.websiteSite.findUnique({where:{id:f.site.id}});
 await f.publication.releases.unpublish({...f.args,expectedPublicationRevision:now.publicationRevision,idempotencyKey:'state-unpublish-attempt-key'});
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,true);
});
test('C-3 reuses publisher validation, reports each blocked block, and makes no writes',async()=>{
 const f=await fixture(),form=await db.websiteForm.create({data:{companyId:f.company.id,siteId:f.site.id,name:'Unresolved'}});
 const document=formDoc(form.id);document.blocks.booking={id:'booking',type:'BookingFormBlock',props:{calendarId:''}};document.regions.main.children.push('booking');
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:document,expectedRevision:1});
 const counts=async()=>Promise.all([db.websiteRelease.count({where:{companyId:f.company.id}}),db.websiteDraftCommand.count({where:{companyId:f.company.id}}),db.websitePublicationEvent.count({where:{companyId:f.company.id}}),db.auditLog.count({where:{actorId:f.actor.id}})]);
 const before=await counts(),fileCount=f.files.size,report=await f.publication.releases.preflight({...f.args,changes:{publishPageIds:[f.page.id]}});
 assert.equal(report.canPublish,false);assert.ok(report.issues.some(i=>i.blockId==='contact'&&i.code==='form_scope_unresolved'));assert.ok(report.issues.some(i=>i.blockId==='booking'&&i.code==='dynamic_binding_unavailable'));
 assert.deepEqual(await counts(),before);assert.equal(f.files.size,fileCount);
 await assert.rejects(f.prepare('blocked-prepare-attempt-key'),e=>e.status===422&&report.issues.some(i=>i.code===e.code));
});
test('Website FormScope publishes a form and captures a response with a distinct analytics property',async()=>{
 const f=await formFixture(),scope=await db.websiteFormScope.findFirst({where:{formId:f.form.id}});
 assert.equal(scope.ownerWebsiteSiteId,f.site.id);assert.notEqual(scope.analyticsPropertyId,f.site.id);
 const status=await f.publication.contracts.form({...f.args,formId:f.form.id});assert.equal(status.state,'publishable');assert.deepEqual(status.usedBy,[{pageId:f.page.id,blockId:'contact'}]);
 const report=await f.publication.releases.preflight({...f.args,changes:{publishPageIds:[f.page.id]}});assert.equal(report.canPublish,true);
 const release=await f.prepare();await f.activate(release);
 const capture=createStorefrontCaptureService({prisma:db}),input={companySlug:f.company.slug,websiteSiteId:f.site.id,formId:f.form.id,origin:'https://'+f.host.hostname};
 const definition=await capture.getPublicForm(input);
 const submission=await capture.submitForm({...input,idempotencyKey:'public-form-response-key',payload:{values:{email:'visitor@example.test'},expectedDefinitionRevision:definition.definitionRevision}});
 const replay=await capture.submitForm({...input,idempotencyKey:'public-form-response-key',payload:{values:{email:'visitor@example.test'},expectedDefinitionRevision:definition.definitionRevision}});
 assert.equal(submission.submissionId,replay.submissionId);assert.equal(replay.replayed,true);
 const result=await f.forms.listSubmissions({...f.ctx,formId:f.form.id});assert.equal(result.total,1);assert.equal(result.data[0].definitionRevision,definition.definitionRevision);
 const other=await fixture();await assert.rejects(capture.getPublicForm({...input,websiteSiteId:other.site.id}),e=>e.status===404);
 await assert.rejects(capture.submitForm({...input,origin:'https://foreign.example.test',idempotencyKey:'cross-origin-attempt',payload:{values:{email:'visitor@example.test'}}}),e=>e.status===403);
});
test('form changes reject stale definitions; disabling and withdrawing block capture without deleting answers',async()=>{
 const f=await formFixture(),r=await f.prepare();await f.activate(r);
 const capture=createStorefrontCaptureService({prisma:db}),input={companySlug:f.company.slug,websiteSiteId:f.site.id,formId:f.form.id,origin:'https://'+f.host.hostname,idempotencyKey:'definition-response-key'};
 const old=await capture.getPublicForm(input);
 await f.forms.updateForm({...f.ctx,formId:f.form.id,data:{name:'New definition'}});
 await assert.rejects(capture.submitForm({...input,payload:{values:{email:'visitor@example.test'},expectedDefinitionRevision:old.definitionRevision}}),error('form_definition_changed',409));
 await capture.submitForm({...input,payload:{values:{email:'visitor@example.test'}}});
 await f.forms.softDeleteForm({...f.ctx,formId:f.form.id});
 await assert.rejects(capture.submitForm({...input,idempotencyKey:'disabled-response-key',payload:{values:{email:'visitor@example.test'}}}),e=>e.status===404);
 assert.equal(await db.websiteFormSubmission.count({where:{formId:f.form.id}}),1);
});
test('Growth external owner retains its ID and captures without inventing a WebsiteSite',async()=>{
 const f=await fixture(),property=await db.growthProperty.create({data:{companyId:f.company.id,name:'External',domain:'https://external.example.test',status:'active',kind:'external_sdk'}});
 const forms=createFormsService({prisma:db,ownerDomain:'growth'}),form=await forms.createForm({...f.ctx,siteId:property.id,data:{name:'External',createsLead:false}});
 const scope=await db.websiteFormScope.findFirst({where:{formId:form.id}});assert.equal(scope.ownerKind,'growth_property');assert.equal(scope.analyticsPropertyId,property.id);
 assert.equal((await db.websiteForm.findUnique({where:{id:form.id}})).siteId,property.id);
 const capture=createStorefrontCaptureService({prisma:db});await capture.submitForm({companySlug:f.company.slug,propertyId:property.id,formId:form.id,origin:'https://external.example.test',idempotencyKey:'external-response-key',payload:{values:{}}});
 await assert.rejects(f.publication.releases.preflight({...f.args,changes:{publishPageIds:[f.page.id]},access:createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:()=>false})}),e=>e.status===403);
 await assert.rejects(createFormsService({prisma:db}).getForm({...f.ctx,formId:form.id}),e=>e.status===404);
 assert.equal((await forms.listSubmissions({...f.ctx,formId:form.id})).total,1);
});
test('historical ambiguous ownership needs explicit dual-owner authorization; IDs and answers survive',async()=>{
 const f=await fixture();await db.growthProperty.create({data:{id:f.site.id,companyId:f.company.id,name:'Colliding historical identity'}});
 const form=await db.websiteForm.create({data:{companyId:f.company.id,siteId:f.site.id,name:'Ambiguous historical'}});
 const response=await db.websiteFormSubmission.create({data:{companyId:f.company.id,formId:form.id,data:{historical:true}}});
 const forms=createFormsService({prisma:db}),args={...f.args,formId:form.id,expectedLegacySiteId:f.site.id};
 assert.equal((await f.publication.contracts.form(args)).state,'owner_ambiguous');
 await assert.rejects(forms.resolveFormScope(args),error('ambiguous_site_identifier',409));
 const onlyWebsite=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p.startsWith('website.')});
 await assert.rejects(forms.resolveFormScope({...args,resolveAmbiguous:true,access:onlyWebsite}),e=>e.status===403);
 await forms.resolveFormScope({...args,resolveAmbiguous:true});
 assert.equal((await db.websiteForm.findUnique({where:{id:form.id}})).siteId,f.site.id);
 assert.deepEqual((await db.websiteFormSubmission.findUnique({where:{id:response.id}})).data,{historical:true});
 assert.equal((await f.publication.contracts.form(args)).state,'publishable');
});
test('FormScope FK, owner invariants, RLS and immutable mapping are enforced by PostgreSQL',async()=>{
 const f=await formFixture(),scope=await db.websiteFormScope.findFirst({where:{formId:f.form.id}}),other=await fixture();
 await assert.rejects(db.websiteFormScope.update({where:{id:scope.id},data:{ownerWebsiteSiteId:other.site.id}}));
 await assert.rejects(db.websiteFormScope.delete({where:{id:scope.id}}));
 const result=await db.$queryRawUnsafe("SELECT relrowsecurity FROM pg_class WHERE relname='website_form_scope'");assert.equal(result[0].relrowsecurity,true);
 const grants=await db.$queryRawUnsafe("SELECT has_table_privilege('anon','website_form_scope','SELECT') AS allowed");assert.equal(grants[0].allowed,false);
});
test('C-5 uniform admin integrity identifies sealed releases and unmanaged history without creating a release',async()=>{
 const f=await fixture(),before=await db.websiteRelease.count();const legacy=await f.publication.contracts.integrity(f.args);
 assert.equal(legacy.integrityMode,'legacy-reference');assert.equal(legacy.releaseId,null);assert.equal(await db.websiteRelease.count(),before);
 const r=await f.prepare();await f.activate(r);assert.equal((await f.publication.releases.get({...f.args,releaseId:r.id})).integrityMode,'sealed');
 assert.equal((await f.publication.contracts.integrity(f.args)).integrityMode,'sealed');
});

test('C-2 tracks SEO and identity without relying on draft counters',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r);
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('first'),seo:{title:'Private SEO'},expectedRevision:1});
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,true);
 const next=await f.prepare('seo-state-prepare-key');await f.activate(next,'seo-state-activate-key');
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,false);
 await db.websiteSite.update({where:{id:f.site.id},data:{draftIdentity:{name:'Private identity',siteType:'website',settings:{},seoDefaults:{}}}});
 assert.equal((await f.publication.contracts.state(f.args)).hasUnpublishedChanges,true);
});
test('submission read permission is independent and archived forms retain authorized response access',async()=>{
 const f=await formFixture(),reply=await db.websiteFormSubmission.create({data:{companyId:f.company.id,formId:f.form.id,data:{historical:true}}});
 const denied=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p==='website.forms.read'});
 const formReader=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>['website.site.read','website.forms.read'].includes(p)});
 assert.deepEqual((await f.publication.contracts.form({...f.args,formId:f.form.id,access:formReader})).usedBy,[]);
 await assert.rejects(f.forms.listSubmissions({...f.ctx,formId:f.form.id,access:denied}),e=>e.status===403);
 await f.forms.softDeleteForm({...f.ctx,formId:f.form.id});
 const history=await f.forms.listSubmissions({...f.ctx,formId:f.form.id});assert.equal(history.data[0].id,reply.id);assert.equal(history.data[0].definitionRevision,null);assert.ok(!('idempotencyKey' in history.data[0]));
});
test('disable after preparation blocks activation and retains the prior active publication',async()=>{
 const f=await formFixture(),old=await f.prepare();await f.activate(old);
 const candidate=await f.prepare('disable-before-activate-prepare');await f.forms.softDeleteForm({...f.ctx,formId:f.form.id});
 await assert.rejects(f.activate(candidate,'disable-before-activate-attempt'),error('form_disabled',422));
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,old.id);
});
test('real public runtime and SDK render and submit a published Website form in isolated Chromium',{skip:process.env.RUNLY_WEBSITE_TEST_SKIP_BROWSER==='1'},async()=>{
 const f=await formFixture({namespaceRoot:'sites.localhost'});
 f.host=await db.websiteDomain.create({data:{hostname:'browser-'+n+'.localhost',companyId:f.company.id,siteId:f.site.id,kind:'platform',state:'assigned',ready:true}});
 await db.instanceConfig.upsert({where:{key:'initialized'},create:{key:'initialized',value:'true'},update:{value:'true'}});
 await db.websiteSite.update({where:{id:f.site.id},data:{turnstileSiteKey:'fixture-site-key',turnstileSecretKey:'fixture-secret'}});
 await f.forms.updateForm({...f.ctx,formId:f.form.id,data:{turnstileRequired:true}});
 const r=await f.prepare();await f.activate(r);
 const sdk=(await Promise.all(['runly-sdk.js','runly-sdk-chat.js','runly-sdk-chat-widget.js'].map(file=>readFile(resolve('apps/api/src/public',file),'utf8')))).join('\n');
 const app=new Hono(),capture=createStorefrontCaptureService({prisma:db,verifyTurnstile:async({token,encryptedSecretKey})=>{assert.equal(encryptedSecretKey,'fixture-secret');return token==='fixture-turnstile-response'}});
 app.use('*',createWebsiteOriginGuard({gateway:f.publication.gateway,adminHosts:['erp.example.test']}));
 app.route('/public/website',createPublicWebsiteRouter({prisma:db,publicationContext:f.publication}));
 app.route('/public/storefront/v1',createStorefrontCaptureRoutes({captureService:capture}));
 app.get('/public/site/runly-sdk.js',c=>{c.header('Content-Type','text/javascript');return c.body(sdk)});
 const dist=createDistServeService({prisma:db,publicationContext:f.publication});app.get('*',c=>dist.serve(c,c.req.path.startsWith('/public/site')?c.req.path.slice('/public/site'.length)||'/':c.req.path));
 let server,browser;
 try{
  const address=await new Promise(resolve=>{server=serve({fetch:request=>{const u=new URL(request.url);if(!u.pathname.startsWith('/public/'))u.pathname='/public/site'+u.pathname;return app.fetch(new Request(u,request))},hostname:'127.0.0.1',port:0},resolve)});
  browser=await chromium.launch({headless:true});const context=await browser.newContext();
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='challenges.cloudflare.com'&&u.pathname==='/turnstile/v0/api.js')return route.fulfill({contentType:'text/javascript',body:"for(const el of document.querySelectorAll('.cf-turnstile')){const input=document.createElement('input');input.type='hidden';input.name='cf-turnstile-response';input.value='fixture-turnstile-response';el.appendChild(input)}"});return u.hostname===f.host.hostname&&u.port===String(address.port)?route.continue():route.abort()});
  const page=await context.newPage();page.on('pageerror',e=>console.log('BROWSER_ERROR',e.message));page.on('response',r=>{if(r.status()>=400)console.log('BROWSER_HTTP',r.status(),new URL(r.url()).pathname)});const base='http://'+f.host.hostname+':'+address.port;
  const navigation=await page.goto(base+'/?edit=1');assert.equal(navigation.status(),200);assert.match(navigation.headers()['content-security-policy'],/frame-src https:\/\/challenges.cloudflare.com/);
  try{await page.getByLabel('Correo').fill('browser@example.test',{timeout:10000})}catch(e){console.log('BROWSER_BODY',await page.locator('body').innerText());throw e}
  await page.locator('[name="cf-turnstile-response"]').waitFor({state:'attached'});
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/submissions'));
  await page.getByRole('button',{name:'Enviar',exact:true}).click();const response=await responsePromise;
  assert.equal(response.status(),201);const body=await response.json();
  const saved=await db.websiteFormSubmission.findUnique({where:{id:body.data.submissionId}});assert.equal(saved.formId,f.form.id);assert.deepEqual(saved.data,{email:'browser@example.test'});
  const site=await db.websiteSite.findUnique({where:{id:f.site.id}});
  await f.publication.releases.unpublish({...f.args,expectedPublicationRevision:site.publicationRevision,idempotencyKey:'browser-unpublish-attempt'});
  const status=await page.evaluate(async({company,siteId,formId})=>(await fetch('/public/storefront/v1/forms/'+formId+'/submissions',{method:'POST',headers:{'Content-Type':'application/json','X-Runly-Company':company,'X-Runly-Website-Site':siteId,'Idempotency-Key':'withdrawn-form-response'},body:JSON.stringify({values:{email:'blocked@example.test'}})})).status,{company:f.company.slug,siteId:f.site.id,formId:f.form.id});
  assert.equal(status,404);assert.equal(await db.websiteFormSubmission.count({where:{formId:f.form.id}}),1);
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve))}
});

test('two connections enforce withdrawal, disable and definition changes while verification is in flight',async()=>{
 for(const action of ['disable','withdraw','definition']){
  const f=await formFixture();await db.websiteSite.update({where:{id:f.site.id},data:{turnstileSiteKey:'fixture-site-key',turnstileSecretKey:'fixture-secret'}});await f.forms.updateForm({...f.ctx,formId:f.form.id,data:{turnstileRequired:true}});const release=await f.prepare();await f.activate(release);
  let entered,finish;const reached=new Promise(r=>entered=r),verified=new Promise(r=>finish=r);
  const capture=createStorefrontCaptureService({prisma:db,verifyTurnstile:async()=>{entered();return verified}});
  const submitting=capture.submitForm({companySlug:f.company.slug,websiteSiteId:f.site.id,formId:f.form.id,origin:'https://'+f.host.hostname,idempotencyKey:'in-flight-'+action,payload:{values:{email:'race@example.test'},turnstileToken:'fixture'}});
  const rejected=assert.rejects(submitting,e=>action==='definition'?e.code==='form_definition_changed'&&e.status===409:e.status===404);
  await reached;
  if(action==='disable')await createFormsService({prisma:peer}).softDeleteForm({...f.ctx,formId:f.form.id});
  if(action==='definition')await createFormsService({prisma:peer}).updateForm({...f.ctx,formId:f.form.id,data:{name:'Changed during verification'}});
  if(action==='withdraw'){
   const current=await peer.websiteSite.findUnique({where:{id:f.site.id}});
   await createWebsitePublicationContext({prisma:peer,storage:f.storage,runtime:async()=>runtime}).releases.unpublish({...f.args,expectedPublicationRevision:current.publicationRevision,idempotencyKey:'in-flight-withdraw-command'});
  }
  finish(true);await rejected;assert.equal(await db.websiteFormSubmission.count({where:{formId:f.form.id}}),0);
 }
});

test('migration preserves historical response data, owner IDs and unknown definition context',async()=>{
 const response=await db.websiteFormSubmission.findUnique({where:{id:'01900000-0000-7000-8000-000000000906'}});
 assert.deepEqual(response.data,{historical:'response'});assert.equal(response.formId,'01900000-0000-7000-8000-000000000905');assert.equal(response.definitionRevision,null);assert.equal(response.ownerScopeId,null);
 assert.equal(await db.websiteFormScope.count({where:{formId:response.formId}}),0);
 const form=await db.websiteForm.findUnique({where:{id:response.formId}});assert.equal(form.siteId,'01900000-0000-7000-8000-000000000902');
});

test('REST and SDK expose contextual state, preflight and form DTOs with no-store and no receipt key',async()=>{
 const f=await formFixture(),app=createWebsiteRouter({prisma:db,publicationContext:f.publication,supabaseAdmin:{},requirePermission:testPermission(ALL,f.company.id,f.actor.id)});
 const sdk=createWebsiteDomain({withAuthHeaders:()=>({'Content-Type':'application/json',Authorization:'Bearer fixture'}),request:async(path,options)=>{const r=await app.request(path,options);assert.equal(r.headers.get('Cache-Control'),'no-store');const body=await r.json();if(!r.ok)throw Object.assign(Error('Request failed'),{status:r.status,code:body.code});return body}});
 assert.equal((await sdk.getSiteState(f.site.id)).data.id,f.site.id);
 const report=await sdk.preflightRelease(f.site.id,{kind:'builder',changes:{publishPageIds:[f.page.id]}});assert.equal(report.data.canPublish,true);
 const forms=await sdk.listSiteForms(f.site.id);assert.equal(forms.data[0].owner.kind,'website');assert.equal(forms.data[0].publishability.usedBy[0].pageId,f.page.id);
 assert.equal((await sdk.getPublicationIntegrity(f.site.id)).data.integrityMode,'legacy-reference');
 assert.equal((await sdk.resolveFormScope(f.site.id,f.form.id,{expectedLegacySiteId:f.site.id})).data.formId,f.form.id);
 const foreign=await fixture();await assert.rejects(sdk.getSiteState(foreign.site.id),e=>e.status===404);
});

test('required Turnstile without configured keys is a structured publication blocker',async()=>{
 const f=await formFixture();await f.forms.updateForm({...f.ctx,formId:f.form.id,data:{turnstileRequired:true}});
 const status=await f.publication.contracts.form({...f.args,formId:f.form.id});assert.equal(status.state,'dependency_unavailable');
 const report=await f.publication.releases.preflight({...f.args,changes:{publishPageIds:[f.page.id]}});assert.equal(report.canPublish,false);assert.equal(report.issues[0].code,'dependency_unavailable');assert.equal(report.issues[0].blockId,'contact');
});

test('historical foreign assignee blocks publication without exposing that user or moving ownership',async()=>{
 const f=await formFixture(),other=await fixture();
 await db.websiteForm.update({where:{id:f.form.id},data:{defaultAssigneeUserId:other.actor.id,createsLead:true}});
 const state=await f.publication.contracts.form({...f.args,formId:f.form.id});assert.equal(state.state,'dependency_unavailable');assert.equal(state.reason.dependency,'assignee');
 const report=await f.publication.releases.preflight({...f.args,changes:{publishPageIds:[f.page.id]}});assert.equal(report.canPublish,false);assert.ok(!JSON.stringify(report).includes(other.actor.id));
 assert.equal((await db.websiteFormScope.findFirst({where:{formId:f.form.id}})).ownerWebsiteSiteId,f.site.id);
});

test('a form published in a blog route records the blog identity without mislabeling it as WebsitePage',async()=>{
 const f=await formFixture(),post=await db.websiteBlogPost.create({data:{companyId:f.company.id,siteId:f.site.id,title:'Form post',slug:'form-post',draftBuilderData:formDoc(f.form.id)}});
 const release=await f.prepare('blog-form-prepare-attempt',{changes:{publishPageIds:[],publishPostIds:[post.id]}});await f.activate(release);
 const result=await createStorefrontCaptureService({prisma:db}).submitForm({companySlug:f.company.slug,websiteSiteId:f.site.id,pageId:post.id,formId:f.form.id,origin:'https://'+f.host.hostname,idempotencyKey:'blog-form-response-key',payload:{values:{email:'blog@example.test'}}});
 const saved=await db.websiteFormSubmission.findUnique({where:{id:result.submissionId}});assert.equal(saved.pageId,null);assert.equal(saved.blogPostId,post.id);assert.equal(saved.releaseId,release.id);
});

test('C-2 verifies old sealed image bindings without inventing a change or rewriting history',async()=>{
 const f=await fixture(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
 const file=await db.fileAsset.create({data:{bucket:'fixture',objectKey:'pixel',originalName:'pixel.png',mimeType:'image/png',sizeBytes:bytes.length,entityId:f.company.id,uploadedById:f.actor.id,visibility:'PUBLIC'}});
 const document=doc('image');document.blocks.a.props.imageSrc='file:'+file.id;
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:document,expectedRevision:1});
 let reads=0;const publication=createWebsitePublicationContext({prisma:db,storage:f.storage,runtime:async()=>runtime,readFile:async()=>{reads++;return bytes}});
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}});
 const prepared=await publication.releases.prepare({...f.args,kind:'builder',expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,baseReleaseId:current.activeReleaseId,changes:{publishPageIds:[f.page.id]},idempotencyKey:'old-image-prepare-key'});
 const manifest=structuredClone(prepared.manifest);for(const ref of manifest.dynamic)if(ref.kind==='file')delete ref.contentRevision;
 const {websiteDocumentHash}=await import('../../../services/website-draft-service.js');
 const old=await db.websiteRelease.create({data:{companyId:f.company.id,siteId:f.site.id,actorId:f.actor.id,baseReleaseId:current.activeReleaseId,draftRevision:current.draftRevision,publicationRevision:current.publicationRevision,state:'ready',manifest,manifestHash:websiteDocumentHash(manifest)}});
 await f.activate(old,'old-image-activate-key',publication.releases);
 const before=reads;assert.equal((await publication.contracts.state(f.args)).hasUnpublishedChanges,false);assert.equal(reads,before+1);
 assert.deepEqual((await db.websiteRelease.findUnique({where:{id:old.id}})).manifest,manifest);
});

test('new forms use their explicit route owner even when historical site and property UUIDs coincide',async()=>{
 const f=await fixture();await db.growthProperty.create({data:{id:f.site.id,companyId:f.company.id,name:'Existing colliding property',kind:'external_sdk'}});
 const website=createFormsService({prisma:db}),growth=createFormsService({prisma:db,ownerDomain:'growth'});
 const webAccess=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p==='website.forms.create'}),growthAccess=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p==='growth.forms.create'});
 const web=await website.createForm({...f.args,access:webAccess,data:{name:'Explicit Website'}}),external=await growth.createForm({...f.args,access:growthAccess,data:{name:'Explicit Growth'}});
 assert.equal((await db.websiteFormScope.findFirst({where:{formId:web.id}})).ownerKind,'website');assert.equal((await db.websiteFormScope.findFirst({where:{formId:external.id}})).ownerKind,'growth_property');
 await assert.rejects(website.getForm({...f.ctx,formId:external.id}),e=>e.status===404);await assert.rejects(growth.getForm({...f.ctx,formId:web.id}),e=>e.status===404);
});
