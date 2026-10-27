import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { blankDocument, appendObject } from '../apps/shared/studio/document.js'
import { createEphemeralKey } from '../apps/shared/studio/realtime.js'
import { openPanel, waitForSynced } from './fixtures/studio/editor-controls.mjs'
const sharp=createRequire(new URL('../apps/api/package.json',import.meta.url))('sharp')
const {images}=JSON.parse(await readFile('.artifacts/studio/delete-catalog-build.json','utf8'))
const stack=await createStudioStack({apiImage:images.api,webImage:images.web})
let browser;const contexts=[],checks=[],metrics={}
const record=message=>{checks.push(message);console.log(message)}
try {
  const config=JSON.parse(await readFile(stack.composeFile,'utf8'))
  config.services['runly-worker']={image:images.worker,pull_policy:'never',restart:'no',environment:config.services['runly-api'].environment,networks:{default:null}}
  await writeFile(stack.composeFile,JSON.stringify(config))
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'],{log:join(stack.directory,'startup.log')})
  await stack.verifyTarget();await stack.initialize()
  const scenario=await seedStudioScenario(stack),[owner,viewer,editor,foreign]=scenario.users,[company,other]=scenario.companies
  const viewerRole=(await stack.pool.query("INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'studio.delete.viewer','Lector de prueba',now()) RETURNING id",[company.id])).rows[0]
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='studio.view'",[viewerRole.id])
  await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3',[viewerRole.id,company.id,viewer.id])
  const adminRole=(await stack.pool.query("SELECT id FROM role WHERE key='runly.admin' AND company_id IS NULL AND enabled LIMIT 1")).rows[0]
  await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())',[company.id,foreign.id,adminRole.id])
  await stack.compose(['up','-d','studio-catalog-test','runly-api','runly-web','runly-worker'],{log:join(stack.directory,'application-start.log')})
  let ready=false
  for(let attempt=0;attempt<90;attempt++){try{if((await fetch(stack.urls.api+'/public/website/desktop/config')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,500))}
  assert.ok(ready,'Dedicated API ready')
  const tokens=await Promise.all(scenario.users.map(async user=>{const response=await fetch(stack.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})});assert.equal(response.status,200);return(await response.json()).data.access_token}))
  const request=(path,{actor=0,tenant=company.id,method='GET',data,body}={})=>fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':tenant,'X-Runly-Studio-Protocol':'3',...(data?{'Content-Type':'application/json'}:{})},body:body??(data?JSON.stringify(data):undefined)})
  const json=async response=>{assert.ok(response.ok,`${response.status}: ${await response.clone().text()}`);return(await response.json()).data}
  const create=(name,document=blankDocument(),extra={},actor=0)=>request('/studio/designs',{actor,method:'POST',data:{name,document,...extra}}).then(json)
  const share=(id,userId,role)=>request(`/studio/designs/${id}/collaborators`,{method:'PUT',data:{userId,role}}).then(json)
  const remove=(row,options={})=>request(`/studio/designs/${row.id}`,{method:'DELETE',data:{revision:row.revision},...options})
  const png=await sharp({create:{width:64,height:48,channels:3,background:'#ec4899'}}).png().toBuffer(),upload=new FormData()
  upload.set('file',new File([png],'delete-proof.png',{type:'image/png'}));upload.set('moduleKey','runly.files');upload.set('entityType','AtlasFile');upload.set('visibility','PRIVATE')
  const file=await json(await request('/files/upload',{method:'POST',body:upload}))
  const source=await create('Origen con foto',appendObject(blankDocument(),'image',{fileAssetId:file.id}))
  await share(source.id,editor.id,'EDITOR');await share(source.id,viewer.id,'VIEWER')
  const personal=await json(await request('/studio/templates',{method:'POST',data:{designId:source.id,name:'Plantilla preservada',scope:'personal'}}))
  const fromTemplate=await json(await request(`/studio/templates/${personal.id}/designs`,{method:'POST',data:{}}))
  const published=await json(await request(`/studio/templates/${personal.id}/publish`,{method:'POST',data:{revision:personal.revision}}))
  const companyCopy=await json(await request(`/studio/templates/${personal.id}/designs`,{actor:2,method:'POST',data:{}}))
  const borrowed=await create('Copia autorizada',source.document,{sourceDesignId:source.id},2)
  assert.equal((await stack.pool.query('SELECT origin_design_id FROM studio_design_asset WHERE design_id=$1 AND file_id=$2',[borrowed.id,file.id])).rows[0].origin_design_id,source.id)
  for(const actor of [1,2,3])assert.ok([403,404].includes((await remove(source,{actor})).status))
  assert.equal((await remove(source,{actor:3,tenant:other.id})).status,404)
  assert.equal((await remove(source,{data:{revision:source.revision+1}})).status,409)
  const beforeEpoch=(await stack.pool.query('SELECT public.runly_realtime_revision() AS value')).rows[0].value
  const results=await Promise.all([remove(source),remove(source)])
  assert.deepEqual(results.map(row=>row.status).sort(),[200,404])
  const retired=(await stack.pool.query('SELECT document,enabled,revision FROM studio_design WHERE id=$1',[source.id])).rows[0]
  assert.equal(retired.enabled,false);assert.equal(retired.revision,source.revision+1);assert.deepEqual(retired.document,source.document)
  assert.notEqual((await stack.pool.query('SELECT public.runly_realtime_revision() AS value')).rows[0].value,beforeEpoch)
  assert.equal((await stack.pool.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='studio.design.delete'",[source.id])).rows[0].n,1)
  assert.equal((await stack.pool.query('SELECT count(*)::int n FROM studio_collaborator WHERE design_id=$1',[source.id])).rows[0].n,2)
  for(const actor of [0,1,2]){
    assert.equal((await request(`/studio/designs/${source.id}`,{actor})).status,404)
    assert.equal((await request(`/studio/designs/${source.id}/changes`,{actor,method:'POST',data:{clientId:'retired-session',batchId:1,ops:[]}})).status,actor===1?403:404)
    assert.equal((await request(`/studio/designs/${source.id}/assets/${file.id}/signed-url`,{actor})).status,404)
    const key=await createEphemeralKey()
    assert.equal((await request(`/studio/designs/${source.id}/collaboration`,{actor,method:'POST',data:{version:1,sessionId:'a'.repeat(32),publicKey:key.publicKey}})).status,404)
  }
  for(const shared of ['all','mine','shared'])assert.equal((await json(await request(`/studio/designs?shared=${shared}`))).some(row=>row.id===source.id),false)
  assert.equal((await request(`/studio/templates/${personal.id}`)).status,200)
  assert.equal((await request(`/studio/designs/${fromTemplate.id}`)).status,200)
  assert.equal((await request(`/studio/designs/${companyCopy.id}`,{actor:2})).status,200)
  assert.equal((await request(`/studio/templates/${published.id}/assets/${file.id}/signed-url`,{actor:2})).status,200)
  assert.equal((await request(`/studio/designs/${borrowed.id}`,{actor:2})).status,200)
  assert.equal((await request(`/studio/designs/${borrowed.id}/assets/${file.id}/signed-url`,{actor:2})).status,200)
  assert.equal((await stack.pool.query('SELECT enabled FROM file_asset WHERE id=$1',[file.id])).rows[0].enabled,true)
  await json(await request(`/studio/designs/${borrowed.id}/collaborators`,{actor:2,method:'PUT',data:{userId:foreign.id,role:'VIEWER'}}))
  assert.equal((await request(`/studio/designs/${borrowed.id}`,{actor:3})).status,404)
  const helper='runly_studio.reference_access(uuid,uuid,boolean,integer,boolean)'
  for(const role of ['anon','authenticated','service_role','runly_studio_socket'])assert.equal((await stack.pool.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,helper])).rows[0].allowed,false)
  const asset=await json(await request(`/studio/designs/${borrowed.id}/assets/${file.id}/signed-url`,{actor:2}))
  const assetUrl=new URL(asset.signedUrl);assert.equal(assetUrl.origin,stack.urls.kong)
  assert.deepEqual(Buffer.from(await(await fetch(assetUrl)).arrayBuffer()),png)
  const exported=await request(`/studio/interchange/templates/${personal.id}/export`,{method:'POST',data:{acknowledgeImageCopies:true}})
  assert.equal(exported.status,200)
  const bundle=new FormData();bundle.set('file',new File([await exported.arrayBuffer()],'preserved.runlystudio',{type:'application/zip'}));bundle.set('options',JSON.stringify({target:'design',name:'Paquete preservado'}))
  const job=await json(await request('/studio/interchange/imports',{method:'POST',body:bundle}))
  const restored=await json(await request(`/studio/interchange/imports/${job.id}/confirm`,{method:'POST',data:{digest:job.digest,acceptWarnings:true}}))
  assert.equal((await request(`/studio/designs/${restored.id}`)).status,200)
  record('Logical owner-only retirement: concurrent/stale/foreign/admin/editor/viewer cases, audit/epoch, preserved document/template/Files and private authorized lineage')
  const target=await create('Edición activa retirada')
  await share(target.id,editor.id,'EDITOR');await share(target.id,viewer.id,'VIEWER')
  browser=await chromium.launch({channel:'chrome',headless:true})
  async function login(user){const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);const page=await context.newPage();await page.goto(stack.urls.web+'/app/login');await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password);await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'));return page}
  const ownerPage=await login(owner),editorPage=await login(editor),viewerPage=await login(viewer)
  for(const page of [ownerPage,editorPage,viewerPage])await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${target.id}`)
  await waitForSynced(editorPage)
  await editorPage.route(`**/studio/designs/${target.id}/changes`,route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:'{"error":"Simulated offline"}'}):route.continue())
  await openPanel(editorPage,'Texto');await editorPage.getByRole('button',{name:'Añadir un título',exact:true}).click()
  await editorPage.getByRole('status').filter({hasText:'Sin conexión'}).first().waitFor()
  await json(await remove(target))
  const started=Date.now()
  await Promise.all([editorPage,viewerPage,ownerPage].map(page=>page.getByRole('heading',{name:'Ya no tienes acceso a este diseño'}).waitFor({timeout:45000})))
  metrics.revocationMs=Date.now()-started
  const draftDownload=editorPage.waitForEvent('download');await editorPage.getByRole('button',{name:'Descargar borrador local',exact:true}).click()
  const draftPath=join(stack.directory,'pending-draft.json');await(await draftDownload).saveAs(draftPath)
  assert.ok(JSON.parse(await readFile(draftPath,'utf8')).document.objects.some(object=>object.type==='text'))
  assert.equal((await stack.pool.query('SELECT jsonb_array_length(document->\'objects\')::int n FROM studio_design WHERE id=$1',[target.id])).rows[0].n,0)
  await editorPage.screenshot({path:join(stack.directory,'retired-pending.png')})
  record('Three live browser sessions lose access during an offline edit; unsent text survives in a downloadable local draft')
  const reconnect=await create('Retirada durante reconexión');await share(reconnect.id,editor.id,'EDITOR')
  await editorPage.goto(`${stack.urls.web}/app/m/runly.studio/?design=${reconnect.id}`);await waitForSynced(editorPage)
  await editorPage.context().setOffline(true)
  await openPanel(editorPage,'Texto');await editorPage.getByRole('button',{name:'Añadir un título',exact:true}).click()
  await editorPage.getByRole('status').filter({hasText:'Sin conexión'}).first().waitFor()
  await json(await remove(reconnect));await editorPage.context().setOffline(false)
  await editorPage.getByRole('heading',{name:'Ya no tienes acceso a este diseño'}).waitFor({timeout:45000})
  await editorPage.getByRole('button',{name:'Descargar borrador local',exact:true}).waitFor()
  assert.equal((await stack.pool.query('SELECT jsonb_array_length(document->\'objects\')::int n FROM studio_design WHERE id=$1',[reconnect.id])).rows[0].n,0)
  record('Reconnect after retirement denies queued writes and offers the preserved draft')
  await ownerPage.goto(stack.urls.web+'/app/m/runly.studio/?view=designs')
  const uiDesign=await create('Eliminar desde tarjeta')
  await ownerPage.reload();await ownerPage.getByRole('button',{name:'Opciones de Eliminar desde tarjeta',exact:true}).click()
  await ownerPage.getByRole('menuitem',{name:'Eliminar diseño',exact:true}).click()
  const dialog=ownerPage.getByRole('dialog',{name:'Eliminar diseño',exact:true})
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal((await request(`/studio/designs/${uiDesign.id}`)).status,200)
  await ownerPage.getByRole('button',{name:'Opciones de Eliminar desde tarjeta',exact:true}).click();await ownerPage.getByRole('menuitem',{name:'Eliminar diseño',exact:true}).click()
  const deleted=ownerPage.waitForResponse(response=>response.url()===`${stack.urls.api}/studio/designs/${uiDesign.id}`&&response.request().method()==='DELETE')
  await ownerPage.getByRole('dialog',{name:'Eliminar diseño',exact:true}).getByRole('button',{name:'Eliminar diseño',exact:true}).click();assert.equal((await deleted).status(),200)
  await ownerPage.getByRole('button',{name:'Abrir Eliminar desde tarjeta',exact:true}).waitFor({state:'hidden'})
  record('Real card menu, cancellation, destructive confirmation, server response and list cache removal pass')
  const paginated=[]
  for(let n=0;n<25;n++)paginated.push(await create(`Página de prueba ${String(n).padStart(2,'0')}`))
  const filtered=ownerPage.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/studio/designs'&&url.searchParams.get('q')==='Página de prueba'&&url.searchParams.get('shared')==='mine'&&url.searchParams.get('page')==='1'})
  await ownerPage.getByLabel('Buscar en tus diseños',{exact:true}).fill('Página de prueba')
  await ownerPage.getByRole('radio',{name:'Míos',exact:true}).click()
  assert.equal((await filtered).status(),200);await(await filtered).finished()
  const pagination=ownerPage.getByRole('navigation',{name:'Paginación de diseños',exact:true})
  await pagination.getByRole('button',{name:'Siguiente',exact:true}).click()
  await pagination.getByText('Página 2',{exact:true}).waitFor()
  await ownerPage.getByRole('button',{name:`Opciones de ${paginated[0].name}`,exact:true}).click();await ownerPage.getByRole('menuitem',{name:'Eliminar diseño',exact:true}).click()
  await ownerPage.getByRole('dialog',{name:'Eliminar diseño',exact:true}).getByRole('button',{name:'Eliminar diseño',exact:true}).click()
  await pagination.getByText('Página 1',{exact:true}).waitFor();await ownerPage.getByRole('button',{name:`Abrir ${paginated[0].name}`,exact:true}).waitFor({state:'hidden'})
  await json(await remove(paginated[24]))
  await ownerPage.getByRole('button',{name:`Abrir ${paginated[24].name}`,exact:true}).waitFor({state:'hidden',timeout:45000})
  record('Last row on page two returns to page one; another session retirement removes its card on refresh')
  const catalogDesign=await create('Biblioteca de prueba');await ownerPage.goto(`${stack.urls.web}/app/m/runly.studio/?design=${catalogDesign.id}`);await waitForSynced(ownerPage)
  await openPanel(ownerPage,'Imágenes');await ownerPage.getByRole('radio',{name:'Iconos',exact:true}).click()
  await ownerPage.getByRole('button',{name:'Ver recurso star',exact:true}).click()
  await ownerPage.getByRole('dialog').filter({hasText:'geometría editable'}).getByRole('button',{name:'Insertar recurso',exact:true}).click();await waitForSynced(ownerPage)
  for(const [label,category]of [['Fotos','photograph'],['Ilustraciones','illustration']]){
    await ownerPage.getByRole('radio',{name:label,exact:true}).click();const search=ownerPage.getByLabel(`Buscar ${label==='Fotos'?'fotografías':'ilustraciones'}`,{exact:true});await search.fill('offline')
    await ownerPage.getByText('Proveedor no disponible',{exact:true}).waitFor();await search.fill('star')
    await ownerPage.getByRole('button',{name:'Ver recurso Fotografía sintética violeta',exact:true}).click()
    const imported=ownerPage.waitForResponse(response=>response.url().endsWith('/import')&&response.request().method()==='POST')
    const preview=ownerPage.getByRole('dialog').filter({hasText:'original seleccionado'})
    await preview.getByRole('button',{name:'Insertar recurso',exact:true}).click();assert.equal((await imported).status(),200)
    await preview.waitFor({state:'hidden',timeout:35000});await waitForSynced(ownerPage)
    assert.ok(category)
  }
  const final=await json(await request(`/studio/designs/${catalogDesign.id}`));assert.ok(final.document.objects.some(object=>object.type==='vector'));assert.equal(final.document.objects.filter(object=>object.type==='image').length,2)
  await ownerPage.screenshot({path:join(stack.directory,'catalog-recovery.png')})
  record('Catalog UI: offline editable icons, honest provider error and recovery, photo/illustration import to private disposable Files')
  await writeFile(join(stack.directory,'delete-catalog-result.json'),JSON.stringify({passed:true,images,checks,metrics},null,2))
}catch(error){for(const [index,context]of contexts.entries())await context.pages()[0]?.screenshot({path:join(stack.directory,`failure-${index}.png`)}).catch(()=>{});throw error}
finally{await Promise.allSettled(contexts.map(context=>context.close()));await browser?.close();await stack.close()}
