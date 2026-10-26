import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { Hono } from 'hono'
import { createStudioTemplatesService } from '../../routes/studio/studio-templates-service.js'
import { createStudioService } from '../../routes/studio/studio-service.js'
import { createStudioRouter } from '../../routes/studio/index.js'
import { createStudioMiraiCapabilities } from '../../routes/studio/mirai-capabilities.js'
import { appendObject,blankDocument,STUDIO_SCHEMA_VERSION } from '../../../../shared/studio/document.js'
import { digest } from '../state.js'

// Full forward migrations + real Studio/RBAC access functions, in the MCP
// runner's fresh local Docker database only. No .env or remote fallback.
export async function installStudioSchema(url) {
  const parsed=new URL(url)
  assert.ok(['localhost','127.0.0.1'].includes(parsed.hostname));assert.equal(parsed.pathname,'/runly_mcp_test')
  const db=new pg.Client({connectionString:url});await db.connect()
  try {
    await db.query(`CREATE SCHEMA realtime; CREATE TABLE realtime.messages(id uuid);
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql AS $$ SELECT ''::text $$;
      CREATE FUNCTION public.runly_realtime_revision() RETURNS text LANGUAGE sql AS $$ SELECT '1'::text $$;
      CREATE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE realtime_authorization_revision(id boolean PRIMARY KEY,revision bigint);
      INSERT INTO realtime_authorization_revision VALUES(true,1);
      CREATE FUNCTION public.runly_rotate_realtime() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        UPDATE public.realtime_authorization_revision SET revision=revision+1 WHERE id; RETURN NULL; END $$;`)
    for(const folder of ['20261130000000_studio_design','20261203000000_studio_collaboration','20261205000000_studio_templates']) {
      await db.query(await readFile(new URL(`../../../../../prisma/migrations/${folder}/migration.sql`,import.meta.url),'utf8'))
    }
  } finally {await db.end()}
}

