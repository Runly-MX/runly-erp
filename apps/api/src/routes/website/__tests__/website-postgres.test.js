import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { execFileSync } from 'node:child_process'
import { createWebsiteService } from '../website-service.js'
import { createWebsiteAccess } from '../../../services/website-authorization-service.js'
import { createFormsService } from '../../../services/forms-service.js'
import { createPublicWebsiteRouter } from '../../public-website.js'
import { createWebsiteAdapter } from '../../../mcp/adapters/website.js'
import { normalizeWebsiteDocument } from '../../../services/website-draft-service.js'
import { websiteApp, request, ALL } from './security-fixtures.js'

const url = process.env.RUNLY_WEBSITE_TEST_DATABASE_URL
const marker = process.env.RUNLY_WEBSITE_TEST_DISPOSABLE
if (!url || !/^runly-website-test-[a-f0-9-]+$/.test(marker ?? '') || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/website_s2_test') throw new Error('Run only through scripts/test-website-postgres.mjs in its own disposable container')
const label = execFileSync('docker',['inspect','--format','{{index .Config.Labels "runly.test"}}',marker],{encoding:'utf8'}).trim()
const binding = execFileSync('docker',['port',marker,'5432/tcp'],{encoding:'utf8'}).trim()
if (label !== 'website' || binding !== `127.0.0.1:${new URL(url).port}`) throw new Error('Test URL does not belong to the labelled disposable container')
let db, peer, svc, other, counter = 0
const doc = text => ({ schemaVersion: 1, regions: { main: { children: ['a'] } }, blocks: { a: { id: 'a', type: 'UnknownHistoricalBlock', props: { text } } } })
const error = (status, code) => e => e.status === status && (!code || e.code === code)
before(() => {
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  peer = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  svc = createWebsiteService({ prisma: db }); other = createWebsiteService({ prisma: peer })
})
after(async () => { await db?.$disconnect(); await peer?.$disconnect() })
const uuid = async () => (await db.$queryRaw`SELECT uuidv7()::text id`)[0].id
async function fixture() {
  const n = ++counter
  const company = await db.company.create({ data: { id: await uuid(), name: `Fixture ${n}`, slug: `website-s2-${n}` } })
  const actor = await db.userProfile.create({ data: { id: await uuid(), authUserId: await uuid(), email: `operator-${n}@example.test`, displayName: 'Test operator' } })
  const access = createWebsiteAccess({ companyId: company.id, actorId: actor.id, can: p => ALL.includes(p) })
  const ctx = { companyId: company.id, access }
  const site = await svc.createSite({ ...ctx, data: { name: 'Own site', domain: `site-${n}.example.test` } })
  const page = await svc.createPage({ ...ctx, siteId: site.id, data: { title: 'Own page', slug: 'home', routePath: '/', seo: { title: 'Public SEO' } } })
  return { ...ctx, actor, company, site, page }
}

test('S1 remains effective on real PostgreSQL: tenant and operation before private resource', async () => {
  const a = await fixture(), b = await fixture()
  await assert.rejects(svc.getSite({ ...a, siteId: b.site.id }), error(404))
  await assert.rejects(svc.getPage({ ...a, pageId: b.page.id }), error(404))
  await assert.rejects(svc.saveDraft({ ...a, pageId: b.page.id, builderData: doc('attack'), expectedRevision: 0 }), error(404))
  const reader = createWebsiteAccess({ companyId: a.companyId, actorId: a.actor.id, can: p => p === 'website.pages.read' })
  await assert.rejects(svc.saveDraft({ ...a, access: reader, pageId: a.page.id, builderData: doc('attack'), expectedRevision: 0 }), error(403))
  const editor = createWebsiteAccess({ companyId: a.companyId, actorId: a.actor.id, can: p => p === 'website.pages.update' })
  await assert.rejects(svc.updatePage({ ...a, access: editor, pageId: a.page.id, data: { status: 'published' } }), error(403))
  assert.equal((await db.websitePage.findUnique({ where: { id: b.page.id } })).revision, 0)
})

test('two sites per company keep independent pages, configuration and pinned default', async () => {
  const f = await fixture()
  const second = await svc.createSite({ ...f, data: { name: 'Second site' } })
  const secondPage = await svc.createPage({ ...f, siteId: second.id, data: { title: 'Second home', slug: 'home', routePath: '/' } })
  const secondCurrent = await svc.getSite({ ...f, siteId: second.id })
  await svc.saveSiteDraft({ ...f, siteId: second.id, expectedRevision: secondCurrent.draftRevision, data: { name: 'Second draft', settings: { color: 'green' } } })
  assert.equal((await svc.listSites(f)).length, 2)
  assert.equal((await svc.getSite(f)).id, f.site.id)
  assert.equal((await svc.listPages({ ...f, siteId: second.id, page: 1 })).data[0].id, secondPage.id)
  assert.equal((await svc.getSite({ ...f, siteId: f.site.id })).draftIdentity.name, 'Own site')
  assert.equal((await svc.getSite({ ...f, siteId: second.id })).draftIdentity.name, 'Second draft')
  await assert.rejects(svc.getPage({ ...f, siteId: f.site.id, pageId: secondPage.id }), error(404))
})

test('concurrent site create retries commit one site and one receipt; another body conflicts', async () => {
  const f = await fixture(), args = { ...f, data: { name: 'Retry site' }, idempotencyKey: 'website-s2-create-retry-0001' }
  const [a,b] = await Promise.all([svc.createSite(args), other.createSite(args)])
  assert.deepEqual(a,b)
  assert.equal(await db.websiteSite.count({ where: { companyId: f.companyId, name: 'Retry site' } }), 1)
  await assert.rejects(svc.createSite({ ...args, data: { name: 'Changed body' } }), error(409, 'idempotency_conflict'))
})

test('draft CAS saves normalized string/object documents and preserves all public fields', async () => {
  const f = await fixture()
  await db.websitePage.update({ where: { id: f.page.id }, data: { status: 'published', publishedBuilderData: { original: true } } })
  const before = await svc.getPage({ ...f, pageId: f.page.id })
  const saved = await svc.saveDraft({ ...f, pageId: f.page.id, builderData: JSON.stringify(doc('new')), seo: { title: 'Private draft SEO' }, metadata: { title: 'Private title', routePath: '/new-route' }, expectedRevision: before.revision })
  assert.equal(saved.revision, before.revision + 1)
  assert.deepEqual(saved.draftBuilderData, doc('new'))
  assert.equal(saved.draftMetadata.routePath, '/new-route')
  assert.equal(saved.title, before.title)
  assert.equal(saved.routePath, before.routePath)
  assert.deepEqual(saved.seo, before.seo)
  assert.deepEqual(saved.publishedBuilderData, before.publishedBuilderData)
  assert.equal(saved.status, 'published')
  assert.equal(saved.documentHash.length, 64)
})

test('two independent connections editing the same revision have one winner and one conflict', async () => {
  const f = await fixture(), revision = f.page.revision
  const results = await Promise.allSettled([
    svc.saveDraft({ ...f, pageId: f.page.id, builderData: doc('A'), expectedRevision: revision }),
    other.saveDraft({ ...f, pageId: f.page.id, builderData: doc('B'), expectedRevision: revision }),
  ])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  const rejected = results.find(r => r.status === 'rejected')
  assert.equal(rejected.reason.code, 'revision_conflict')
  const current = await svc.getPage({ ...f, pageId: f.page.id })
  assert.equal(current.revision, revision + 1)
  assert.deepEqual(current.draftBuilderData, results.find(r => r.status === 'fulfilled').value.draftBuilderData)
})

test('draft retry replays its committed result instead of incrementing twice', async () => {
  const f = await fixture(), args = { ...f, pageId: f.page.id, builderData: doc('retry'), expectedRevision: 0, idempotencyKey: 'website-draft-retry-key-0001' }
  const [a,b] = await Promise.all([svc.saveDraft(args), other.saveDraft(args)])
  assert.deepEqual(a,b)
  assert.equal((await svc.getPage({ ...f, pageId: f.page.id })).revision, 1)
  assert.equal(await db.auditLog.count({ where: { entityId: f.page.id, action: 'page.save_draft' } }), 1)
  await assert.rejects(svc.saveDraft({ ...args, builderData: doc('different') }), error(409, 'idempotency_conflict'))
})

test('page creation retries return the same ID and concurrent different attempts cannot duplicate a route', async () => {
  const f = await fixture(), args = { ...f, siteId: f.site.id, data: { title: 'Contact', slug: 'contact', routePath: '/contact' }, idempotencyKey: 'website-page-create-key-0001' }
  const [a,b] = await Promise.all([svc.createPage(args), other.createPage(args)])
  assert.equal(a.id,b.id)
  await assert.rejects(svc.createPage({ ...args, idempotencyKey: 'website-page-create-key-0002' }), error(409))
  assert.equal(await db.websitePage.count({ where: { companyId: f.companyId, siteId: f.site.id, routePath: '/contact' } }), 1)
})

test('an old writer without CAS invalidates the revision of a newer client', async () => {
  const f = await fixture()
  await db.websitePage.update({ where: { id: f.page.id }, data: { draftBuilderData: { legacy: 'saved by old code' } } })
  await assert.rejects(svc.saveDraft({ ...f, pageId: f.page.id, builderData: doc('stale'), expectedRevision: 0 }), error(409, 'revision_conflict'))
  const legacy = await svc.saveDraft({ ...f, pageId: f.page.id, builderData: { legacy: 'serialized adapter' } })
  assert.equal(legacy.concurrency, 'legacy_last_write_wins')
  assert.equal(legacy.revision, 2)
})

test('rejected or failed save does not alter document, revision, audit or site counter', async () => {
  const f = await fixture(), before = await svc.getSite({ ...f, siteId: f.site.id })
  await assert.rejects(svc.saveDraft({ ...f, pageId: f.page.id, builderData: doc('future'), expectedRevision: 99 }), error(409))
  await assert.rejects(svc.saveDraft({ ...f, pageId: f.page.id, builderData: { ...doc('future'), schemaVersion: 99 }, expectedRevision: 0 }), error(422, 'schema_unsupported'))
  assert.equal((await svc.getPage({ ...f, pageId: f.page.id })).revision, 0)
  assert.equal((await svc.getSite({ ...f, siteId: f.site.id })).draftRevision, before.draftRevision)
})

test('Data API grants are revoked and RLS denies even an accidental SELECT grant', async () => {
  const f = await fixture()
  const tables = await db.$queryRaw`SELECT relname,relrowsecurity FROM pg_class WHERE relname LIKE 'website_%' AND relkind='r'`
  assert.equal(tables.length,13)
  assert.ok(tables.every(t => t.relrowsecurity))
  for (const role of ['anon','authenticated']) {
    const grants = await db.$queryRaw`SELECT has_table_privilege(${role},'website_form_submission','SELECT') allowed`
    assert.equal(grants[0].allowed,false)
    // Role identifiers are fixed test constants, never user input.
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`GRANT SELECT ON website_site TO ${role}`)
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`)
      assert.deepEqual(await tx.$queryRaw`SELECT id FROM website_site`, [])
      await tx.$executeRawUnsafe('RESET ROLE')
      await tx.$executeRawUnsafe(`REVOKE SELECT ON website_site FROM ${role}`)
    })
  }
  assert.equal((await svc.getSite({ ...f, siteId: f.site.id })).id, f.site.id)
})

test('database compound ownership constraints reject a cross-tenant child', async () => {
  const a = await fixture(), b = await fixture()
  await assert.rejects(db.websitePage.create({ data: { companyId: a.companyId, siteId: b.site.id, title: 'Attack', slug: 'attack', routePath: '/attack' } }), e => e.code === 'P2003')
  await assert.rejects(db.websiteSite.update({ where: { id: a.site.id }, data: { companyId: b.companyId } }))
})

test('historical defaults, IDs, URL, content and shared relations survive the additive migration', async () => {
  const companyId='01900000-0000-7000-8000-000000000901', siteId='01900000-0000-7000-8000-000000000902', pageId='01900000-0000-7000-8000-000000000903'
  const access=createWebsiteAccess({companyId,actorId:companyId,can:()=>true})
  const site=await svc.getSite({companyId,access}), page=await svc.getPage({companyId,access,pageId})
  assert.equal(site.id,siteId); assert.equal(site.domain,'history.example.test')
  assert.equal(site.defaultForCompany,true)
  assert.equal(page.routePath,'/old'); assert.equal(page.status,'published')
  assert.deepEqual(page.publishedBuilderData,{public:'original'})
  assert.equal(page.draftBuilderData,'historical opaque draft')
  assert.deepEqual(page.draftSeo,{title:'Original'})
  assert.equal(page.revision,0)
  assert.deepEqual(site.settings,{legacy:true})
  assert.deepEqual(site.draftIdentity.settings,{legacy:true})
  const form=await db.websiteForm.findUnique({where:{id:'01900000-0000-7000-8000-000000000905'}})
  assert.equal(form.siteId,siteId);assert.equal(form.companyId,companyId)
  const response=await db.websiteFormSubmission.findUnique({where:{id:'01900000-0000-7000-8000-000000000906'}})
  assert.equal(response.formId,form.id);assert.deepEqual(response.data,{historical:'response'})
  assert.equal((await db.catalogProduct.findUnique({where:{id:'01900000-0000-7000-8000-000000000908'}})).slug,'historical-product')
})

test('saving draft leaves the public resolver response and published URL unchanged', async () => {
  const f=await fixture()
  await db.instanceConfig.upsert({where:{key:'initialized'},create:{key:'initialized',value:'true'},update:{value:'true'}})
  await db.websitePage.update({where:{id:f.page.id},data:{status:'published',publishedBuilderData:doc('public')}})
  const app=createPublicWebsiteRouter({prisma:db,supabaseAdmin:{}})
  const resolve=async()=>{const r=await app.request('/resolve?path=/',{headers:{'X-Runly-Company':f.company.slug,Host:f.site.domain}});assert.equal(r.status,200);return r.json()}
  const before=await resolve(), current=await svc.getPage({...f,pageId:f.page.id})
  await svc.saveDraft({...f,pageId:f.page.id,builderData:doc('private'),seo:{title:'Private'},metadata:{routePath:'/private'},expectedRevision:current.revision})
  assert.deepEqual(await resolve(),before)
})

test('REST exposes scoped drafts, requires revision and returns a non-leaking conflict', async () => {
  const f=await fixture(), app=websiteApp(db,ALL,f.companyId,f.actor.id), path=`/website/sites/${f.site.id}/pages/${f.page.id}/draft`
  const first=await request(app,path); assert.equal(first.status,200)
  const read=await first.json(); assert.equal(read.data.revision,0)
  const bad=await request(app,path,'PUT',{document:doc('bad')}); assert.equal(bad.status,400)
  const ok=await request(app,path,'PUT',{document:doc('good'),expectedRevision:0}); assert.equal(ok.status,200)
  const conflict=await request(app,path,'PUT',{document:doc('stale'),expectedRevision:0});assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'revision_conflict')
  const b=await fixture(); const foreign=await request(app,`/website/sites/${b.site.id}/pages/${b.page.id}/draft`);assert.equal(foreign.status,404)
})

test('site draft identity is revisioned independently of published configuration', async () => {
  const f=await fixture(), current=await svc.getSite({...f,siteId:f.site.id})
  const saved=await svc.saveSiteDraft({...f,siteId:f.site.id,data:{name:'Draft name',settings:{brand:'draft'}},expectedRevision:current.draftRevision})
  assert.equal(saved.name,'Own site'); assert.equal(saved.draftIdentity.name,'Draft name')
  await assert.rejects(other.saveSiteDraft({...f,siteId:f.site.id,data:{name:'Stale'},expectedRevision:current.draftRevision}),error(409,'revision_conflict'))
})

test('themes are selected by explicit site and old singular theme uses the pinned default', async () => {
  const f=await fixture(), second=await svc.createSite({...f,data:{name:'Second'}})
  const a=await svc.createTheme({...f,siteId:f.site.id,data:{name:'A',isDefault:true}}), b=await svc.createTheme({...f,siteId:second.id,data:{name:'B',isDefault:true}})
  assert.equal((await svc.getActiveTheme(f)).id,a.id)
  assert.equal((await svc.getActiveTheme({...f,siteId:second.id})).id,b.id)
})

test('Catalog products, forms and responses retain their original owners during Website changes', async () => {
  const f=await fixture(), form=await createFormsService({prisma:db}).createForm({...f,siteId:f.site.id,data:{name:'Historical form'}})
  const response=await db.websiteFormSubmission.create({data:{id:await uuid(),companyId:f.companyId,formId:form.id,data:{name:'Fixture response'}}})
  const product=await db.catalogProduct.create({data:{id:await uuid(),companyId:f.companyId,name:'Catalog fixture',slug:'fixture',price:10}})
  await svc.createSite({...f,data:{name:'Another site'}})
  await svc.saveDraft({...f,pageId:f.page.id,builderData:doc('new'),expectedRevision:0})
  assert.deepEqual(await db.websiteFormSubmission.findUnique({where:{id:response.id}}),response)
  assert.deepEqual(await db.catalogProduct.findUnique({where:{id:product.id}}),product)
  assert.equal((await db.websiteForm.findUnique({where:{id:form.id}})).siteId,f.site.id)
})

test('MCP preserves S1 permission checks when a direct caller tries foreign IDs', async () => {
  const f=await fixture(), b=await fixture(), adapter=createWebsiteAdapter({prisma:db})
  const actor={companyId:f.companyId,actorProfileId:f.actor.id,can:p=>ALL.includes(p)}
  await assert.rejects(adapter.queries.find(q=>q.name==='website_page_detail').run({pageId:b.page.id},actor),e=>e.status===404)
})

test('document normalization rejects cycles, orphan loss and future schemas without cleaning content', () => {
  const original=doc('x');assert.deepEqual(normalizeWebsiteDocument(JSON.stringify(original)),original)
  assert.throws(()=>normalizeWebsiteDocument({...original,schemaVersion:2}),e=>e.code==='schema_unsupported')
  assert.throws(()=>normalizeWebsiteDocument({...original,blocks:{...original.blocks,orphan:{id:'orphan',type:'Legacy'}}}))
  const cycle=doc('x');cycle.blocks.a.children={body:['a']};assert.throws(()=>normalizeWebsiteDocument(cycle))
  assert.equal(normalizeWebsiteDocument(original).blocks.a.type,'UnknownHistoricalBlock')
})

test('REST multisite identity operations are company-scoped, revisioned and idempotent', async () => {
  const f=await fixture(), app=websiteApp(db,ALL,f.companyId,f.actor.id)
  const create=()=>app.request('/website/sites',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json','Idempotency-Key':'rest-new-site-attempt-0001'},body:JSON.stringify({name:'REST site'})})
  const a=await create(),b=await create();assert.equal(a.status,201);assert.equal(b.status,201)
  const site=(await a.json()).data;assert.equal((await b.json()).data.id,site.id)
  const listed=await request(app,'/website/sites');assert.equal((await listed.json()).data.length,2)
  const patched=await request(app,`/website/sites/${site.id}`,'PATCH',{identity:{name:'Private site draft'},expectedRevision:0});assert.equal(patched.status,200)
  const conflict=await request(app,`/website/sites/${site.id}`,'PATCH',{identity:{name:'Stale'},expectedRevision:0});assert.equal(conflict.status,409)
  const alien=await fixture();assert.equal((await request(app,`/website/sites/${alien.site.id}`,'PATCH',{identity:{name:'attack'},expectedRevision:0})).status,404)
  assert.equal((await request(websiteApp(db,['website.site.update'],f.companyId,f.actor.id),`/website/sites/${site.id}`,'PATCH',{sourceType:'builder'})).status,403)
})

test('MCP explicit site and prepared revision prevent overwriting another editor', async () => {
  const f=await fixture(), second=await svc.createSite({...f,data:{name:'MCP second'}})
  const secondPage=await svc.createPage({...f,siteId:second.id,data:{title:'Second page',slug:'second',routePath:'/'}})
  const adapter=createWebsiteAdapter({prisma:db}), action=adapter.actions.find(a=>a.key==='website.pages.draft'), actor={companyId:f.companyId,actorProfileId:f.actor.id,can:p=>ALL.includes(p)}
  const input=action.inputSchema.parse({siteId:second.id,pages:[{pageId:secondPage.id,title:'New private title',sections:[{type:'HeroBlock',props:{title:'Draft'}}]}]})
  const first=await action.prepare(input,actor), stale=await action.prepare(input,actor)
  const saved=await action.execute(first.input,actor);assert.equal(saved.siteId,second.id);assert.equal(saved.pages[0].revision,1)
  await assert.rejects(action.execute(stale.input,actor),error(409,'revision_conflict'))
  assert.equal((await svc.getPage({...f,pageId:f.page.id})).revision,0)
  const page=await svc.getPage({...f,pageId:secondPage.id});assert.equal(page.title,'Second page');assert.equal(page.draftMetadata.title,'New private title')
})

test('an archived default is never silently replaced by a new site', async () => {
  const f=await fixture();await svc.deleteSite({...f,siteId:f.site.id})
  const second=await svc.createSite({...f,data:{name:'New site after archive'}})
  assert.equal(second.defaultForCompany,false);assert.equal(await svc.getSite(f),null)
  assert.equal((await db.websitePage.findUnique({where:{id:f.page.id}})).siteId,f.site.id)
})

test('draft routes reserve their identity without renaming historical public URLs', async () => {
  const f=await fixture()
  await svc.saveDraft({...f,pageId:f.page.id,builderData:doc('new'),metadata:{routePath:'/reserved'},expectedRevision:0})
  await assert.rejects(svc.createPage({...f,siteId:f.site.id,data:{title:'Duplicate',slug:'duplicate',routePath:'/reserved'}}),error(409))
  assert.equal((await svc.getPage({...f,pageId:f.page.id})).routePath,'/')
})

test('migration preserves an unresolved historical parent and leaves it blocked for review', async () => {
  const row=await db.websitePage.findUnique({where:{id:'01900000-0000-7000-8000-000000000904'}})
  assert.deepEqual(row.draftBuilderData,{preserve:true})
  const access=createWebsiteAccess({companyId:row.companyId,actorId:row.companyId,can:()=>true})
  await assert.rejects(svc.getPage({access,companyId:row.companyId,pageId:row.id}),error(404))
  const constraints=await db.$queryRaw`SELECT convalidated FROM pg_constraint WHERE conname='website_page_site_owner_fk'`
  assert.equal(constraints[0].convalidated,false)
})

test('old metadata writes synchronize the editable projection and invalidate a stale draft', async () => {
  const f=await fixture()
  await db.websitePage.update({where:{id:f.page.id},data:{title:'Old binary edited title',seo:{title:'Legacy SEO'}}})
  const current=await svc.getPage({...f,pageId:f.page.id})
  assert.equal(current.draftMetadata.title,'Old binary edited title');assert.deepEqual(current.draftSeo,{title:'Legacy SEO'})
  await assert.rejects(svc.saveDraft({...f,pageId:f.page.id,builderData:doc('stale'),expectedRevision:0}),error(409))
})

test('concurrent old SQL writer and new draft writer complete without lock inversion', async () => {
  const f=await fixture()
  const attempts=await Promise.allSettled([
    peer.websitePage.update({where:{id:f.page.id},data:{draftBuilderData:{old:'writer'}}}),
    svc.saveDraft({...f,pageId:f.page.id,builderData:doc('new'),expectedRevision:0}),
  ])
  assert.equal(attempts[0].status,'fulfilled')
  if(attempts[1].status==='rejected') assert.equal(attempts[1].reason.code,'revision_conflict')
  assert.ok((await svc.getPage({...f,pageId:f.page.id})).revision>=1)
})

test('site draft service rejects missing revision and unknown ownership fields', async () => {
  const f=await fixture()
  await assert.rejects(svc.saveSiteDraft({...f,siteId:f.site.id,data:{name:'Unversioned'}}),error(422))
  await assert.rejects(svc.saveSiteDraft({...f,siteId:f.site.id,data:{companyId:f.companyId},expectedRevision:1}),error(422))
})

test('an editor can save draft SEO on a published page without changing its public projection', async () => {
  const f=await fixture()
  await db.websitePage.update({where:{id:f.page.id},data:{status:'published',publishedBuilderData:doc('public')}})
  const access=createWebsiteAccess({companyId:f.companyId,actorId:f.actor.id,can:p=>p==='website.pages.update'})
  const current=await svc.getPage({...f,pageId:f.page.id})
  const saved=await svc.saveDraft({...f,access,pageId:f.page.id,builderData:doc('private'),seo:{title:'Private SEO'},expectedRevision:current.revision})
  assert.deepEqual(saved.publishedBuilderData,current.publishedBuilderData);assert.deepEqual(saved.seo,current.seo)
  assert.deepEqual(saved.draftSeo,{title:'Private SEO'})
})

test('a malformed legacy alias cannot silently reset a stored draft', async () => {
  const f=await fixture(),app=websiteApp(db,ALL,f.companyId,f.actor.id)
  await svc.saveDraft({...f,pageId:f.page.id,builderData:doc('keep'),expectedRevision:0})
  for(const body of [{},{seo:{}},{builderData:doc('one'),draft_builder_data:doc('two')}]) assert.equal((await request(app,`/website/pages/${f.page.id}/draft`,'POST',body)).status,422)
  const after=await svc.getPage({...f,pageId:f.page.id});assert.deepEqual(after.draftBuilderData,doc('keep'));assert.equal(after.revision,1)
})
