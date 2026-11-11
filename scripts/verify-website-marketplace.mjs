// Real local Supabase + signed test feed. Never reads application .env or trusts a production test key.
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createStudioStack,command} from './fixtures/studio/supabase-stack.mjs'
import {seedStudioScenario} from './fixtures/studio/supabase-data.mjs'
import {PrismaClient} from '@prisma/client'
import {PrismaPg} from '@prisma/adapter-pg'
import {createResourceCatalogService,RESOURCE_CONFIG_KEYS} from '../apps/api/src/services/catalog/resource-catalog-service.js'
import {resourceReleaseBytes,resourceSnapshotBytes,resourceSnapshotDigest} from '../apps/api/src/services/catalog/catalog-resource-contract.js'
import {createMarketplaceImportGate} from '../apps/api/src/services/marketplace/marketplace-import-gate.js'
import {createWebsiteMarketplaceService} from '../apps/api/src/services/marketplace/website-import-service.js'
import {createWebsiteAccess} from '../apps/api/src/services/website-authorization-service.js'
import {createFilesService} from '../apps/api/src/services/files-service.js'
import {createWebsitePublicationContext} from '../apps/api/src/services/website-publication-context.js'
import {createWebsiteService} from '../apps/api/src/routes/website/website-service.js'
import {buildWebsitePublicRuntime,buildWebsiteSsr} from './build-website-public-runtime.mjs'
import {createWebsiteSsr} from '../apps/api/src/services/website-ssr.js'
import {runWebsiteBrowserAcceptance} from './fixtures/website-marketplace/browser-lab.mjs'
import {inventoryCompany} from '../apps/api/src/services/company-deletion-inventory.js'
import {createWebsiteTemplateService} from '../apps/api/src/services/website-template-service.js'