export async function studioCases(t,{prisma,company,other,user,role,membership,run,prepare,commit,approve,request,webToken}) {
  const templates=createStudioTemplatesService({prisma}),designs=createStudioService({prisma})
  const document=appendObject(blankDocument(),'text',{text:'Contrato editable',fill:'#111827'})
  async function grant(key,roleId=role.id) {
    const permission=await prisma.permission.upsert({where:{key},create:{key,name:key},update:{}})
    await prisma.rolePermission.upsert({where:{roleId_permissionId:{roleId,permissionId:permission.id}},create:{roleId,permissionId:permission.id},update:{}})
    return permission
  }
  const manage=await grant('studio.templates.manage'),publish=await grant('studio.templates.publish')
  const [{id:authId}]=await prisma.$queryRaw`SELECT uuidv7()::text AS id`
  const second=await prisma.userProfile.create({data:{authUserId:authId,displayName:'Otro miembro Studio',email:'studio-member@example.test'}})
  const normalRole=await prisma.role.create({data:{companyId:company.id,key:'studio.normal',name:'Miembro normal'}})
  const secondMembership=await prisma.membership.create({data:{companyId:company.id,userId:second.id,roleId:normalRole.id}})
  for(const key of ['studio.view','studio.create','studio.edit','studio.templates.manage'])await grant(key,normalRole.id)
  let personal,enterprise,copied
  await t.test('Studio: create personal, immutable Runly, list scopes and no implicit publish grant',async()=>{
    personal=await templates.create(company.id,user.id,{name:'Personal privada',document})
    assert.equal(personal.scope,'personal');assert.equal(personal.source,'user');assert.equal(personal.revision,1)
    assert.equal((await templates.list(company.id,second.id,{scope:'personal'})).pagination.total,0)
    await assert.rejects(templates.get(company.id,second.id,personal.id),{status:404})
    await assert.rejects(templates.get(other.id,user.id,personal.id),{status:403})
    await assert.rejects(templates.create(company.id,second.id,{name:'No autorizado',document,scope:'company'}),{status:403})
    const personalNormal=await templates.create(company.id,second.id,{name:'Solo mía',document})
    await assert.rejects(templates.publish(company.id,second.id,personalNormal.id,{revision:1}),{status:403})
    await assert.rejects(templates.publish(company.id,user.id,personalNormal.id,{revision:1}),{status:404})
    const builtins=await templates.list(company.id,user.id,{scope:'runly',q:'Lanzamiento'})
    assert.equal(builtins.data[0].scope,'runly');assert.equal(builtins.data[0].canEdit,false)
    assert.deepEqual(builtins.data[0].document,builtins.data[0].preview)
    await assert.rejects(templates.update(company.id,user.id,'runly:square',{revision:1,name:'Intrusión'}),{status:404})
    assert.equal((await templates.get(company.id,user.id,'square')).id,'runly:square')
    await assert.rejects(templates.create(company.id,user.id,{name:'Falso origen',document,source:'ai'}),{status:400})
  })
  await t.test('Studio: atomic revisions, publication, company administration and independent copy',async()=>{
    const results=await Promise.allSettled(['Uno','Dos'].map(name=>templates.update(company.id,user.id,personal.id,{name,revision:1})))
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409)
    enterprise=await templates.publish(company.id,user.id,personal.id,{revision:2})
    assert.equal(enterprise.scope,'company');assert.equal(enterprise.revision,3)
    assert.equal((await templates.get(company.id,second.id,enterprise.id)).canEdit,false)
    await assert.rejects(templates.update(company.id,second.id,enterprise.id,{name:'No',revision:3}),{status:403})
    const normalPersonal=await templates.create(company.id,second.id,{name:'Otra empresa',scope:'personal',document})
    await grant('studio.templates.publish',normalRole.id)
    const normalCompany=await templates.publish(company.id,second.id,normalPersonal.id,{revision:1})
    assert.equal((await templates.update(company.id,user.id,normalCompany.id,{name:'Administrada',revision:2})).name,'Administrada')
    copied=await templates.use(company.id,second.id,enterprise.id)
    const changed=appendObject(document,'rectangle')
    enterprise=await templates.update(company.id,user.id,enterprise.id,{document:changed,revision:3})
    assert.deepEqual((await designs.get(company.id,second.id,copied.id)).document,document)
    await templates.remove(company.id,user.id,enterprise.id,{revision:4})
    await assert.rejects(templates.use(company.id,second.id,enterprise.id),{status:404})
    assert.deepEqual((await designs.get(company.id,second.id,copied.id)).document,document)
    const [audit]=await prisma.$queryRaw`SELECT count(*)::int AS n FROM audit_log WHERE module_key='runly.studio' AND action LIKE 'studio.template.%'`
    assert.ok(audit.n>=8)
  })
  await t.test('Studio: company image grants only referenced files; existing designs survive template retirement',async()=>{
    const file=await prisma.fileAsset.create({data:{entityId:company.id,entityType:'AtlasFile',uploadedById:user.id,bucket:'private-test',objectKey:'studio/image.png',originalName:'image.png',mimeType:'image/png',sizeBytes:10,visibility:'PRIVATE'}})
    const scene=appendObject(document,'image',{fileAssetId:file.id,groupId:'image-group'})
    await assert.rejects(templates.create(company.id,second.id,{name:'Archivo personal ajeno',document:scene}),{code:'STUDIO_ASSET_DENIED'})
    let template=await templates.create(company.id,user.id,{name:'Foto privada',document:scene})
    template=await templates.publish(company.id,user.id,template.id,{revision:1})
    const copy=await templates.use(company.id,second.id,template.id)
    assert.equal((await designs.get(company.id,second.id,copy.id)).document.objects.at(-1).fileAssetId,file.id)
    const [binding]=await prisma.$queryRaw`SELECT origin_design_id FROM studio_design_asset WHERE design_id=${copy.id}::uuid AND file_id=${file.id}::uuid`
    assert.equal(binding.origin_design_id,null)
    assert.equal((await prisma.fileAsset.findUnique({where:{id:file.id}})).visibility,'PRIVATE')
    await templates.remove(company.id,user.id,template.id,{revision:2})
    await designs.get(company.id,second.id,copy.id)
    await prisma.membership.update({where:{id:secondMembership.id},data:{enabled:false}})
    await assert.rejects(designs.get(company.id,second.id,copy.id),{status:404})
    await assert.rejects(templates.list(company.id,second.id),{status:403})
    await prisma.membership.update({where:{id:secondMembership.id},data:{enabled:true}})
    await prisma.fileAsset.update({where:{id:file.id},data:{enabled:false}})
    await assert.rejects(designs.get(company.id,second.id,copy.id),{status:404})
    await prisma.fileAsset.update({where:{id:file.id},data:{enabled:true}})
    const source=await designs.create(company.id,user.id,{name:'Compartido',document:scene})
    await prisma.$executeRaw`INSERT INTO studio_collaborator(design_id,user_id,role,granted_by) VALUES(${source.id}::uuid,${second.id}::uuid,'EDITOR',${user.id}::uuid)`
    const received=await templates.create(company.id,second.id,{name:'Recibida',designId:source.id})
    await assert.rejects(templates.publish(company.id,second.id,received.id,{revision:1}),{code:'STUDIO_ASSET_DENIED'})
    const [rights]=await prisma.$queryRaw`SELECT has_table_privilege('authenticated','studio_template','SELECT') AS templates,has_table_privilege('anon','studio_template_asset','SELECT') AS assets`
    assert.deepEqual(rights,{templates:false,assets:false})
  })
  await t.test('Studio: HTTP contract preserves envelope, requires revision and cannot spoof identity/source',async()=>{
    const app=new Hono()
    app.use('*',async(c,next)=>{c.set('companyId',company.id);c.set('userContext',{profile:user});await next()})
    app.route('/',createStudioRouter({prisma,requirePermission:()=>async(_c,next)=>next()}))
    const post=(path,input,method='POST')=>app.request(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
    const response=await post('/studio/templates',{name:'HTTP',document});assert.equal(response.status,201)
    const {data:created}=await response.json();assert.equal(created.document.schemaVersion,STUDIO_SCHEMA_VERSION)
    assert.equal((await post(`/studio/templates/${created.id}`,{name:'Falta revisión'},'PUT')).status,400)
    assert.equal((await post('/studio/templates',{name:'Origen falso',document,source:'ai'})).status,400)
    const listing=await(await app.request('/studio/templates?scope=personal&q=HTTP')).json()
    assert.equal(listing.data.data[0].id,created.id);assert.deepEqual(listing.data.data[0].document,listing.data.data[0].preview)
    assert.equal((await post(`/studio/templates/${created.id}/use`,{})).status,201)
  })
  await t.test('Studio: MirAI queries share authorization/contracts and cannot bypass sensitive approval',async()=>{
    const capability=createStudioMiraiCapabilities({prisma})
    assert.deepEqual(capability.actions,[])
    const a={companyId:company.id,actorProfileId:user.id}
    const overview=await capability.tools.find(q=>q.name==='studio_overview').run({},a)
    assert.equal(overview.schemaVersion,STUDIO_SCHEMA_VERSION);assert.ok(overview.fonts[0].variants.length)
    const lint=await capability.tools.find(q=>q.name==='studio_review_design').run({document},a)
    assert.ok(Array.isArray(lint.findings))
    await assert.rejects(capability.tools.find(q=>q.name==='studio_template_detail').run({templateId:personal.id},{...a,actorProfileId:second.id}),{status:404})
  })
  await t.test('Studio MCP: approval, sensitive publish, provenance, stale revisions, idempotency and expiry',async()=>{
    const proposal=await prepare('studio','studio_template_save',{name:'MCP personal',document})
    await assert.rejects(commit('studio',proposal),{code:'approval_required'})
    await approve(proposal)
    const result=await commit('studio',proposal);assert.deepEqual(await commit('studio',proposal),result)
    const id=result.result.id
    assert.equal((await templates.get(company.id,user.id,id)).source,'ai')
    const fromTemplate=await prepare('studio','studio_create_design',{name:'Nombre de copia aprobado',templateId:id})
    await approve(fromTemplate)
    assert.equal((await commit('studio',fromTemplate)).result.name,'Nombre de copia aprobado')
    const publishProposal=await prepare('studio','studio_template_publish',{templateId:id,revision:1})
    const rejected=await request(`/mcp/proposals/${publishProposal.proposalId}`,{approve:true,acknowledgeSensitive:false},webToken())
    assert.equal(rejected.status,403)
    await approve(publishProposal);await commit('studio',publishProposal)
    const edit=await prepare('studio','studio_template_update',{templateId:id,revision:2,name:'Cambio asistido'})
    await approve(edit)
    await templates.update(company.id,user.id,id,{revision:2,name:'Cambio paralelo'})
    await assert.rejects(commit('studio',edit),error=>error.status===409)
    const expired=await prepare('studio','studio_create_design',{name:'Vencida',document})
    await prisma.mcpState.update({where:{key:digest(expired.proposalId)},data:{expiresAt:new Date(0)}})
    await assert.rejects(commit('studio',expired),{code:'invalid_grant'})
    const revoked=await prepare('studio','studio_template_save',{name:'Revocada',document})
    await approve(revoked)
    await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:manage.id}}})
    await assert.rejects(commit('studio',revoked),{status:403});await grant('studio.templates.manage')
    const newDesign=await prepare('studio','studio_create_design',{name:'Diseño asistido',document})
    await approve(newDesign)
    const made=await commit('studio',newDesign)
    const change=await prepare('studio','studio_update_design',{designId:made.result.id,name:'Diseño editado',document:appendObject(document,'rectangle'),revision:1})
    await approve(change);assert.equal((await commit('studio',change)).result.revision,2)
    await assert.rejects(prepare('studio','studio_update_design',{designId:made.result.id,name:'Obsoleto',document,revision:1}),{status:409})
    // publish is independent from manage; it cannot be inferred from studio.edit.
    await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:manage.id}}})
    const companySave=await prepare('studio','studio_template_save',{name:'Empresa asistida',scope:'company',document})
    assert.equal((await request(`/mcp/proposals/${companySave.proposalId}`,{approve:true,acknowledgeSensitive:false},webToken())).status,403)
    await approve(companySave);assert.equal((await commit('studio',companySave)).result.scope,'company')
    await grant('studio.templates.manage')
    const [privateFile]=await prisma.$queryRaw`SELECT id FROM file_asset WHERE entity_id=${company.id}::uuid AND uploaded_by_id=${user.id}::uuid AND mime_type='image/png' AND enabled LIMIT 1`
    const photoDoc=appendObject(document,'image',{fileAssetId:privateFile.id})
    const imageProposal=await prepare('studio','studio_template_save',{name:'Archivo revocado',document:photoDoc})
    await approve(imageProposal)
    await prisma.fileAsset.update({where:{id:privateFile.id},data:{enabled:false}})
    await assert.rejects(commit('studio',imageProposal),{status:403})
    await prisma.fileAsset.update({where:{id:privateFile.id},data:{enabled:true}})
    const pendingPublish=await prepare('studio','studio_template_publish',{templateId:(await templates.create(company.id,user.id,{name:'Publicación revocada',document})).id,revision:1})
    await approve(pendingPublish)
    await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:role.id,permissionId:publish.id}}})
    await assert.rejects(commit('studio',pendingPublish),{status:403});await grant('studio.templates.publish')
    const missingView=await prisma.permission.findUnique({where:{key:'studio.view'}})
    await prisma.rolePermission.delete({where:{roleId_permissionId:{roleId:normalRole.id,permissionId:missingView.id}}})
    await assert.rejects(templates.list(company.id,second.id),{status:403})
    await grant('studio.view',normalRole.id)
    await prisma.membership.update({where:{id:membership.id},data:{enabled:false}})
    await assert.rejects(templates.list(company.id,user.id),{status:403})
    await prisma.membership.update({where:{id:membership.id},data:{enabled:true}})
    await prisma.membership.update({where:{id:secondMembership.id},data:{companyId:other.id}})
    await assert.rejects(templates.list(company.id,second.id),{status:403})
    await prisma.membership.update({where:{id:secondMembership.id},data:{companyId:company.id}})
    assert.ok(publish.id)
  })
  const fixture=await templates.create(company.id,user.id,{name:'Consultas MCP',document})
  const design=await templates.use(company.id,user.id,fixture.id)
  return {templateId:fixture.id,designId:design.id}
}
