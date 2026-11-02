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
async function fixture() {
 const k=++n,folder=join(root,String(k)),files=new Map()
 const storage={async put(key,bytes,mime){const path=resolve(folder,key);assert.ok(path.startsWith(resolve(folder)));await mkdir(resolve(path,'..'),{recursive:true});try{await writeFile(path,bytes,{flag:'wx'});files.set(key,{bytes,mime})}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(await readFile(path),bytes)}},async get(key){const path=resolve(folder,key);assert.ok(path.startsWith(resolve(folder)));return readFile(path)}}
 const company=await db.company.create({data:{id:await uuid(),name:'Release fixture',slug:`release-${k}`}})
 const actor=await db.userProfile.create({data:{id:await uuid(),authUserId:await uuid(),email:`release-${k}@example.test`,displayName:'Release test'}})
 const access=createWebsiteAccess({companyId:company.id,actorId:actor.id,can:()=>true})
 const ctx={companyId:company.id,access},publication=createWebsitePublicationContext({prisma:db,storage,runtime:async()=>runtime,namespaceRoot:'sites.example.test',adminHosts:['erp.example.test']})
 const svc=createWebsiteService({prisma:db,publicationContext:publication}),site=await svc.createSite({...ctx,data:{name:'A'}})
 const page=await svc.createPage({...ctx,siteId:site.id,data:{title:'Home',slug:'home',routePath:'/'}})
 await svc.saveDraft({...ctx,pageId:page.id,builderData:doc('first'),expectedRevision:0})
 const args={...ctx,siteId:site.id},host=await publication.gateway.reserve({...args,slug:`tenant-${k}`})
 const prepare=async(key=`release-prepare-attempt-${k}`,extra={})=>{const current=await db.websiteSite.findUnique({where:{id:site.id}});return publication.releases.prepare({...args,kind:'builder',baseReleaseId:current.activeReleaseId,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:current.publicationRevision,changes:{publishPageIds:[page.id],includeThemeAndMenus:true},idempotencyKey:key,...extra})}
 const activate=(r,key=`release-activate-attempt-${k}`,engine=publication.releases)=>engine.activate({...args,releaseId:r.id,expectedDraftRevision:r.draftRevision,expectedPublicationRevision:r.publicationRevision,manifestHash:r.manifestHash,idempotencyKey:key})
 const c={req:{url:`http://${host.hostname}/`,header:name=>name.toLowerCase()==='host'?host.hostname:undefined}}
 return {ctx,args,company,actor,site,page,svc,publication,prepare,activate,storage,files,folder,host,c}
}
test('initial release is prepared privately then activated atomically with audit, event and outbox',async()=>{
 const f=await fixture(),r=await f.prepare();assert.equal(r.state,'ready');assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
 await f.activate(r);const out=await f.publication.gateway.resolve(f.c);assert.equal(out.release.id,r.id);assert.equal(out.release.manifest.routes[0].document.blocks.a.props.title,'first')
 assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),1);assert.equal(await db.websitePublicationOutbox.count({where:{siteId:f.site.id}}),1)
})
test('draft editing and a theme change do not mutate a sealed publication',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('private'),seo:{title:'private'},expectedRevision:1})
 await f.svc.createTheme({...f.ctx,siteId:f.site.id,data:{name:'New theme'}})
 const result=await f.publication.gateway.resolve(f.c);assert.equal(result.release.manifest.routes[0].document.blocks.a.props.title,'first');assert.equal(result.release.manifestHash,r.manifestHash)
})
test('second release and rollback preserve the first manifest and current editable draft',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a)
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('second'),expectedRevision:1})
 const b=await f.prepare('second-release-prepare-key');await f.activate(b,'second-release-activate-key')
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,b.id)
 const site=await db.websiteSite.findUnique({where:{id:f.site.id}})
 await f.publication.releases.rollback({...f.args,releaseId:a.id,expectedPublicationRevision:site.publicationRevision,idempotencyKey:'rollback-release-attempt-01'})
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,a.id)
 assert.equal((await db.websitePage.findUnique({where:{id:f.page.id}})).draftBuilderData.blocks.a.props.title,'second')
 assert.deepEqual((await db.websiteRelease.findUnique({where:{id:a.id}})).manifest,a.manifest)
})
test('concurrent publications have one CAS winner and leave no partial history',async()=>{
 const f=await fixture(),a=await f.prepare('concurrent-prepare-attempt-a'),b=await f.prepare('concurrent-prepare-attempt-b')
 const peerPub=createWebsitePublicationContext({prisma:peer,storage:f.storage,runtime:async()=>runtime})
 const results=await Promise.allSettled([f.activate(a,'concurrent-activate-key-a'),f.activate(b,'concurrent-activate-key-b',peerPub.releases)])
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'publication_conflict')
 assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),1)
})
test('a changed draft cannot activate an older prepared candidate',async()=>{
 const f=await fixture(),r=await f.prepare();await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('newer'),expectedRevision:1})
 await assert.rejects(f.activate(r),error('draft_changed'));assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('preparation and commit failure injection retain the old pointer and roll back the entire event',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a)
 const failing=createWebsitePublicationContext({prisma:db,storage:f.storage,runtime:async()=>runtime,afterPrepare:async()=>{throw new Error('synthetic failure')}})
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}})
 await assert.rejects(failing.releases.prepare({...f.args,baseReleaseId:a.id,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:1,changes:{publishPageIds:[f.page.id]},idempotencyKey:'failing-prepare-attempt-01'}),error('preparation_failed'))
 const b=await f.prepare('valid-second-candidate-key')
 const crash=createWebsitePublicationContext({prisma:db,storage:f.storage,runtime:async()=>runtime,beforeCommit:async()=>{throw new Error('synthetic commit failure')}})
 await assert.rejects(f.activate(b,'failing-commit-attempt-01',crash.releases))
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,a.id);assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),1)
})
test('activation replay is idempotent even after rollback and never reactivates the later release',async()=>{
 const f=await fixture(),a=await f.prepare();const first=await f.activate(a);assert.deepEqual(await f.activate(a),first)
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('second'),expectedRevision:1});const b=await f.prepare('retry-second-prepare-key');const activated=await f.activate(b,'retry-second-activate-key')
 await f.publication.releases.rollback({...f.args,releaseId:a.id,expectedPublicationRevision:2,idempotencyKey:'retry-rollback-attempt-key'})
 const replay=await f.activate(b,'retry-second-activate-key');assert.equal(replay.activeReleaseId,activated.activeReleaseId);assert.equal(replay.current.activeReleaseId,a.id)
 assert.equal(await db.websitePublicationEvent.count({where:{siteId:f.site.id}}),3)
})
test('sealed manifests, history and hostname owners cannot be rewritten or deleted with SQL',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 await assert.rejects(db.websiteRelease.update({where:{id:r.id},data:{manifest:{attack:true}}}))
 await assert.rejects(db.websiteRelease.delete({where:{id:r.id}}))
 await assert.rejects(db.websiteDomain.update({where:{hostname:f.host.hostname},data:{siteId:null,companyId:null}}))
 const event=await db.websitePublicationEvent.findFirst({where:{siteId:f.site.id}});await assert.rejects(db.websitePublicationEvent.delete({where:{id:event.id}}))
})
test('gateway rejects unknown and injected hosts and ignores untrusted forwarded authority',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 for(const hostname of ['unknown.sites.example.test','evil.test,'+f.host.hostname,'evil.test/path','user@'+f.host.hostname])await assert.rejects(f.publication.gateway.resolve({req:{url:'http://api.test/',header:k=>k==='host'?hostname:undefined}}))
 const resolved=await f.publication.gateway.resolve({req:{url:'http://api.test/',header:k=>k==='host'?f.host.hostname:k==='x-forwarded-host'?'evil.test':undefined}});assert.equal(resolved.site.id,f.site.id)
})
test('hostname reservations reject protected labels, duplicates and never transfer on archive',async()=>{
 const a=await fixture(),b=await fixture();await assert.rejects(a.publication.gateway.reserve({...a.args,slug:'admin'}),error('hostname_reserved'))
 await assert.rejects(b.publication.gateway.reserve({...b.args,slug:a.host.hostname.split('.')[0]}),error('hostname_taken'))
 await a.svc.deleteSite({...a.ctx,siteId:a.site.id});await assert.rejects(b.publication.gateway.reserve({...b.args,slug:a.host.hostname.split('.')[0]}),error('hostname_taken'))
})
test('cross-tenant release IDs cannot activate, roll back or expose assets',async()=>{
 const a=await fixture(),b=await fixture(),r=await b.prepare();await b.activate(r)
 await assert.rejects(a.activate(r),e=>e.status===404)
 await assert.rejects(a.publication.releases.rollback({...a.args,releaseId:r.id,expectedPublicationRevision:0,idempotencyKey:'foreign-rollback-attempt'}),e=>e.status===404)
 await assert.rejects(a.publication.gateway.asset(a.c,r.id,Object.values(r.manifest.runtime.assets)[0].hash),e=>e.status===404)
})
test('unpublish withdraws tenant JSON and old runtime assets on the next request in another gateway instance',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 const other=createWebsitePublicationContext({prisma:peer,storage:f.storage,runtime:async()=>runtime})
 assert.equal((await other.gateway.resolve(f.c)).release.id,r.id)
 await f.publication.releases.unpublish({...f.args,expectedPublicationRevision:1,idempotencyKey:'unpublish-attempt-test-01'})
 await assert.rejects(other.gateway.resolve(f.c),e=>e.status===404)
 await assert.rejects(other.gateway.asset(f.c,r.id,r.manifest.runtime.assets['entry.js'].hash),e=>e.status===404)
})
test('physical runtime objects are reused and every served object is verified against its manifest',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a);const count=f.files.size
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('second'),expectedRevision:1});const b=await f.prepare('resource-second-prepare-key');await f.activate(b,'resource-second-activate-key')
 assert.equal(f.files.size,count)
 const ref=b.manifest.runtime.assets['entry.js'];await writeFile(resolve(f.folder,ref.objectKey),'tampered')
 await assert.rejects(f.publication.gateway.asset(f.c,b.id,ref.hash),error('integrity_failed',503))
})
test('unknown blocks and mutable external media cannot produce a ready release',async()=>{
 const f=await fixture(),bad=doc('bad');bad.blocks.a.type='MissingHistoricalBlock';await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:bad,expectedRevision:1})
 await assert.rejects(f.prepare(),error('unknown_block_type'))
 const media=doc('media');media.blocks.a.props.imageSrc='https://images.example.test/changed.png';await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:media,expectedRevision:2})
 await assert.rejects(f.prepare('external-media-attempt-key'),error('asset_requires_pinning'))
 const active=doc('<object data=evil></object>');await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:active,expectedRevision:3});await assert.rejects(f.prepare('active-html-attempt-key'),error('unsafe_content',422))
})
test('REST, SDK and legacy publish use the same release commands and publish the supplied content',async()=>{
 const f=await fixture(),admin=new Hono();admin.route('/website',new Hono())
 admin.route('/',createWebsiteRouter({prisma:db,publicationContext:f.publication,supabaseAdmin:{},requirePermission:testPermission([...ALL,'website.domains.manage'],f.company.id,f.actor.id)}))
 const sdk=createWebsiteDomain({withAuthHeaders:()=>({Authorization:'Bearer fixture','Content-Type':'application/json'}),request:async(path,options={})=>{const r=await admin.request(path,options);const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error),{status:r.status,code:body.code});return body}})
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}})
 const prepared=await sdk.prepareRelease(f.site.id,{kind:'builder',baseReleaseId:null,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:0,changes:{publishPageIds:[f.page.id]}},'sdk-prepare-attempt-key','token')
 await sdk.activateRelease(f.site.id,{releaseId:prepared.data.id,manifestHash:prepared.data.manifestHash,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:0},'sdk-activate-attempt-key','token')
 const response=await admin.request(`/website/pages/${f.page.id}/publish`,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json','Idempotency-Key':'legacy-content-attempt-key'},body:JSON.stringify({builderData:doc('payload newest'),expectedRevision:1})})
 assert.equal(response.status,200);assert.equal((await f.publication.gateway.resolve(f.c)).release.manifest.routes[0].document.blocks.a.props.title,'payload newest')
 assert.equal((await sdk.getRelease(f.site.id,prepared.data.id,'token')).data.id,prepared.data.id)
 assert.equal((await sdk.listReleases(f.site.id,'token',{limit:1})).data.length,1);assert.equal((await sdk.listDomains(f.site.id,'token')).data[0].hostname,f.host.hostname)
 await sdk.rollbackRelease(f.site.id,{releaseId:prepared.data.id,expectedPublicationRevision:2},'sdk-rollback-attempt-key','token')
 await sdk.unpublishSite(f.site.id,{expectedPublicationRevision:3},'sdk-unpublish-attempt-key','token');assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('MCP legacy publication is routed through immutable release activation',async()=>{
 const f=await fixture(),adapter=createWebsiteAdapter({prisma:db,publicationContext:f.publication}),action=adapter.actions.find(a=>a.key==='website.pages.publish')
 const actor={companyId:f.company.id,actorProfileId:f.actor.id,can:()=>true}
 const prepared=await action.prepare({siteId:f.site.id,pageIds:[f.page.id]},actor);await action.execute(prepared.input,actor)
 const first=(await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId;assert.ok(first)
 const history=await adapter.queries.find(q=>q.name==='website_releases').run({siteId:f.site.id},actor);assert.equal(history.data[0].id,first)
 for(const [op,expectedPublicationRevision]of [['rollback',1],['unpublish',2]]){const command=adapter.actions.find(a=>a.key===`website.publication.${op}`),input={siteId:f.site.id,releaseId:first,expectedPublicationRevision,idempotencyKey:`mcp-${op}-attempt-key`};await command.prepare(input,actor);await command.execute(input,actor)}
 assert.equal((await db.websiteSite.findUnique({where:{id:f.site.id}})).activeReleaseId,null)
})
test('public JSON/shell contain only the selected snapshot and no ERP/auth entry or storage key',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 const app=createPublicWebsiteRouter({prisma:db,supabaseAdmin:{},publicationContext:f.publication});await db.instanceConfig.upsert({where:{key:'initialized'},create:{key:'initialized',value:'true'},update:{value:'true'}})
 const response=await app.request(`http://${f.host.hostname}/resolve?path=/`,{headers:{Host:f.host.hostname}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
 const text=await response.text();assert.doesNotMatch(text,/objectKey|stripeSecret|turnstileSecret/)
 const serve=createDistServeService({prisma:db,publicationContext:f.publication});const h=new Hono();h.get('*',c=>serve.serve(c,'/'))
 const html=await h.request(`http://${f.host.hostname}/`,{headers:{Host:f.host.hostname}});assert.equal(html.status,200);assert.doesNotMatch(await html.text(),/\/app\/|AuthProvider|index\.html/)
})
test('administrative routes are unavailable on a bound public hostname, even with an auth header',async()=>{
 const f=await fixture(),app=new Hono();app.use('*',createWebsiteOriginGuard({prisma:db,gateway:f.publication.gateway,adminHosts:['erp.example.test']}));app.get('/auth/login',c=>c.text('private'));app.get('/app',c=>c.text('private'))
 for(const path of ['/auth/login','/app'])assert.equal((await app.request(`http://${f.host.hostname}${path}`,{headers:{Host:f.host.hostname,Authorization:'Bearer fixture'}})).status,404)
})

test('same-key concurrent preparation returns one immutable candidate',async()=>{
 const f=await fixture(),current=await db.websiteSite.findUnique({where:{id:f.site.id}})
 const args={...f.args,kind:'builder',baseReleaseId:null,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:0,changes:{publishPageIds:[f.page.id]},idempotencyKey:'same-prepare-concurrent-key'}
 const other=createWebsitePublicationContext({prisma:peer,storage:f.storage,runtime:async()=>runtime})
 const [a,b]=await Promise.all([f.publication.releases.prepare(args),other.releases.prepare(args)])
 assert.equal(a.id,b.id);assert.equal(a.manifestHash,b.manifestHash);assert.equal(await db.websiteRelease.count({where:{siteId:f.site.id}}),1)
})
test('publishing one page preserves unselected published pages and removes the old path of a moved page',async()=>{
 const f=await fixture(),second=await f.svc.createPage({...f.ctx,siteId:f.site.id,data:{title:'Second',slug:'second',routePath:'/second'}})
 await f.svc.saveDraft({...f.ctx,pageId:second.id,builderData:doc('second original'),expectedRevision:0})
 const first=await f.prepare('all-pages-first-release-key',{changes:{publishPageIds:[f.page.id,second.id]}});await f.activate(first)
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('moved'),metadata:{routePath:'/moved'},expectedRevision:1})
 await f.svc.saveDraft({...f.ctx,pageId:second.id,builderData:doc('private second'),expectedRevision:1})
 const next=await f.prepare('partial-publish-release-key');await f.activate(next,'partial-publish-activate-key')
 assert.ok(!next.manifest.routes.some(r=>r.path==='/'))
 assert.equal(next.manifest.routes.find(r=>r.sourceId===second.id).document.blocks.a.props.title,'second original')
 assert.ok(next.manifest.routes.some(r=>r.path==='/moved'))
})
test('a retired release cannot expose historical HTML while its assets may complete a loaded page',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a)
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:doc('next'),expectedRevision:1});const b=await f.prepare('retired-release-prepare-key');await f.activate(b,'retired-release-activate-key')
 const served=await f.publication.gateway.asset(f.c,a.id,a.manifest.runtime.assets['entry.js'].hash);assert.ok(served.bytes.length>0)
 const app=createPublicWebsiteRouter({prisma:db,publicationContext:f.publication,supabaseAdmin:{}})
 assert.equal((await app.request(`http://${f.host.hostname}/releases/${a.id}`,{headers:{Host:f.host.hostname}})).status,404)
 assert.equal((await f.publication.gateway.resolve(f.c)).release.id,b.id)
})
test('resource bytes are pinned once, never followed through mutable FileAsset metadata',async()=>{
 const f=await fixture(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB','base64')
 const file=await db.fileAsset.create({data:{bucket:'fixture',objectKey:'original',originalName:'pixel.png',mimeType:'image/png',sizeBytes:bytes.length,entityId:f.company.id,uploadedById:f.actor.id,visibility:'PUBLIC'}})
 const p=createWebsitePublicationContext({prisma:db,storage:f.storage,runtime:async()=>runtime,readFile:async()=>bytes})
 const document=doc('image');document.blocks.a.props.imageSrc=`file:${file.id}`
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:document,expectedRevision:1})
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}})
 const r=await p.releases.prepare({...f.args,baseReleaseId:null,expectedDraftRevision:current.draftRevision,expectedPublicationRevision:0,changes:{publishPageIds:[f.page.id]},idempotencyKey:'pin-resource-prepare-key'})
 await f.activate(r,'pin-resource-activate-key',p.releases)
 await db.fileAsset.update({where:{id:file.id},data:{objectKey:'changed-source'}})
 const ref=Object.values(r.manifest.assets)[0];assert.deepEqual((await p.gateway.asset(f.c,r.id,ref.hash)).bytes,bytes)
 assert.match(r.manifest.routes[0].document.blocks.a.props.imageSrc,/^\/public\/website\/releases\//)
})
test('historical URL binding survives migration without a primary-company fallback',async()=>{
 const f=await fixture(),c={req:{url:'http://history.example.test/old',header:k=>k==='host'?'history.example.test':undefined}}
 const resolved=await f.publication.gateway.resolve(c);assert.equal(resolved.site.id,'01900000-0000-7000-8000-000000000902');assert.equal(resolved.release,null)
 const app=createPublicWebsiteRouter({prisma:db,publicationContext:f.publication,supabaseAdmin:{}})
 const response=await app.request('http://history.example.test/resolve?path=/old',{headers:{Host:'history.example.test'}});assert.equal(response.status,200);assert.deepEqual((await response.json()).page.publishedBuilderData,{public:'original'})
})
test('a revoked release cannot be activated or used as rollback target',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a)
 await db.websiteRelease.update({where:{id:a.id},data:{state:'revoked'}})
 await assert.rejects(f.publication.gateway.resolve(f.c),error('integrity_failed',503))
 await assert.rejects(f.publication.releases.rollback({...f.args,releaseId:a.id,expectedPublicationRevision:1,idempotencyKey:'revoked-rollback-attempt'}),error('release_not_ready'))
})
test('no Storage calls occur while holding the publication transaction open',async()=>{
 const f=await fixture(),a=await f.prepare(),events=[]
 const traced={...f.storage,get:async key=>{events.push('storage');return f.storage.get(key)}}
 const original=db.$transaction.bind(db)
 const transaction=new Proxy(db,{get(target,key){return key==='$transaction'?async(callback,...args)=>{events.push('begin');return original(async tx=>{const result=await callback(tx);events.push('commit');return result},...args)}:Reflect.get(target,key)}})
 const pub=createWebsitePublicationContext({prisma:transaction,storage:traced,runtime:async()=>runtime})
 await f.activate(a,'no-storage-in-lock-attempt',pub.releases)
 assert.ok(events.includes('storage'));assert.ok(events.lastIndexOf('storage')<events.indexOf('begin'))
})
test('initial bootstrap never copies an unselected private published page',async()=>{
 const f=await fixture(),privatePage=await f.svc.createPage({...f.ctx,siteId:f.site.id,data:{title:'Private',slug:'private',routePath:'/private',visibility:'private'}})
 await db.websitePage.update({where:{id:privatePage.id},data:{status:'published',publishedBuilderData:doc('private data')}})
 const r=await f.prepare();assert.ok(!r.manifest.routes.some(r=>r.sourceId===privatePage.id));await f.activate(r)
 assert.equal(f.publication.gateway.response(await f.publication.gateway.resolve(f.c),'/private').page,null)
})
test('a release may explicitly unpublish a page without publishing another draft',async()=>{
 const f=await fixture(),a=await f.prepare();await f.activate(a)
 const b=await f.prepare('only-remove-page-attempt',{changes:{publishPageIds:[],unpublishPageIds:[f.page.id]}})
 await f.activate(b,'only-remove-activate-attempt');assert.equal((await f.publication.gateway.resolve(f.c)).release.manifest.routes.length,0)
 const row=await db.websitePage.findUnique({where:{id:f.page.id}});assert.equal(row.status,'draft');assert.deepEqual(row.draftBuilderData,doc('first'));assert.ok(row.publishedBuilderData)
})
test('legacy metadata edits on managed sites remain private and direct public state mutations are rejected',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 const editor=createWebsiteAccess({companyId:f.company.id,actorId:f.actor.id,can:p=>p==='website.pages.update'})
 await f.svc.updatePage({...f.ctx,access:editor,pageId:f.page.id,data:{title:'Private legacy title'}})
 assert.equal((await f.publication.gateway.resolve(f.c)).release.manifest.routes[0].title,'Home')
 await assert.rejects(f.svc.updatePage({...f.ctx,pageId:f.page.id,data:{status:'draft'}}),error('publication_requires_explicit_action'))
 const current=await db.websiteSite.findUnique({where:{id:f.site.id}});assert.ok(current.draftRevision>r.draftRevision)
})
test('history cursor is scoped to the same tenant and site',async()=>{
 const f=await fixture(),a=await f.prepare('history-first-attempt-key'),b=await f.prepare('history-second-attempt-key')
 const first=await f.publication.releases.list({...f.args,limit:1});assert.equal(first.data.length,1);assert.ok(first.meta.nextCursor)
 const next=await f.publication.releases.list({...f.args,limit:1,cursor:first.meta.nextCursor});assert.equal(next.data.length,1);assert.notEqual(next.data[0].id,first.data[0].id)
 const foreign=await fixture();await assert.rejects(foreign.publication.releases.list({...foreign.args,cursor:a.id}),e=>e.status===404)
 assert.ok([a.id,b.id].includes(next.data[0].id))
})
test('a real loopback HTTP server resolves a Host header without public DNS and keeps Catalog accessible',async()=>{
 const f=await fixture(),r=await f.prepare();await f.activate(r)
 const product=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.company.id,name:'Public fixture',slug:'public-fixture',price:10,published:true}})
 const app=new Hono();app.use('*',createWebsiteOriginGuard({prisma:db,gateway:f.publication.gateway}));app.route('/public/website',createPublicWebsiteRouter({prisma:db,publicationContext:f.publication}));app.route('/public/catalog',createPublicCatalogRouter({prisma:db}));const site=createDistServeService({prisma:db,publicationContext:f.publication});app.get('/public/site/',c=>site.serve(c,'/'))
 let server;const address=await new Promise(resolve=>{server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0},resolve)})
 try {
   const httpFetch=(url,options)=>new Promise((resolve,reject)=>{const req=request(url,options,res=>{let text='';res.setEncoding('utf8');res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,text:async()=>text,json:async()=>JSON.parse(text)}))});req.on('error',reject);req.end()})
   const base=`http://127.0.0.1:${address.port}`,headers={Host:f.host.hostname,'X-Runly-Company':f.company.slug}
   const html=await httpFetch(base+'/public/site/',{headers});assert.equal(html.status,200);assert.match(await html.text(),/runly-public-root/)
   const data=await httpFetch(base+'/public/website/resolve?path=/',{headers});assert.equal((await data.json()).releaseId,r.id)
   const catalog=await httpFetch(base+'/public/catalog/products',{headers});assert.equal(catalog.status,200);assert.equal((await catalog.json()).data[0].id,product.id)
   assert.equal((await httpFetch(base+'/public/site/',{headers:{Host:'unknown.example.test'}})).status,404)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
