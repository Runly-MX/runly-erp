import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {PrismaClient} from '@prisma/client'
import {PrismaPg} from '@prisma/adapter-pg'
import JSZip from 'jszip'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {Hono} from 'hono'
import {createWebsiteService} from '../website-service.js'
import {createWebsiteAccess} from '../../../services/website-authorization-service.js'
import {createWebsitePublicationContext} from '../../../services/website-publication-context.js'
import {createWebsiteContentIsolation} from '../../../services/website-content-isolation.js'
import {STATIC_ZIP_POLICY} from '../../../services/website-zip-policy.js'
import {createWebsitePreviewHandler} from '../preview-routes.js'
import {createWebsiteRouter} from '../index.js'
import {createDistServeService} from '../../../services/dist-serve-service.js'
import {createWebsiteDomain} from '../../../../../../packages/sdk/src/domains/website.js'
import {testPermission,ALL} from './security-fixtures.js'
const url=process.env.RUNLY_WEBSITE_TEST_DATABASE_URL,marker=process.env.RUNLY_WEBSITE_TEST_DISPOSABLE
if(!url||new URL(url).hostname!=='127.0.0.1'||new URL(url).pathname!=='/website_s2_test'||!/^runly-website-test-[a-f0-9-]+$/.test(marker??''))throw Error('Disposable runner required')
if(execFileSync('docker',['port',marker,'5432/tcp'],{encoding:'utf8'}).trim()!==`127.0.0.1:${new URL(url).port}`)throw Error('Not the disposable database')
let db,root,n=0
before(async()=>{db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});root=await mkdtemp(join(tmpdir(),'website-s4-'))})
after(async()=>{await db?.$disconnect();if(root&&resolve(root).startsWith(resolve(tmpdir())))await rm(root,{recursive:true})})
const zip=async(files={'index.html':'<!doctype html><title>Private test</title><h1>ZIP test</h1>','assets/a-1.js':'console.log("fixture")'})=>{const z=new JSZip();for(const [p,b]of Object.entries(files))z.file(p,b);return z.generateAsync({type:'nodebuffer'})}
const uuid=async()=>(await db.$queryRaw`SELECT uuidv7()::text id`)[0].id
async function fixture() {
 const k=++n,folder=join(root,String(k)),objects=new Map()
 const storage={async put(key,bytes){const path=resolve(folder,key);assert.ok(path.startsWith(folder));await mkdir(resolve(path,'..'),{recursive:true});try{await writeFile(path,bytes,{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(path),bytes)}objects.set(key,bytes)},async get(key){return readFile(resolve(folder,key))}}
 const company=await db.company.create({data:{id:await uuid(),name:'Import test',slug:`import-${k}`}}),actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),email:`import-${k}@example.test`,displayName:'Import test'}})
 const access=createWebsiteAccess({companyId:company.id,actorId:actor.id,can:()=>true}),ctx={companyId:company.id,access}
 const isolation=createWebsiteContentIsolation({adminOrigin:'https://erp.runly.test',contentRoot:'sites.untrusted.test',previewRoot:'preview.untrusted.test'})
 const publication=createWebsitePublicationContext({prisma:db,storage,isolation,runtime:async()=>({'entry.js':{bytes:Buffer.from('console.log("trusted test")'),mime:'text/javascript'}}),namespaceRoot:'sites.untrusted.test'})
 const svc=createWebsiteService({prisma:db,publicationContext:publication}),site=await svc.createSite({...ctx,data:{name:'Import site'}}),args={...ctx,siteId:site.id}
 const host=await publication.gateway.reserve({...args,slug:`import-${k}`}),c={req:{url:`https://${host.hostname}/`,header:k=>k==='host'?host.hostname:undefined}}
 const upload=async(bytes,key='import-artifact-attempt-key')=>publication.imports.create({...args,bytes,idempotencyKey:key})
 const prepare=async(imported,key='import-release-attempt-key')=>{const current=await db.websiteSite.findUnique({where:{id:site.id}});return publication.releases.prepare({...args,kind:'dist',importId:imported.id,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,baseReleaseId:current.activeReleaseId,idempotencyKey:key})}
 const activate=async(r,key='import-activate-attempt-key')=>publication.releases.activate({...args,releaseId:r.id,manifestHash:r.manifestHash,expectedDraftRevision:r.draftRevision,expectedPublicationRevision:r.publicationRevision,idempotencyKey:key})
 return {ctx,args,site,company,actor,publication,storage,objects,folder,host,c,svc,upload,prepare,activate}
}
test('private ZIP import is complete and idempotent without changing source or active pointer',async()=>{
 const f=await fixture(),bytes=await zip(),a=await f.upload(bytes),b=await f.upload(bytes)
 assert.equal(a.phase,'ready');assert.equal(a.id,b.id);assert.equal(a.manifest.files.length,2)
 const site=await db.websiteSite.findUnique({where:{id:f.site.id}});assert.equal(site.activeReleaseId,null);assert.equal(site.sourceType,'builder')
 await assert.rejects(f.upload(await zip({'index.html':'changed'})),e=>e.code==='idempotency_conflict')
 assert.ok([...f.objects.keys()].every(k=>k.startsWith(`company/${f.company.id}/site/${f.site.id}/`)))
})
test('dist activation, history, rollback and withdrawal use the S3 transaction',async()=>{
 const f=await fixture(),a=await f.prepare(await f.upload(await zip()));await f.activate(a)
 const b=await f.prepare(await f.upload(await zip({'index.html':'second','assets/a-2.js':'second'}),'second-import-attempt-key'),'second-release-attempt-key');await f.activate(b,'second-activate-attempt-key')
 await f.publication.releases.rollback({...f.args,releaseId:a.id,expectedPublicationRevision:2,idempotencyKey:'import-rollback-attempt-key'})
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,a.id);assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),3)
 await f.publication.releases.unpublish({...f.args,expectedPublicationRevision:3,idempotencyKey:'import-unpublish-attempt-key'});await assert.rejects(f.publication.gateway.resolve(f.c),e=>e.status===404)
})
test('same asset path with different bytes cannot activate or overwrite previous content',async()=>{
 const f=await fixture(),a=await f.prepare(await f.upload(await zip()));await f.activate(a)
 const b=await f.prepare(await f.upload(await zip({'index.html':'second','assets/a-1.js':'different'}),'asset-conflict-import-key'),'asset-conflict-release-key')
 await assert.rejects(f.activate(b,'asset-conflict-activate-key'),e=>e.code==='asset_path_conflict'&&e.status===422)
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,a.id)
})
test('a failed storage write preserves the previous release and immutable import',async()=>{
 const f=await fixture(),a=await f.prepare(await f.upload(await zip()));await f.activate(a)
 const p=createWebsitePublicationContext({prisma:db,storage:{...f.storage,put:async()=>{throw Error('private failure')}},isolation:{}})
 await assert.rejects(p.imports.create({...f.args,bytes:await zip({'index.html':'new'}),idempotencyKey:'network-failure-import-key'}),e=>e.status===503)
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,a.id)
 await assert.rejects(db.websiteImport.update({where:{id:a.manifest.importId},data:{archiveKey:'wrong'}}))
})
test('tenant and operation permissions protect imports, releases and previews before storage',async()=>{
 const a=await fixture(),b=await fixture(),imported=await a.upload(await zip())
 await assert.rejects(b.publication.imports.get({...b.args,importId:imported.id}),e=>e.status===404)
 const denied=createWebsiteAccess({companyId:a.company.id,actorId:a.actor.id,can:()=>false})
 await assert.rejects(a.publication.imports.create({...a.args,access:denied,bytes:await zip(),idempotencyKey:'unauthorized-import-key'}),e=>e.status===403)
 await assert.rejects(b.publication.previews.create({...b.args,releaseId:(await a.prepare(imported)).id}),e=>e.status===404)
})
test('registrable-domain isolation rejects brand origins and cannot be enabled by a request body',async()=>{
 for(const root of ['sites.runly.mx','preview.runly.mx','sites.runly.test']){const policy=createWebsiteContentIsolation({adminOrigin:'https://erp.runly.test',contentRoot:root});assert.throws(()=>policy.publicHost('tenant.'+root),e=>e.code==='isolation_required')}
 const f=await fixture(),r=await f.prepare(await f.upload(await zip()));await db.websiteDomain.create({data:{hostname:'legacy.runly.mx',companyId:f.company.id,siteId:f.site.id,kind:'legacy',state:'assigned',ready:true}})
 await assert.rejects(f.activate(r),e=>e.code==='isolation_required');assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('preview fragment is exchanged once for a host-only HttpOnly cookie, expires and revokes',async()=>{
 const f=await fixture(),r=await f.prepare(await f.upload(await zip())),preview=await f.publication.previews.create({...f.args,releaseId:r.id}),u=new URL(preview.url),token=u.hash.slice(1)
 assert.ok(!u.search);const cookie=await f.publication.previews.exchange(u.hostname,token,u.origin)
 assert.match(cookie,/^__Host-/);assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/)
 await assert.rejects(f.publication.previews.exchange(u.hostname,token,u.origin),e=>e.status===404)
 await assert.rejects(f.publication.previews.authorize(u.hostname,''),e=>e.status===404)
 assert.equal((await f.publication.previews.authorize(u.hostname,cookie.split(';')[0])).release.id,r.id)
 await f.publication.previews.revoke({...f.args,previewId:preview.id});await assert.rejects(f.publication.previews.authorize(u.hostname,cookie),e=>e.status===404)
 const second=await f.publication.previews.create({...f.args,releaseId:r.id});await db.websitePreviewSession.update({where:{id:second.id},data:{expiresAt:new Date(0)}});await assert.rejects(f.publication.previews.session(new URL(second.url).hostname),e=>e.status===404)
})
test('preview origin has no admin API, CORS, captures or cross-session resources',async()=>{
 const f=await fixture(),r=await f.prepare(await f.upload(await zip())),p=await f.publication.previews.create({...f.args,releaseId:r.id}),u=new URL(p.url),cookie=await f.publication.previews.exchange(u.hostname,u.hash.slice(1),u.origin)
 const app=new Hono();app.use('*',createWebsitePreviewHandler({...f.publication,prisma:db}));app.get('/auth/session',c=>c.text('ERP secret'))
 const headers={Host:u.host,Cookie:cookie.split(';')[0]},html=await app.request(u.origin+'/',{headers});assert.equal(html.status,200);assert.match(html.headers.get('content-security-policy'),/form-action 'none'/);assert.equal(html.headers.get('access-control-allow-origin'),null)
 assert.equal((await app.request(u.origin+'/public/storefront/forms/submit',{method:'POST',headers,body:'{}'})).status,404)
 assert.notEqual((await app.request(u.origin+'/auth/session',{headers})).status,200)
 const another=await f.publication.previews.create({...f.args,releaseId:r.id});assert.equal((await app.request(new URL(another.url).origin+'/',{headers:{...headers,Host:new URL(another.url).host}})).status,404)
})
test('static gateway preserves exact bytes, MPA routing and missing-asset 404 without SPA substitution',async()=>{
 const f=await fixture(),imported=await f.upload(await zip({'index.html':'<h1>Home</h1>','about/index.html':'<h1>About</h1>','assets/main-1.js':'console.log(1)'})),r=await f.prepare(imported);await f.activate(r)
 const serving=createDistServeService({prisma:db,publicationContext:f.publication}),app=new Hono();app.get('*',c=>serving.serve(c,c.req.path))
 const headers={Host:f.host.hostname,Accept:'text/html'}
 const canonical=await app.request(`https://${f.host.hostname}/about`,{headers});assert.equal(canonical.status,308);assert.equal(canonical.headers.get('location'),'/about/')
 assert.equal(await(await app.request(`https://${f.host.hostname}/about/`,{headers})).text(),'<h1>About</h1>')
 assert.equal((await app.request(`https://${f.host.hostname}/missing.js`,{headers})).status,404)
 assert.equal((await app.request(`https://${f.host.hostname}/missing-route`,{headers})).status,404)
 const js=await app.request(`https://${f.host.hostname}/assets/main-1.js`,{headers});assert.equal(await js.text(),'console.log(1)');assert.equal(js.headers.get('cache-control'),'no-store')
})
test('old asset aliases keep their bytes after another release and are withdrawn with the site',async()=>{
 const f=await fixture(),a=await f.prepare(await f.upload(await zip()));await f.activate(a)
 const b=await f.prepare(await f.upload(await zip({'index.html':'two','assets/b-2.js':'new'}),'old-alias-import-key'),'old-alias-release-key');await f.activate(b,'old-alias-activate-key')
 const app=new Hono(),serving=createDistServeService({prisma:db,publicationContext:f.publication});app.get('*',c=>serving.serve(c,c.req.path));const get=()=>app.request(`https://${f.host.hostname}/assets/a-1.js`,{headers:{Host:f.host.hostname}})
 assert.equal(await(await get()).text(),'console.log("fixture")')
 await f.publication.releases.unpublish({...f.args,expectedPublicationRevision:2,idempotencyKey:'alias-unpublish-attempt-key'});assert.equal((await get()).status,404)
})
test('REST/SDK prepare a private import and preview with the same tenant authority',async()=>{
 const f=await fixture(),app=createWebsiteRouter({prisma:db,publicationContext:f.publication,requirePermission:testPermission([...ALL,'website.domains.manage'],f.company.id,f.actor.id)})
 const sdk=createWebsiteDomain({withAuthHeaders:()=>({Authorization:'Bearer fixture'}),request:async(path,options)=>{const r=await app.request(path,options),body=await r.json();assert.ok(r.ok,JSON.stringify(body));return body}})
 const imported=await sdk.createImport(f.site.id,new File([await zip()],'test.zip'),{routingMode:'mpa'},'sdk-private-import-key','fixture');assert.equal(imported.data.phase,'ready');assert.equal((await sdk.getImport(f.site.id,imported.data.id,'fixture')).data.id,imported.data.id)
 const release=await f.prepare(imported.data),preview=await sdk.createPreview(f.site.id,{releaseId:release.id},'fixture');assert.equal((await sdk.revokePreview(f.site.id,preview.data.id,'fixture')).data.revoked,true)
})
test('builder draft preview does not require publish and can never be activated',async()=>{
 const f=await fixture(),page=await f.svc.createPage({...f.ctx,siteId:f.site.id,data:{title:'Draft',slug:'draft',routePath:'/'}})
 const document={schemaVersion:1,regions:{main:{children:['a']}},blocks:{a:{id:'a',type:'HeroBlock',props:{title:'Private draft'}}}}
 await f.svc.saveDraft({...f.ctx,pageId:page.id,builderData:document,expectedRevision:0})
 const editor=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>['website.site.read','website.pages.read','website.pages.update'].includes(p)}),site=await db.websiteSite.findUnique({where:{id:f.site.id}})
 const preview=await f.publication.previews.create({...f.args,access:editor,expectedDraftRevision:site.draftRevision,expectedPublicationRevision:0,baseReleaseId:null,changes:{publishPageIds:[page.id]}})
 const r=await db.websiteRelease.findUnique({where:{id:preview.releaseId}});assert.equal(r.manifest.previewOnly,true);await assert.rejects(f.activate(r),e=>e.code==='preview_not_publishable')
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('concurrent same-key imports have one claimed job and immutable receipt',async()=>{
 const f=await fixture(),bytes=await zip(),rows=await Promise.all([f.upload(bytes),f.upload(bytes)])
 assert.equal(rows[0].id,rows[1].id);assert.equal(await db.websiteImport.count({where:{siteId:f.site.id}}),1)
 assert.equal((await f.publication.imports.get({...f.args,importId:rows[0].id})).phase,'ready')
})
test('dist transaction fault rolls back pointer, bindings, audit and event',async()=>{
 const f=await fixture(),r=await f.prepare(await f.upload(await zip()))
 const faulty=createWebsitePublicationContext({prisma:db,storage:f.storage,isolation:createWebsiteContentIsolation({adminOrigin:'https://erp.runly.test',contentRoot:'sites.untrusted.test'}),beforeCommit:async()=>{throw Error('injected commit fault')}})
 await assert.rejects(faulty.releases.activate({...f.args,releaseId:r.id,manifestHash:r.manifestHash,expectedDraftRevision:r.draftRevision,expectedPublicationRevision:0,idempotencyKey:'dist-commit-fault-attempt'}))
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null);assert.equal(await db.websitePublicAssetBinding.count({where:{siteId:f.site.id}}),0);assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),0)
})
test('SPA fallback is explicit, HTML navigation only and never replaces a missing chunk',async()=>{
 const f=await fixture(),i=await f.publication.imports.create({...f.args,bytes:await zip(),routingMode:'spa',idempotencyKey:'spa-routing-import-attempt'}),r=await f.prepare(i);await f.activate(r)
 const serving=createDistServeService({prisma:db,publicationContext:f.publication}),app=new Hono();app.get('*',c=>serving.serve(c,c.req.path))
 const get=(path,accept)=>app.request(`https://${f.host.hostname}${path}`,{headers:{Host:f.host.hostname,Accept:accept}})
 assert.equal((await get('/nested/route','text/html')).status,200);assert.equal((await get('/nested/route','application/json')).status,404);assert.equal((await get('/missing.js','text/html')).status,404)
})
test('wrong-origin bootstrap cannot consume a preview grant and byte corruption blocks activation',async()=>{
 const f=await fixture(),r=await f.prepare(await f.upload(await zip())),p=await f.publication.previews.create({...f.args,releaseId:r.id}),u=new URL(p.url)
 await assert.rejects(f.publication.previews.exchange(u.hostname,u.hash.slice(1),'https://erp.runly.test'),e=>e.status===404)
 assert.ok(await f.publication.previews.exchange(u.hostname,u.hash.slice(1),u.origin))
 const ref=r.manifest.files[0];await writeFile(resolve(f.folder,ref.objectKey),'corrupted');await assert.rejects(f.activate(r),e=>e.code==='integrity_failed')
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('legacy ZIP autopublish is idempotent and uses the same import and release journal',async()=>{
 const f=await fixture(),app=createWebsiteRouter({prisma:db,publicationContext:f.publication,requirePermission:testPermission([...ALL,'website.domains.manage'],f.company.id,f.actor.id)}),bytes=await zip()
 async function send(){const form=new FormData();form.append('file',new File([bytes],'legacy.zip'));return app.request(`/website/sites/${f.site.id}/dist/upload`,{method:'POST',headers:{Authorization:'Bearer fixture','Idempotency-Key':'legacy-zip-publish-attempt'},body:form})}
 assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),1)
 const legacy=new FormData();legacy.append('file',new File([bytes],'legacy.zip'));const noKey=()=>app.request(`/website/sites/${f.site.id}/dist/upload`,{method:'POST',headers:{Authorization:'Bearer fixture'},body:legacy});assert.equal((await noKey()).status,200);assert.equal((await noKey()).status,200);assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),2)
 const projected=await db.websiteSite.findUnique({where:{id:f.site.id}});assert.equal(projected.distFileCount,2);assert.ok(projected.distUploadedAt)
})
test('switching back to builder never reclassifies executable ZIP bytes as trusted resources',async()=>{
 const f=await fixture(),dist=await f.prepare(await f.upload(await zip()));await f.activate(dist)
 const page=await f.svc.createPage({...f.ctx,siteId:f.site.id,data:{title:'Builder',slug:'builder',routePath:'/'}}),document={schemaVersion:1,regions:{main:{children:['a']}},blocks:{a:{id:'a',type:'HeroBlock',props:{title:'Trusted renderer'}}}}
 await f.svc.saveDraft({...f.ctx,pageId:page.id,builderData:document,expectedRevision:0})
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}}),builder=await f.publication.releases.prepare({...f.args,kind:'builder',baseReleaseId:dist.id,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:1,changes:{publishPageIds:[page.id]},idempotencyKey:'switch-to-builder-release-key'})
 assert.deepEqual(builder.manifest.assets,{})
 await f.activate(builder,'switch-to-builder-activate-key')
 await db.websiteDomain.create({data:{hostname:'later.runly.mx',companyId:f.company.id,siteId:f.site.id,kind:'legacy',state:'assigned',ready:true}})
 const request={req:{url:'https://later.runly.mx/',header:k=>k==='host'?'later.runly.mx':undefined}},html=dist.manifest.files.find(f=>f.mime==='text/html')
 await assert.rejects(f.publication.gateway.asset(request,dist.id,html.hash),e=>e.code==='isolation_required')
 await assert.rejects(f.publication.gateway.asset(request,builder.id,html.hash),e=>e.status===404)
})
test('a stalled Storage request times out, remains private and cannot resume into a ready import',async()=>{
 const f=await fixture();let resume,reads=0
 const p=createWebsitePublicationContext({prisma:db,storage:{put:()=>new Promise(resolve=>{resume=resolve}),get:async()=>{reads++;return Buffer.from('unexpected')}},importLimits:{...STATIC_ZIP_POLICY,timeout:50}})
 await assert.rejects(p.imports.create({...f.args,bytes:await zip(),idempotencyKey:'stalled-storage-import-key'}),e=>e.code==='archive_timeout'&&e.status===413)
 assert.equal((await db.websiteImport.findFirst({where:{siteId:f.site.id}})).phase,'failed')
 resume();await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,0);assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('expiry recovery never mutates another company and does not let stale foreign jobs block capacity',async()=>{
 const a=await fixture(),b=await fixture(),stale=await db.websiteImport.create({data:{companyId:b.company.id,siteId:b.site.id,actorId:b.actor.id,archiveHash:'synthetic-stale-hash',archiveKey:'synthetic-stale-key',phase:'validating',createdAt:new Date(Date.now()-60000)}})
 assert.equal((await a.upload(await zip())).phase,'ready')
 assert.equal((await db.websiteImport.findUnique({where:{id:stale.id}})).phase,'validating')
 assert.equal((await b.upload(await zip())).phase,'ready')
 assert.equal((await db.websiteImport.findUnique({where:{id:stale.id}})).phase,'failed')
})
