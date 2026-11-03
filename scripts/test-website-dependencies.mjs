import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import pg from 'pg'
import {get as httpGet} from 'node:http'
const dir='.artifacts/website-integration',c=JSON.parse(await readFile(dir+'/private.json','utf8'))
if(!/^runly-studio-e2e-[a-f0-9]+$/.test(c.name)||!c.env.DATABASE_URL.includes(`@127.0.0.1:${c.ports.db}/`))throw Error('DISPOSABLE_LAB_REQUIRED')
const db=new pg.Pool({connectionString:c.env.DATABASE_URL}),results=[]
assert.equal((await db.query('SELECT id FROM runly_studio_test.environment')).rows[0].id,c.name)
const company=c.companies[0].id,key=()=>randomBytes(20).toString('hex'),suffix=Date.now().toString(36)
let token,reader,foreign,siteA,siteB,otherSite,product1,product2,page,post,firstRelease,ambiguousSite,ambiguousForm
async function check(name,run){await run();results.push({name,status:'PASS'});console.log('PASS',name)}
async function login(index){const r=await fetch(c.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:c.users[index].email,password:c.users[index].password})});assert.equal(r.status,200);return (await r.json()).data.access_token}
async function call(path,{method='GET',body,status=200,auth=token,companyId=company,idempotencyKey=key(),headers={}}={}){
 const r=await fetch(c.urls.api+path,{method,headers:{Authorization:`Bearer ${auth}`,'X-Runly-Company-Id':companyId,'Content-Type':'application/json','Idempotency-Key':idempotencyKey,...headers},...(body!==undefined&&{body:JSON.stringify(body)})})
 const json=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(json)}`);return json
}
const state=async site=>(await call(`/website/sites/${site}/state`)).data
function document(text,extra={}){const blocks={heading:{id:'heading',type:'HeadingBlock',props:{text,level:'h1'},children:{}},...extra};return {schemaVersion:1,id:'page-fixture',slug:'/',title:text,visibility:'public',regions:{main:{id:'main',children:Object.keys(blocks)}},blocks,seo:{title:text,description:'',canonical:null,ogImageAssetId:null},updatedAt:'2026-11-02T00:00:00.000Z'}}
async function createSite(name,companyId=company){return (await call('/website/sites',{method:'POST',status:201,companyId,body:{name}})).data.id}
async function prepare(site,changes){const s=await state(site);return (await call(`/website/sites/${site}/releases`,{method:'POST',status:202,body:{kind:'builder',expectedDraftRevision:s.draftRevision,expectedPublicationRevision:s.publicationRevision,baseReleaseId:s.activeReleaseId,changes:{publishPageIds:[],...changes}}})).data}
async function activate(site,release){return call(`/website/sites/${site}/publication/activate`,{method:'POST',body:{releaseId:release.id,manifestHash:release.manifestHash,expectedDraftRevision:release.draftRevision,expectedPublicationRevision:release.publicationRevision}})}
async function publicProducts(site,slug){const r=await fetch(c.urls.api+'/public/catalog/'+(slug?'products/'+slug:'products?limit=200'),{headers:{'X-Runly-Company':'studio-test-a',...(site&&{'X-Runly-Website-Site':site})}});return {status:r.status,json:await r.json()}}
async function publicConfigForHost(host){return new Promise((resolve,reject)=>{httpGet(c.urls.api+'/public/website/resolve?path=/',{headers:{Host:host}},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>{try{assert.equal(response.statusCode,200);resolve(JSON.parse(data))}catch(error){reject(error)}})}).on('error',reject)})}
try{
 for(const company of c.companies)await db.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'catalog.%' ON CONFLICT DO NOTHING",[company.roleId])
 await db.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='growth.forms.update' ON CONFLICT DO NOTHING",[c.companies[0].roleId])
 token=await login(0);reader=await login(2);foreign=await login(3)
 await check('explicit manifests and section capabilities',async()=>{
  siteA=await createSite('Dependencies A '+suffix);siteB=await createSite('Dependencies B '+suffix);otherSite=await createSite('Foreign '+suffix,c.companies[1].id)
  const dto=await state(siteA);assert.equal(dto.sectionCapabilities.catalog.allowed,true)
  const limited=(await call(`/website/sites/${siteA}/state`,{auth:reader})).data
  assert.equal(limited.sectionCapabilities.catalog.allowed,false);assert.equal(limited.sectionCapabilities.payments.allowed,false)
 })
 await check('catalog selection has composite tenant constraints and private RLS',async()=>{
  const a=(await db.query("INSERT INTO catalog_product(company_id,name,slug,price,published,pos_enabled) VALUES($1,'Product one',$2,12,true,true) RETURNING id",[company,'one-'+suffix])).rows[0]
  const b=(await db.query("INSERT INTO catalog_product(company_id,name,slug,price,published,pos_enabled) VALUES($1,'Product two',$2,24,true,true) RETURNING id",[company,'two-'+suffix])).rows[0];product1=a.id;product2=b.id
  await assert.rejects(db.query('INSERT INTO website_catalog_product(company_id,site_id,product_id,included) VALUES($1,$2,$3,true)',[company,otherSite,product1]),e=>e.code==='23503')
  assert.equal((await db.query("SELECT has_table_privilege('anon','website_catalog_product','SELECT') AS allowed")).rows[0].allowed,false)
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='website_catalog_product'::regclass")).rows[0].relrowsecurity,true)
  const products=(await call(`/website/sites/${siteA}/catalog/products`)).data;assert.ok(products.every(p=>!p.includedInSite))
 })
 await check('per-site selection is CAS/idempotent and does not change POS/global eligibility',async()=>{
  const s=await state(siteA),body={included:true,expectedRevision:s.draftRevision},idempotencyKey=key()
  const first=await call(`/website/sites/${siteA}/catalog/products/${product1}`,{method:'PUT',body,idempotencyKey})
  assert.deepEqual(await call(`/website/sites/${siteA}/catalog/products/${product1}`,{method:'PUT',body,idempotencyKey}),first)
  await call(`/website/sites/${siteA}/catalog/products/${product2}`,{method:'PUT',body,status:409})
  assert.ok((await call(`/website/sites/${siteB}/catalog/products`)).data.every(p=>!p.includedInSite))
  assert.deepEqual((await db.query('SELECT published,pos_enabled FROM catalog_product WHERE id=$1',[product1])).rows[0],{published:true,pos_enabled:true})
  await call(`/website/sites/${siteA}/catalog/products/${product1}`,{method:'PUT',body,auth:reader,status:403})
  await call(`/website/sites/${siteA}/catalog/products`,{auth:foreign,companyId:c.companies[1].id,status:404})
 })
 await check('templates apply to nondefault site atomically with replay and conflicts',async()=>{
  const before=await state(siteB),idempotencyKey=key(),body={pageIds:['home'],expectedRevision:before.draftRevision}
  const first=await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body,idempotencyKey})
  assert.equal(first.data.pages.length,1)
  assert.deepEqual(await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body,idempotencyKey}),first)
  await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body,status:409})
  const fresh=await state(siteB),count=(await db.query('SELECT count(*) FROM website_page WHERE site_id=$1',[siteB])).rows[0].count
  await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body:{pageIds:['home'],expectedRevision:fresh.draftRevision},status:409})
  assert.equal((await db.query('SELECT count(*) FROM website_page WHERE site_id=$1',[siteB])).rows[0].count,count)
  assert.equal((await call(`/website/sites/${siteA}/pages`)).data.length,0)
  await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',auth:reader,body,status:403})
 })
 await check('publication uses selected catalog and keeps historical release immutable',async()=>{
  page=(await call(`/website/sites/${siteA}/pages`,{method:'POST',status:201,body:{title:'Home',slug:'home',routePath:'/',visibility:'public'}})).data
  await call(`/website/sites/${siteA}/pages/${page.id}/draft`,{method:'PUT',body:{document:document('Dependency home'),expectedRevision:0}})
  const release=await prepare(siteA,{publishPageIds:[page.id],includeThemeAndMenus:true});firstRelease=release
  await activate(siteA,release)
  const visible=await publicProducts(siteA);assert.equal(visible.status,200);assert.deepEqual(visible.json.data.map(p=>p.id),[product1])
  assert.equal((await publicProducts(siteA,'two-'+suffix)).status,404)
  await db.query('UPDATE catalog_product SET published=false WHERE id=$1',[product1]);assert.equal((await publicProducts(siteA)).json.data.length,0)
  await db.query('UPDATE catalog_product SET published=true WHERE id=$1',[product1]);assert.equal((await publicProducts(siteA)).json.data.length,1)
  assert.equal((await call(`/website/sites/${siteA}/releases/${release.id}`)).data.manifestHash,release.manifestHash)
  assert.equal((await state(siteA)).hasUnpublishedChanges,false)
  await call(`/website/site/${siteA}`,{method:'PATCH',body:{analyticsMode:'anonymous'}})
  assert.equal((await state(siteA)).hasUnpublishedChanges,false)
  const revision=(await state(siteA)).draftRevision
  await call(`/website/sites/${siteA}/templates/atlas-negocio/apply`,{method:'POST',body:{pageIds:['contacto'],expectedRevision:revision}})
  assert.equal((await state(siteA)).activeReleaseId,release.id)
 })
 await check('usedBy enumerates beyond 50 pages, posts and published snapshots with pagination',async()=>{
  const card={card:{id:'card',type:'ProductCardBlock',props:{productId:product1},children:{}}},doc=document('Product usage',card)
  for(let i=0;i<55;i++)await db.query("INSERT INTO website_page(company_id,site_id,title,slug,route_path,status,visibility,draft_builder_data,draft_metadata,updated_at) VALUES($1,$2,$3,$4,$5,'draft','public',$6,$7,now())",[company,siteA,'Usage '+i,'usage-'+i,'/usage-'+i,doc,{title:'Usage '+i,slug:'usage-'+i,routePath:'/usage-'+i,visibility:'public'}])
  post=await call('/website/blog/posts',{method:'POST',status:201,body:{siteId:siteA,title:'Dependency post',slug:'dependency-post'}})
  await call(`/website/blog/posts/${post.id}/save-draft`,{method:'POST',body:{builderData:doc,expectedRevision:0}})
  let cursor,rows=[];do{const response=await call(`/website/sites/${siteA}/catalog/products/${product1}/used-by?limit=7${cursor?'&cursor='+cursor:''}`);rows.push(...response.data);cursor=response.meta.nextCursor}while(cursor)
  assert.equal(rows.filter(r=>r.source==='draft-page').length,55);assert.ok(rows.some(r=>r.source==='draft-post'))
  assert.equal(new Set(rows.map(r=>r.source+r.id+r.blockId)).size,rows.length)
 })
 await check('blog publish, exclude, withdraw, retry and rollback preserve drafts',async()=>{
  const included=await prepare(siteA,{publishPostIds:[post.id]});await activate(siteA,included)
  const excluded=await prepare(siteA,{publishPageIds:[page.id]});assert.ok(excluded.manifest.routes.some(r=>r.sourceId===post.id));await activate(siteA,excluded)
  const withdrawn=await prepare(siteA,{unpublishPostIds:[post.id]});assert.ok(!withdrawn.manifest.routes.some(r=>r.sourceId===post.id));await activate(siteA,withdrawn)
  const later=await prepare(siteA,{publishPageIds:[page.id]});assert.ok(!later.manifest.routes.some(r=>r.sourceId===post.id));await activate(siteA,later)
  assert.ok((await call(`/website/blog/posts/${post.id}`)).draftBuilderData.blocks.card)
  const s=await state(siteA),idempotencyKey=key(),body={releaseId:included.id,expectedPublicationRevision:s.publicationRevision}
  const first=await call(`/website/sites/${siteA}/publication/rollback`,{method:'POST',body,idempotencyKey});assert.deepEqual(await call(`/website/sites/${siteA}/publication/rollback`,{method:'POST',body,idempotencyKey}),first)
  const current=await state(siteA);assert.equal(current.activeReleaseId,included.id)
  const usage=await call(`/website/sites/${siteA}/catalog/products/${product1}/used-by?limit=100`)
  assert.ok(usage.data.some(row=>row.source==='published-blog'&&row.id===post.id))
  await call(`/website/sites/${siteA}/releases/preflight`,{method:'POST',body:{kind:'builder',changes:{publishPageIds:[],publishPostIds:[post.id],unpublishPostIds:[post.id]}},status:422}).then(r=>assert.equal(r.code,'scope_conflict'))
 })
 await check('operational config is live; secrets stay private; public content becomes a draft',async()=>{
  const before=await state(siteA),release=(await call(`/website/sites/${siteA}/releases/${before.activeReleaseId}`)).data
  await call(`/website/site/${siteA}`,{method:'PATCH',body:{analyticsMode:'off',turnstileSiteKey:'test-site-key',turnstileSecretKey:'synthetic-turnstile-secret',stripeSecretKey:'synthetic-stripe-secret',stripePublishableKey:'pk_test_example'}})
  const site=(await call(`/website/sites/${siteA}`)).data
  assert.equal(site.turnstileSecretKey,undefined);assert.equal(site.stripeSecretKey,undefined);assert.equal(site.turnstileSecretKeySet,true)
  assert.equal((await state(siteA)).activeReleaseId,before.activeReleaseId)
  assert.ok(!JSON.stringify(release.manifest).includes('synthetic-'));assert.ok(!('analyticsMode' in release.manifest.identity))
  await call(`/website/site/${siteA}`,{method:'PATCH',body:{name:'Changed draft identity'}})
  assert.equal((await call(`/website/sites/${siteA}`)).data.draftIdentity.name,'Changed draft identity')
  assert.equal((await call(`/website/sites/${siteA}/releases/${before.activeReleaseId}`)).data.manifestHash,release.manifestHash)
  await call(`/website/site/${siteA}`,{method:'PATCH',auth:reader,body:{stripeSecretKey:'not-allowed'},status:403})
  const hostname=`ops-${siteA}.content.localhost`
  await db.query("INSERT INTO website_domain(hostname,company_id,site_id,kind,state,ready) VALUES($1,$2,$3,'platform','assigned',true)",[hostname,company,siteA])
  const publicConfig=await publicConfigForHost(hostname)
  assert.equal(publicConfig.site.turnstileSiteKey,'test-site-key');assert.equal(publicConfig.site.analyticsMode,'off')
  assert.ok(!JSON.stringify(publicConfig).includes('synthetic-'))
  await call('/website/settings/smtp',{method:'POST',body:{host:'smtp.example.test',user:'fixture',pass:'synthetic-smtp-secret'}})
  const smtp=(await call('/website/settings/smtp')).data;assert.equal(smtp.host,'smtp.example.test');assert.equal(smtp.pass,undefined)
  assert.equal((await call('/website/settings/smtp',{companyId:c.companies[1].id})).data.host,'')
  await call('/website/settings/smtp',{method:'POST',auth:reader,body:{host:'smtp.example.test',user:'fixture',pass:'denied'},status:403})
 })
 await check('new empty withdrawal field preserves historical idempotency request shape',async()=>{
  const s=await state(siteA),body={kind:'builder',expectedDraftRevision:s.draftRevision,expectedPublicationRevision:s.publicationRevision,baseReleaseId:s.activeReleaseId,changes:{publishPageIds:[page.id]}},idempotencyKey=key()
  const oldShape=await call(`/website/sites/${siteA}/releases`,{method:'POST',body,idempotencyKey,status:202})
  const newShape=await call(`/website/sites/${siteA}/releases`,{method:'POST',body:{...body,changes:{...body.changes,unpublishPostIds:[]}},idempotencyKey,status:202})
  assert.equal(oldShape.data.id,newShape.data.id)
 })
 await check('ambiguous historical forms require both owners and preserve answers',async()=>{
  ambiguousSite=await createSite('Ambiguous '+suffix)
  await db.query("INSERT INTO growth_property(id,company_id,name,kind,updated_at) VALUES($1,$2,'Ambiguous owner','external_sdk',now())",[ambiguousSite,company])
  const form=(await db.query("INSERT INTO website_form(id,company_id,site_id,name,updated_at) VALUES(uuidv7(),$1,$2,'Ambiguous form',now()) RETURNING id",[company,ambiguousSite])).rows[0]
  const answer=(await db.query("INSERT INTO website_form_submission(id,company_id,form_id,data) VALUES(uuidv7(),$1,$2,'{\"message\":\"Historical answer\"}') RETURNING id",[company,form.id])).rows[0]
  const list=(await call(`/website/sites/${ambiguousSite}/forms`)).data
  assert.equal(list.find(f=>f.id===form.id).publishability.state,'owner_ambiguous')
  const role=(await db.query("INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,$2,'Website only',now()) RETURNING id",[company,'dependency.website-only.'+suffix])).rows[0].id
  await db.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key LIKE 'website.%'",[role])
  await db.query('UPDATE membership SET role_id=$1,updated_at=now() WHERE user_id=$2',[role,c.users[1].id])
  const websiteOnly=await login(1)
  await call(`/website/sites/${ambiguousSite}/forms/${form.id}/scope`,{method:'POST',auth:websiteOnly,body:{expectedLegacySiteId:ambiguousSite,resolveAmbiguous:true},status:403})
  await call(`/website/sites/${ambiguousSite}/forms/${form.id}/scope`,{method:'POST',body:{expectedLegacySiteId:ambiguousSite},status:409})
  const scope=(await call(`/website/sites/${ambiguousSite}/forms/${form.id}/scope`,{method:'POST',body:{expectedLegacySiteId:ambiguousSite,resolveAmbiguous:true}})).data
  assert.equal(scope.ownerWebsiteSiteId,ambiguousSite)
  const retained=(await db.query('SELECT id,form_id,data FROM website_form_submission WHERE id=$1',[answer.id])).rows[0]
  assert.equal(retained.form_id,form.id);assert.equal(retained.data.message,'Historical answer')
  await call(`/website/sites/${siteB}/forms/${form.id}/scope`,{method:'POST',body:{expectedLegacySiteId:siteB,resolveAmbiguous:true},status:409})
  ambiguousForm=(await db.query("INSERT INTO website_form(id,company_id,site_id,name,updated_at) VALUES(uuidv7(),$1,$2,'Ambiguous browser form',now()) RETURNING id",[company,ambiguousSite])).rows[0].id
 })
 await check('template failure rolls back pages, revision and receipt; same key can recover',async()=>{
  const {allTemplates}=await import('../apps/desktop/src/website/runlyTemplates/index.js')
  const selected=allTemplates.find(t=>t.id==='atlas-negocio').pages.filter(p=>p.id!=='home').slice(0,2)
  await db.query('CREATE TABLE runly_studio_test.template_failure(site_id uuid,slug text)')
  await db.query('INSERT INTO runly_studio_test.template_failure VALUES($1,$2)',[siteB,selected[1].routePath.slice(1)])
  await db.query("CREATE FUNCTION runly_studio_test.reject_template() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM runly_studio_test.template_failure WHERE site_id=NEW.site_id AND slug=NEW.slug) THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$")
  await db.query('CREATE TRIGGER integration_template_failure BEFORE INSERT ON website_page FOR EACH ROW EXECUTE FUNCTION runly_studio_test.reject_template()')
  const before=await state(siteB),count=(await db.query('SELECT count(*) FROM website_page WHERE site_id=$1',[siteB])).rows[0].count
  const body={expectedRevision:before.draftRevision,pageIds:selected.map(p=>p.id)},idempotencyKey=key()
  try{await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body,idempotencyKey,status:500})}
  finally{await db.query('DROP TRIGGER integration_template_failure ON website_page; DROP FUNCTION runly_studio_test.reject_template(); DROP TABLE runly_studio_test.template_failure')}
  assert.equal((await db.query('SELECT count(*) FROM website_page WHERE site_id=$1',[siteB])).rows[0].count,count)
  assert.equal((await state(siteB)).draftRevision,before.draftRevision)
  const recovered=await call(`/website/sites/${siteB}/templates/atlas-negocio/apply`,{method:'POST',body,idempotencyKey})
  assert.equal(recovered.data.pages.length,2)
 })
 await check('migration preserves historical eligibility and is transactionally reversible',async()=>{
  const client=await db.connect()
  try{
    await client.query('BEGIN; CREATE SCHEMA dependency_migration_test; SET LOCAL search_path=dependency_migration_test,public')
    await client.query('CREATE TABLE website_site(id uuid DEFAULT public.uuidv7() PRIMARY KEY,company_id uuid,UNIQUE(company_id,id)); CREATE TABLE catalog_product(id uuid DEFAULT public.uuidv7() PRIMARY KEY,company_id uuid,published boolean)')
    await client.query('INSERT INTO website_site(company_id) VALUES($1)',[company])
    await client.query('INSERT INTO catalog_product(company_id,published) VALUES($1,true)',[company])
    await client.query(await readFile('prisma/migrations/20261218120000_website_catalog_selection/migration.sql','utf8'))
    assert.equal((await client.query('SELECT catalog_mode FROM website_site')).rows[0].catalog_mode,'legacy_all')
    assert.equal((await client.query('INSERT INTO website_site(company_id) VALUES($1) RETURNING catalog_mode',[company])).rows[0].catalog_mode,'explicit')
    assert.equal((await client.query('SELECT count(*)::int n FROM website_catalog_product')).rows[0].n,0)
    assert.equal((await client.query('SELECT published FROM catalog_product')).rows[0].published,true)
  }finally{await client.query('ROLLBACK');client.release()}
  assert.equal((await db.query("SELECT to_regnamespace('dependency_migration_test') AS schema")).rows[0].schema,null)
  const legacy=(await db.query("INSERT INTO website_site(company_id,name,status,catalog_mode,updated_at) VALUES($1,'Historical catalog','published','legacy_all',now()) RETURNING id",[company])).rows[0]
  assert.equal((await publicProducts(legacy.id,'two-'+suffix)).status,200)
  assert.equal((await publicProducts(siteA,'two-'+suffix)).status,404)
  const initial=await state(legacy.id),body={productIds:[product1],expectedRevision:initial.draftRevision},idempotencyKey=key()
  const foreignProduct=(await db.query("INSERT INTO catalog_product(company_id,name,slug,price,published) VALUES($1,'Foreign bulk selection',$2,1,true) RETURNING id",[c.companies[1].id,'foreign-'+suffix])).rows[0].id
  await call(`/website/sites/${legacy.id}/catalog/selection`,{method:'PUT',body:{...body,productIds:[product1,foreignProduct]},status:404})
  assert.equal((await state(legacy.id)).draftRevision,initial.draftRevision)
  assert.equal((await publicProducts(legacy.id,'two-'+suffix)).status,200)
  await call('/website/sites/invalid/catalog/products',{status:404})
  const selected=await call(`/website/sites/${legacy.id}/catalog/selection`,{method:'PUT',body,idempotencyKey})
  assert.deepEqual(await call(`/website/sites/${legacy.id}/catalog/selection`,{method:'PUT',body,idempotencyKey}),selected)
  assert.equal((await publicProducts(legacy.id,'two-'+suffix)).status,404)
  assert.equal((await publicProducts(legacy.id,'one-'+suffix)).status,200)
 })
 const templateTarget=await createSite('Template browser '+suffix)
 await writeFile(dir+'/dependencies-fixture.json',JSON.stringify({siteA,siteB,otherSite,product1,product2,pageId:page.id,postId:post.id,templateTarget,ambiguousSite,ambiguousForm}))
 console.log('PASS',results.length,'dependency cases')
}catch(error){results.push({name:'execution',status:'FAIL',error:error.message});console.error(error.message);process.exitCode=1}
finally{await writeFile(dir+'/dependencies-results.json',JSON.stringify(results,null,2));await db.end()}