test('ambiguous historical hostnames are quarantined without moving either site',async()=>{
 const f=await fixture();for(const host of ['duplicate.example.test','www.duplicate.example.test']) {
   const binding=await db.websiteDomain.findUnique({where:{hostname:host}});assert.equal(binding.state,'quarantined');assert.equal(binding.siteId,null)
   await assert.rejects(f.publication.gateway.resolve({req:{url:`http://${host}`,header:k=>k==='host'?host:undefined}}),e=>e.status===404)
 }
 assert.equal((await db.websiteSite.findUnique({where:{id:'01900000-0000-7000-8000-000000000909'}})).companyId,'01900000-0000-7000-8000-000000000901')
})
test('real-domain reservations stay pending and configured Forms remain gated by the unresolved scope contract',async()=>{
 const f=await fixture(),p=createWebsitePublicationContext({prisma:db,storage:f.storage,runtime:async()=>runtime,namespaceRoot:'sites.example.com'})
 const reserved=await p.gateway.reserve({...f.args,slug:'pending-site'});assert.equal(reserved.ready,false);assert.equal(reserved.state,'pending')
 const form=await db.websiteForm.create({data:{id:await uuid(),companyId:f.company.id,siteId:f.site.id,name:'Pending typed scope'}})
 const document={schemaVersion:1,regions:{main:{children:['a']}},blocks:{a:{id:'a',type:'ContactFormBlock',props:{formId:form.id}}}}
 await f.svc.saveDraft({...f.ctx,pageId:f.page.id,builderData:document,expectedRevision:1})
 await assert.rejects(f.prepare(),error('form_scope_unresolved',422))
 assert.equal((await db.websiteForm.findUnique({where:{id:form.id}})).siteId,f.site.id)
})