const option=name=>process.argv[process.argv.indexOf(name)+1]
if(!process.argv.includes('--api-image'))throw Error('Pass an existing local --api-image (no image publication)')
const zip=await readFile(process.argv.includes('--package')?option('--package'):'../runly-developer-hub/.artifacts/website-w2/final/website.elevate-wellness-w2.zip')
const stack=await createStudioStack({apiImage:option('--api-image')}),checks=[]
let db
const sha=b=>createHash('sha256').update(b).digest('hex'),ok=message=>{checks.push(message);console.log('PASS '+message)}
try{
 await stack.compose(['up','-d','--wait','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'start.log')})
 await stack.verifyTarget();await stack.initialize()
 await stack.pool.query(await readFile('prisma/migrations/20261111193229_website_template_marketplace/migration.sql','utf8'))
 db=new PrismaClient({adapter:new PrismaPg(stack.pool)})
 const {users,companies,admin}=await seedStudioScenario(stack)
 const bucket=await admin.storage.createBucket('runly-files',{public:false});assert(!bucket.error||bucket.error.statusCode==='409')
 const releasesBucket=await admin.storage.createBucket('runly-website-releases',{public:false});assert(!releasesBucket.error||releasesBucket.error.statusCode==='409')
 let failUploadAt=0,uploads=0,failRemove=false
 const storageAdmin={...admin,storage:{from:name=>{const b=admin.storage.from(name);return {upload:(...args)=>++uploads===failUploadAt?Promise.resolve({error:Error('Synthetic upload failure')}):b.upload(...args),download:(...args)=>b.download(...args),remove:(...args)=>failRemove?Promise.resolve({error:Error('Synthetic cleanup failure')}):b.remove(...args)}}}}
 const filesService=createFilesService({prisma:db,supabaseAdmin:storageAdmin})
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),keyId=sha(Buffer.from(publicKey,'base64'))
 const vectors=JSON.parse(await readFile('apps/api/src/services/catalog/__tests__/fixtures/resource-feed-v1.vectors.json','utf8')),model=vectors.snapshot1.envelope.signed
 const entry={...model.entries[0],type:'website_template',resourceKey:'website.elevate-wellness',releaseId:randomUUID(),version:'1.0.0',sha256:sha(zip),size:zip.length,packageUrl:`packages/${sha(zip)}`,title:'Elevate Wellness · laboratorio',license:'LicenseRef-Unknown',publishedAt:new Date().toISOString(),compatibility:{runly:{min:'0.1.0',max:null},format:{name:'website',version:2}},requirements:{modules:[],fonts:[],permissions:['website.pages.create'],services:[],builder:'0.3.5'},keyId}
 entry.signature=sign(null,resourceReleaseBytes(entry),pair.privateKey).toString('base64')
 const feedDir=join(stack.directory,'feed');await mkdir(join(feedDir,'packages'),{recursive:true});await writeFile(join(feedDir,entry.packageUrl),zip)
 let last=null
 async function feed(revoked=false){const now=Date.now(),signed={...model,sequence:(last?.sequence??0)+1,previous:last?{sequence:last.sequence,sha256:resourceSnapshotDigest(last)}:null,generatedAt:new Date(now).toISOString(),validUntil:new Date(now+86400000).toISOString(),trust:{keys:[{...model.trust.keys[0],keyId,publicKey,since:new Date(now-60000).toISOString()}]},publishers:[{...model.publishers[0],verified:false}],entries:[{...entry}],revocations:revoked?[{type:'release',target:{resourceKey:entry.resourceKey,version:entry.version,sha256:entry.sha256},reason:'Disposable acceptance revocation',revokedAt:new Date(now).toISOString(),sequence:(last?.sequence??0)+1,replacement:null}]:[]};signed.entries[0].signature=sign(null,resourceReleaseBytes(signed.entries[0]),pair.privateKey).toString('base64');await writeFile(join(feedDir,'index.json'),JSON.stringify({signed,signatures:[{keyId,signature:sign(null,resourceSnapshotBytes(signed),pair.privateKey).toString('base64')}]}));last=signed}
 await feed()
 await db.instanceConfig.upsert({where:{key:RESOURCE_CONFIG_KEYS.url},create:{key:RESOURCE_CONFIG_KEYS.url,value:pathToFileURL(join(feedDir,'index.json')).href},update:{value:pathToFileURL(join(feedDir,'index.json')).href}})
 const catalog=createResourceCatalogService({prisma:db,trust:{resource:[publicKey]}}),gate=createMarketplaceImportGate({catalog})
 const service=createWebsiteMarketplaceService({prisma:db,gate,filesService,supabaseAdmin:storageAdmin})
 const companyId=companies[0].id,actor=users[0],access=createWebsiteAccess({companyId,actorId:actor.id,can:()=>true})
 const runtime=await buildWebsitePublicRuntime(),ssrDir=join(stack.directory,'ssr');await buildWebsiteSsr(ssrDir,runtime['entry.js'].hash)
 const publication=createWebsitePublicationContext({prisma:db,supabaseAdmin:admin,runtime:async()=>runtime,ssr:createWebsiteSsr({folder:ssrDir}),namespaceRoot:'sites.example.test',adminHosts:['erp.example.test']})
 const website=createWebsiteService({prisma:db,publicationContext:publication}),ctx={companyId,access}
 const site=await website.createSite({...ctx,data:{name:'Elevate W3',siteType:'website'}}),a={...ctx,siteId:site.id,idempotencyKey:'website-w3-acceptance-install-1'}
 const ref={resourceKey:entry.resourceKey,version:entry.version,releaseId:entry.releaseId}
 const preview=await service.inspect(a,ref);assert.equal(preview.validation.ok,true);assert.equal(preview.assets.length,16);assert.equal(Object.keys(preview.pages[0].document.blocks).length,133);assert(preview.validation.warnings.some(w=>w.code==='license_unknown'));ok('signed feed + release + hash verified by real E2 consumer; 133 blocks/16 images inspected')
 const input={ref,pageIds:['/'],expectedRevision:preview.expectedRevision,includeTheme:true,replaceExisting:false,formMode:'disabled',acceptWarnings:true}
 const installed=await service.confirm(a,input)
 assert.equal(Object.keys(installed.assets).length,16)
 const page=await db.websitePage.findUnique({where:{id:installed.firstPageId}});assert.equal(Object.keys(page.draftBuilderData.blocks).length,133);assert.equal(page.status,'draft');assert.equal((await db.websiteSite.findUnique({where:{id:site.id}})).activeReleaseId,null)
 const files=await db.fileAsset.findMany({where:{entityId:site.id}});assert.equal(files.length,16);for(const f of files){assert.equal(f.visibility,'PRIVATE');assert.equal(f.metadata.companyId,companyId);assert.equal(f.metadata.websiteTemplate.license.redistribution,'unknown');const blob=await admin.storage.from(f.bucket).download(f.objectKey);assert.equal(sha(Buffer.from(await blob.data.arrayBuffer())),f.checksum.slice(7))}
 assert.deepEqual(await service.confirm(a,input),installed);assert.equal(await db.fileAsset.count({where:{entityId:site.id}}),16);ok('Files materialization is private, site-scoped, byte exact, licensed and idempotent; public site unchanged')
 const document=structuredClone(page.draftBuilderData),blocks=Object.values(document.blocks),heading=blocks.find(b=>b.type==='HeadingBlock'),image=blocks.find(b=>b.type==='ImageBlock')
 heading.props.text='Elevate W3 editable';image.props.src=`file:${Object.values(installed.assets)[4]}`
 const theme=await website.getActiveTheme({...ctx,siteId:site.id}),current=await db.websiteSite.findUnique({where:{id:site.id}})
 const tokens=structuredClone(theme.tokens);tokens.color.primary='#384d42'
 const saved=await website.saveDraft({...ctx,siteId:site.id,pageId:page.id,builderData:document,strictDocument:true,expectedRevision:page.revision,themeTokens:tokens,expectedSiteRevision:current.draftRevision,idempotencyKey:'website-w3-edit-text-image-color'})
 const reopened=await website.getPage({...ctx,pageId:page.id});assert.equal(reopened.draftBuilderData.blocks[heading.id].props.text,heading.props.text);assert.equal(reopened.draftBuilderData.blocks[image.id].props.src,image.props.src);assert.equal((await website.getActiveTheme({...ctx,siteId:site.id})).tokens.color.primary,'#384d42');ok('revisioned draft persists text, file reference and theme atomically across reopen')
 await assert.rejects(service.confirm({...a,idempotencyKey:'website-w3-stale-revision'},input),e=>e.code==='revision_conflict')
 await assert.rejects(service.confirm({...a,access:createWebsiteAccess({companyId,actorId:users[1].id,can:()=>false})},input),e=>e.status===403)
 await assert.rejects(service.inspect({...a,companyId:companies[1].id,access:createWebsiteAccess({companyId:companies[1].id,actorId:users[3].id,can:()=>true})},ref),e=>e.status===404);ok('stale revisions, missing permissions and foreign companies rejected')
 const legacy=await website.createSite({...ctx,data:{name:'Legacy public baseline'}})
 await db.websitePage.create({data:{companyId,siteId:legacy.id,title:'Existing public page',slug:'legacy',routePath:'/',status:'published'}})
 const legacyState=await db.websiteSite.findUnique({where:{id:legacy.id}}),beforeLegacy=uploads
 await assert.rejects(service.confirm({...ctx,siteId:legacy.id,idempotencyKey:'website-w3-legacy-baseline'},{...input,expectedRevision:legacyState.draftRevision,replaceExisting:true}),e=>e.code==='legacy_public_requires_release')
 assert.equal(uploads,beforeLegacy);assert.equal(await db.websitePage.count({where:{siteId:legacy.id,enabled:true,status:'published'}}),1);ok('legacy public sites without sealed releases are rejected before uploads or draft replacement')
 const state=await db.websiteSite.findUnique({where:{id:site.id}})
 await assert.rejects(service.confirm({...a,idempotencyKey:'website-w3-route-conflict'},{...input,expectedRevision:state.draftRevision}),e=>e.code==='route_conflict')
 assert.equal(await db.websitePage.count({where:{siteId:site.id,enabled:true}}),1);assert.equal(await db.fileAsset.count({where:{entityId:site.id}}),16)
 let retry=await service.confirm({...a,idempotencyKey:'website-w3-safe-replace'},{...input,expectedRevision:state.draftRevision,replaceExisting:true});assert.equal(await db.fileAsset.count({where:{entityId:site.id}}),16);assert.equal(Object.keys(retry.assets).length,16);ok('route conflicts do not overwrite; explicit replacement safely reuses all assets')
 const badSite=await website.createSite({...ctx,data:{name:'Partial failure'}}),badArgs={...ctx,siteId:badSite.id,idempotencyKey:'website-w3-storage-failure'}
 failUploadAt=uploads+3;failRemove=true
 await assert.rejects(service.confirm(badArgs,{...input,expectedRevision:badSite.draftRevision}))
 assert.equal(await db.websitePage.count({where:{siteId:badSite.id}}),0);assert.equal(await db.fileAsset.count({where:{entityId:badSite.id}}),0)
 const pending=(await db.$queryRaw`SELECT * FROM website_template_job WHERE site_id=${badSite.id}::uuid`)[0];assert.equal(pending.state,'cleanup')
 failRemove=false;failUploadAt=0;await db.$queryRaw`UPDATE website_template_job SET lease_until=now()-interval '1 second',next_cleanup_at=now()-interval '1 second' WHERE id=${pending.id}::uuid`;await service.recoverExpired()
 assert.equal((await db.$queryRaw`SELECT state FROM website_template_job WHERE id=${pending.id}::uuid`)[0].state,'cancelled');for(const location of pending.staged){const result=await admin.storage.from(location.bucket).download(location.objectKey);assert(result.error)}ok('partial Files failure leaves no pages/assets; durable cleanup survives removal outage and recovers')
 const dbFailSite=await website.createSite({...ctx,data:{name:'DB compensation'}})
 const dbFailure=createWebsiteMarketplaceService({prisma:db,gate,filesService,supabaseAdmin:storageAdmin,afterStage:async()=>{await db.websitePage.create({data:{companyId,siteId:dbFailSite.id,title:'Concurrent page',slug:'concurrent',routePath:'/'}})}})
 await assert.rejects(dbFailure.confirm({...ctx,siteId:dbFailSite.id,idempotencyKey:'website-w3-transaction-failure'},{...input,expectedRevision:dbFailSite.draftRevision}),e=>e.code==='revision_conflict')
 assert.equal(await db.fileAsset.count({where:{entityId:dbFailSite.id}}),0);ok('concurrent DB change after upload rolls back installation and compensates storage')
 const brokenSite=await website.createSite({...ctx,data:{name:'Transaction rollback'}})
 await db.$executeRawUnsafe(`CREATE FUNCTION w3_test_insert_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.site_id='${brokenSite.id}'::uuid THEN RAISE EXCEPTION 'Synthetic DB failure'; END IF; RETURN NEW; END $$`)
 await db.$executeRawUnsafe('CREATE TRIGGER w3_test_insert_failure BEFORE INSERT ON website_page FOR EACH ROW EXECUTE FUNCTION w3_test_insert_failure()')
 await assert.rejects(service.confirm({...ctx,siteId:brokenSite.id,idempotencyKey:'website-w3-db-rollback'},{...input,expectedRevision:brokenSite.draftRevision}))
 await db.$executeRawUnsafe('DROP TRIGGER w3_test_insert_failure ON website_page');await db.$executeRawUnsafe('DROP FUNCTION w3_test_insert_failure()')
 assert.equal(await db.fileAsset.count({where:{entityId:brokenSite.id}}),0);assert.equal(await db.websitePage.count({where:{siteId:brokenSite.id}}),0);ok('database failure after FileAsset creation rolls back all records and compensates uploads')
 // Explicit local forms opt-in; unresolved markers must never silently publish.
 const unbound=await db.websiteSite.findUnique({where:{id:site.id}})
 await assert.rejects(publication.releases.prepare({...a,kind:'builder',expectedDraftRevision:unbound.draftRevision,expectedPublicationRevision:unbound.publicationRevision,baseReleaseId:unbound.activeReleaseId,changes:{publishPageIds:[retry.firstPageId],includeThemeAndMenus:true},idempotencyKey:'website-w3-marker-must-block'}),e=>e.status===422)
 retry=await service.confirm({...a,idempotencyKey:'website-w3-local-forms-opt-in'},{...input,expectedRevision:unbound.draftRevision,replaceExisting:true,formMode:'local'})
 const localForms=await db.websiteForm.findMany({where:{siteId:site.id}});assert.equal(localForms.length,1);assert.equal(localForms[0].createsLead,false);ok('unresolved form markers block publication; explicit local opt-in provisions same-site forms without leads or external connections')
 const localPage=await db.websitePage.findUnique({where:{id:retry.firstPageId}}),backgroundDocument=structuredClone(localPage.draftBuilderData)
 Object.values(backgroundDocument.blocks).find(b=>b.type==='SectionBlock').props.background={kind:'image',url:`file:${Object.values(retry.assets)[2]}`}
 const beforeBackground=await db.websiteSite.findUnique({where:{id:site.id}}),headingTheme=structuredClone((await website.getActiveTheme({...ctx,siteId:site.id})).tokens)
 headingTheme.font={...headingTheme.font,heading:'Georgia, serif'}
 await website.saveDraft({...ctx,pageId:localPage.id,siteId:site.id,builderData:backgroundDocument,expectedRevision:localPage.revision,themeTokens:headingTheme,expectedSiteRevision:beforeBackground.draftRevision,idempotencyKey:'website-w3-background-image'})
 // Test publication only: frozen release, namespace and assets use the existing publication service.
 const activePage=await db.websitePage.findUnique({where:{id:retry.firstPageId}}),s=await db.websiteSite.findUnique({where:{id:site.id}})
 const release=await publication.releases.prepare({...a,kind:'builder',expectedDraftRevision:s.draftRevision,expectedPublicationRevision:s.publicationRevision,baseReleaseId:s.activeReleaseId,changes:{publishPageIds:[activePage.id],includeThemeAndMenus:true},idempotencyKey:'website-w3-isolated-release'})
 const activated=await publication.releases.activate({...a,releaseId:release.id,manifestHash:release.manifestHash,expectedDraftRevision:release.draftRevision,expectedPublicationRevision:release.publicationRevision,idempotencyKey:'website-w3-isolated-activation'})
 assert(activated);const published=await db.websiteRelease.findUnique({where:{id:release.id}});assert(!JSON.stringify(published.manifest.routes).includes('file:'));assert(Object.keys(published.manifest.assets).length>0);assert(JSON.stringify(published.manifest.routes).includes('/assets/'));ok('isolated publication materializes immutable public copies including backgrounds, with no private storage URLs or file references')
 const publicHash=published.manifestHash
 const finalState=await db.websiteSite.findUnique({where:{id:site.id}})
 await service.confirm({...a,idempotencyKey:'website-w3-public-preservation'},{...input,expectedRevision:finalState.draftRevision,replaceExisting:true})
 assert.equal((await db.websiteRelease.findUnique({where:{id:release.id}})).manifestHash,publicHash);assert.equal((await db.websiteSite.findUnique({where:{id:site.id}})).activeReleaseId,release.id);ok('installing another draft never changes an existing active release')
 const legacyLocal=await website.createSite({...ctx,data:{name:'Local template regression'}})
 const localApplied=await createWebsiteTemplateService({prisma:db}).apply({...ctx,siteId:legacyLocal.id,templateId:'atlas-maya',pageIds:['contacto'],includeTheme:true,expectedRevision:legacyLocal.draftRevision,idempotencyKey:'website-w3-local-template-regression'})
 assert.equal(localApplied.pages.length,1);assert.equal((await db.websiteForm.findFirst({where:{siteId:legacyLocal.id}})).createsLead,true);ok('existing local template service preserves its contact-form and theme behavior')
 const publicHost=await publication.gateway.reserve({...a,slug:'elevate-w3-lab'})
 await runWebsiteBrowserAcceptance({stack,db,users,companies,admin,storageAdmin,filesService,gate,publication,website,ctx,entry,publicHostname:publicHost.hostname})
 ok('real ERP dialog and Atlas editor: install, edit text/image/color, save, close and reopen using real Auth/SQL/Storage')
 const revokedSite=await website.createSite({...ctx,data:{name:'Revoked during staging'}})
 const revoking=createWebsiteMarketplaceService({prisma:db,gate,filesService,supabaseAdmin:storageAdmin,afterStage:()=>feed(true)})
 await assert.rejects(revoking.confirm({...ctx,siteId:revokedSite.id,idempotencyKey:'website-w3-revoked-during-upload'},{...input,expectedRevision:revokedSite.draftRevision}),e=>e.code==='RESOURCE_REVOKED')
 assert.equal(await db.fileAsset.count({where:{entityId:revokedSite.id}}),0);assert.equal(await db.websitePage.count({where:{siteId:revokedSite.id}}),0)
 assert.equal((await catalog.refresh()).status,'ok');await assert.rejects(service.inspect(a,ref),e=>e.code==='RESOURCE_REVOKED');ok('signed revocation during upload blocks commit, compensates storage and prevents later imports')
 await db.$executeRaw`INSERT INTO runly_lifecycle.company_deletion(company_id,requested_by,previous_enabled) VALUES(${companyId}::uuid,${actor.id}::uuid,true)`
 await inventoryCompany(db,companyId)
 for(const location of pending.staged)assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM runly_lifecycle.deletion_object WHERE company_id=${companyId}::uuid AND bucket=${location.bucket} AND object_key=${location.objectKey}`)[0].n,1)
 ok('company-erasure inventory retains staged object intents before journal deletion')
 await mkdir('.artifacts/website-w3',{recursive:true});await writeFile('.artifacts/website-w3/acceptance.json',JSON.stringify({fixture:'website.elevate-wellness',blocks:133,assets:16,sha256:sha(zip),checks,license:'license_unknown',official:false,productionDeployment:false},null,2))
 console.log(`W3 passed ${checks.length} acceptance checks`)
}catch(error){await mkdir('.artifacts/website-w3',{recursive:true});await writeFile('.artifacts/website-w3/failure.log',error.stack??String(error));console.error('W3 FAILED:',error.code??error.name,String(error.message).split('\n').filter(Boolean).slice(-2).join(' '));process.exitCode=1}finally{await db?.$disconnect();await stack.close()}
