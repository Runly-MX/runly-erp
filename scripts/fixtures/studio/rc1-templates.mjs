import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {blankDocument,appendObject,validateDocument} from '../../../apps/shared/studio/document.js'
import {LINE_CAPS} from '../../../apps/shared/studio/shape-properties.js'
import {exportImage,openPanel} from './editor-controls.mjs'

const sharp=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('sharp')

export async function verifyRcTemplates(stack,scenario) {
  const checks=[],errors=[],serverErrors=[]
  const record=message=>{checks.push(message);console.log(`RC1 templates: ${message}`)}
  const [company,other]=scenario.companies
  const password=scenario.users[0].password
  async function profile(label,roleId) {
    const email=`rc-${label}@studio.example.test`
    const {data,error}=await scenario.admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null)
    const user=(await stack.pool.query('INSERT INTO user_profile(id,auth_user_id,email,display_name,updated_at) VALUES(uuidv7(),$1,$2,$3,now()) RETURNING id',[data.user.id,email,`RC ${label}`])).rows[0]
    await stack.pool.query('INSERT INTO membership(id,company_id,user_id,role_id,updated_at) VALUES(uuidv7(),$1,$2,$3,now())',[company.id,user.id,roleId])
    return {...user,email,password}
  }
  const adminRole=(await stack.pool.query("SELECT id FROM role WHERE key='runly.admin' AND company_id IS NULL AND enabled LIMIT 1")).rows[0];assert.ok(adminRole)
  const personalRole=(await stack.pool.query("INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'studio.rc.personal','Personal RC',now()) RETURNING id",[company.id])).rows[0]
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key IN ('studio.view','studio.create','studio.edit','studio.templates.manage','files.access','files.assets.read','files.assets.create')",[personalRole.id])
  const administrator=await profile('admin',adminRole.id),normal=await profile('normal',personalRole.id),foreign=scenario.users[3]
  async function login(user) {
    const response=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(response.status,200);return(await response.json()).data.access_token
  }
  const adminToken=await login(administrator),normalToken=await login(normal),foreignToken=await login(foreign)
  const api=(path,{token=adminToken,companyId=company.id,data,body,method=data?'POST':'GET'}={})=>fetch(`${stack.urls.api}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'X-Runly-Company-Id':companyId,...(data?{'Content-Type':'application/json'}:{})},body:body??(data?JSON.stringify(data):undefined)})
  const json=async response=>{const status=typeof response.status==='function'?response.status():response.status,ok=typeof response.ok==='function'?response.ok():response.ok;if(status>=500)serverErrors.push(status);const body=await response.json();assert.ok(ok,`${status}: ${JSON.stringify(body)}`);return body.data}
  const image=await sharp({create:{width:480,height:320,channels:4,background:'#14b8a6'}}).png().toBuffer()
  const upload=new FormData();upload.set('file',new File([image],'rc-synthetic.png',{type:'image/png'}));upload.set('moduleKey','runly.files');upload.set('entityType','AtlasFile');upload.set('visibility','PRIVATE')
  const file=await json(await api('/files/upload',{method:'POST',body:upload}))
  const original=await json(await api('/studio/designs',{data:{name:'RC v5',document:appendObject(blankDocument(900,900),'image',{fileAssetId:file.id})}}))
  const edited=await sharp(image).rotate(90).png().toBuffer(),form=new FormData();form.set('file',new File([edited],'rc-edited.png',{type:'image/png'}))
  const copy=await json(await api(`/studio/designs/${original.id}/assets/${file.id}/edited-copy`,{method:'POST',body:form}))
  let scene=appendObject(blankDocument(900,900),'rectangle',{x:30,y:30,width:260,height:180,fill:'#D946EF',opacity:0.9,groupId:'rc-group',shape:{radius:24,strokeWidth:4,strokeColor:'#111827',dash:'dashed'},fillPaint:{type:'image',fileAssetId:file.id,image:{fit:'cover',zoom:1.3,offsetX:0.1,rotation:20,flipX:true}}})
  scene=appendObject(scene,'text',{x:330,y:30,width:480,height:70,text:'RC v5 editable',fontFamily:'Lato',fontVariant:'italic',fontSize:32,textAlign:'center',lineHeight:1.4,charSpacing:30,underline:true,groupId:'rc-group'})
  scene=appendObject(scene,'image',{x:330,y:130,width:180,height:160,fileAssetId:copy.id,image:{mask:'star',zoom:1.1,crop:{x:0.1,y:0.1,width:0.8,height:0.8},adjustments:{brightness:0.1,saturation:-0.2}}})
  scene=appendObject(scene,'vector',{x:570,y:150,width:170,height:160,svgName:'rc-safe.svg',geometry:{width:24,height:24,paths:[{d:'M0 24L12 0L24 24Z',fill:'color',stroke:'none',strokeWidth:0,cap:'butt',join:'miter'}]},fillPaint:{type:'image',fileAssetId:file.id}})
  for(const [i,endCap]of LINE_CAPS.entries())scene=appendObject(scene,'line',{x:60,y:350+i*60,width:600,height:20,strokeWidth:4,startCap:LINE_CAPS.at(-1-i),endCap,dash:i%2?'dashed':'solid'})
  scene=appendObject(scene,'text',{x:30,y:820,width:600,height:50,text:'RC content target',fontFamily:'Lato',fontVariant:'bold',fontSize:24})
  const saved=await json(await api(`/studio/designs/${original.id}`,{method:'PUT',data:{name:'RC v5',document:scene,revision:original.revision}}));assert.deepEqual(saved.document,scene)
  const browser=await chromium.launch({channel:'chrome',headless:true})
  const contexts=[]
  async function ui(user) {
    const context=await browser.newContext({viewport:{width:1440,height:1100}});contexts.push(context)
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(stack.urls.api+'/studio/templates')&&r.status()>=500)serverErrors.push(r.status())})
    await page.goto(`${stack.urls.web}/app/login`);await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password);await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));return page
  }
  async function catalog(page){await page.goto(`${stack.urls.web}/app/m/runly.studio/?view=templates`);await page.getByLabel('Buscar plantillas',{exact:true}).fill('RC ')}
  async function action(page,name,label){await page.getByRole('button',{name:`Opciones de ${name}`,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click()}
  async function saveTemplate(page,name,scope='personal') {
    await page.getByRole('button',{name:'Guardar como plantilla',exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Guardar como plantilla',exact:true})
    await dialog.getByRole('textbox',{name:/^Nombre/}).fill(name)
    if(scope==='company')await dialog.getByRole('radio',{name:'Toda la empresa',exact:true}).click()
    const response=page.waitForResponse(r=>r.url()===stack.urls.api+'/studio/templates'&&r.request().method()==='POST')
    await dialog.getByRole('button',{name:'Guardar plantilla',exact:true}).click();const saved=await json(await response);await dialog.waitFor({state:'hidden'});return saved
  }
  async function exportPixels(page,name){const download=page.waitForEvent('download');await exportImage(page,'PNG');const path=join(stack.directory,name);await(await download).saveAs(path);return sharp(path).raw().toBuffer()}
  try {
    const runly=await json(await api('/studio/templates?scope=runly'));assert.ok(runly.pagination.total>=16);assert.ok(runly.data.every(t=>t.scope==='runly'&&!t.canEdit))
    const page=await ui(administrator)
    await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${original.id}`);await page.getByRole('button',{name:'Guardar',exact:true}).waitFor()
    const before=await exportPixels(page,'rc-v5-before.png')
    await page.getByLabel('Nombre del diseño').fill('RC v5 guardado desde UI');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('status').filter({hasText:/^Guardado/}).first().waitFor()
    const after=await json(await api(`/studio/designs/${original.id}`))
    for(const item of scene.objects){const actual=after.document.objects.find(o=>o.id===item.id);assert.ok(actual);for(const key of ['fillPaint','shape','image','startCap','endCap','geometry','groupId','fontFamily','fontVariant','textAlign','charSpacing','underline','opacity'])assert.deepEqual(actual[key],item[key],`${item.id}.${key}`)}
    await page.reload();await page.getByRole('button',{name:'Guardar',exact:true}).waitFor();assert.deepEqual(await exportPixels(page,'rc-v5-reopen.png'),before)
    const jpg=page.waitForEvent('download');await exportImage(page,'JPG','100 %');const jpgPath=join(stack.directory,'rc-v5.jpg');await(await jpg).saveAs(jpgPath);assert.equal((await sharp(jpgPath).metadata()).format,'jpeg')
    record('Docker Web/API: v5 photo fills, masks/crop, seven caps, groups, fonts, SVG and edited originals survive UI save/reopen; PNG pixels identical and genuine JPG')
    let personal=await saveTemplate(page,'RC personal')
    const companyTemplate=await saveTemplate(page,'RC empresa directa','company');assert.equal(companyTemplate.scope,'company')
    await catalog(page);await page.getByRole('button',{name:'Ver plantilla RC personal',exact:true}).waitFor();await action(page,'RC personal','Editar nombre y categoría')
    const edit=page.getByRole('dialog',{name:'Editar plantilla',exact:true});await edit.getByRole('textbox',{name:/^Nombre/}).fill('RC personal editada');await edit.getByLabel('Descripción',{exact:true}).fill('Revisión RC sintética')
    await json(await api(`/studio/templates/${personal.id}`,{method:'PUT',data:{revision:personal.revision,name:'RC paralelo'}}))
    await edit.getByRole('button',{name:'Guardar cambios',exact:true}).click();await edit.getByText(/Alguien actualizó esta plantilla/).waitFor();assert.equal(await edit.getByRole('textbox',{name:/^Nombre/}).inputValue(),'RC personal editada')
    await edit.getByRole('button',{name:'Cargar versión actual',exact:true}).click();await edit.getByRole('button',{name:'Guardar cambios',exact:true}).click();await edit.waitFor({state:'hidden'})
    personal=await json(await api(`/studio/templates/${personal.id}`));assert.equal(personal.name,'RC personal editada');assert.equal(personal.description,'Revisión RC sintética')
    record('Administrator UI creates personal/company templates; metadata HTTP 409 preserves input and retry uses current revision')
    await page.getByRole('button',{name:'Ver plantilla RC personal editada',exact:true}).waitFor();await action(page,personal.name,'Editar contenido');await page.waitForURL(u=>u.searchParams.get('template')===personal.id)
    await openPanel(page,'Capas');await page.getByRole('button',{name:'RC content target',exact:true}).click();await page.getByLabel('Texto del elemento',{exact:true}).fill('Contenido RC revisado')
    await page.getByRole('button',{name:'Guardar en la plantilla',exact:true}).click();await page.getByText(`Plantilla «${personal.name}» actualizada`,{exact:true}).waitFor()
    personal=await json(await api(`/studio/templates/${personal.id}`));assert.ok(personal.document.objects.some(o=>o.text==='Contenido RC revisado'));assert.ok(personal.document.objects.some(o=>o.fillPaint?.type==='image'))
    await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('status').filter({hasText:/^Guardado/}).first().waitFor()
    await catalog(page);await action(page,personal.name,'Compartir con la empresa');const publish=page.getByRole('dialog',{name:'Compartir con la empresa',exact:true});await publish.getByRole('button',{name:'Compartir',exact:true}).click();await publish.waitFor({state:'hidden'})
    personal=await json(await api(`/studio/templates/${personal.id}`));assert.equal(personal.scope,'company')
    await page.getByRole('button',{name:`Ver plantilla ${personal.name}`,exact:true}).click();await page.getByRole('button',{name:/^Usar (esta )?plantilla$/}).click();await page.waitForURL(u=>u.searchParams.has('design'))
    const used=await json(await api(`/studio/designs/${new URL(page.url()).searchParams.get('design')}`));assert.deepEqual(used.document,personal.document)
    record('Administrator UI edits template content without stripping v5, publishes personal template and creates an independent v5 design')
    const normalScene=appendObject(blankDocument(),'text',{text:'Normal RC'})
    const own=await json(await api('/studio/designs',{token:normalToken,data:{name:'Normal RC',document:normalScene}}))
    const normalPage=await ui(normal);await normalPage.goto(`${stack.urls.web}/app/m/runly.studio/?design=${own.id}`);await normalPage.getByRole('button',{name:'Guardar como plantilla',exact:true}).click()
    const normalDialog=normalPage.getByRole('dialog',{name:'Guardar como plantilla',exact:true});assert.equal(await normalDialog.getByRole('radio',{name:'Toda la empresa',exact:true}).count(),0);await normalDialog.getByRole('textbox',{name:/^Nombre/}).fill('RC normal personal')
    const normalResponse=normalPage.waitForResponse(r=>r.url()===stack.urls.api+'/studio/templates'&&r.request().method()==='POST');await normalDialog.getByRole('button',{name:'Guardar plantilla',exact:true}).click();const normalTemplate=await json(await normalResponse);await normalDialog.waitFor({state:'hidden'})
    assert.equal(normalTemplate.canPublish,false);assert.equal((await api(`/studio/templates/${normalTemplate.id}/publish`,{token:normalToken,data:{revision:normalTemplate.revision}})).status,403)
    assert.equal((await api('/studio/templates',{token:normalToken,data:{name:'No autorizado',scope:'company',document:normalScene}})).status,403)
    await catalog(normalPage);await normalPage.getByRole('button',{name:`Opciones de ${normalTemplate.name}`,exact:true}).click();assert.equal(await normalPage.getByRole('menuitem',{name:'Compartir con la empresa',exact:true}).count(),0);await normalPage.keyboard.press('Escape')
    assert.equal((await json(await api(`/studio/templates/${personal.id}`,{token:normalToken}))).canEdit,false)
    assert.equal((await api(`/studio/templates/${personal.id}`,{token:foreignToken,companyId:other.id})).status,404)
    assert.equal((await api(`/studio/templates/${personal.id}/assets/${file.id}/signed-url`,{token:foreignToken,companyId:other.id})).status,404)
    const borrowed=await json(await api(`/studio/templates/${personal.id}/use`,{token:normalToken,data:{name:'Company authorized copy'}}));assert.equal(borrowed.document.schemaVersion,5)
    assert.equal((await api(`/files/${file.id}/signed-url`,{token:normalToken})).status,404)
    assert.equal((await api(`/studio/designs/${borrowed.id}/assets/${file.id}/signed-url`,{token:normalToken})).status,200)
    record('Real administrator, normal personal manager and foreign-company identities: canPublish=false, direct HTTP 403, hidden publication controls and scoped private image access')
    await catalog(page);await action(page,personal.name,'Retirar plantilla');const retire=page.getByRole('dialog',{name:'Retirar plantilla',exact:true});await retire.getByRole('button',{name:'Retirar',exact:true}).click();await retire.waitFor({state:'hidden'})
    assert.equal((await api(`/studio/templates/${personal.id}/use`,{data:{}})).status,404);assert.equal((await api(`/studio/designs/${borrowed.id}`,{token:normalToken})).status,200)
    record('Retiring template through real UI blocks new use while independent designs retain authorized private images')
    for(const version of [1,2,3,4]){
      const historical={schemaVersion:version,unit:'px',page:{width:320,height:240,background:'#ffffff'},objects:[{id:'legacy-shape',type:'rectangle',x:20,y:20,width:100,height:80,rotation:0,fill:'#123456'}]}
      const legacy=await json(await api('/studio/designs',{data:{name:`RC historical ${version}`,document:historical}}));assert.equal(legacy.document.schemaVersion,5)
      await stack.pool.query('UPDATE studio_design SET document=$1::jsonb WHERE id=$2',[JSON.stringify(historical),legacy.id])
      assert.equal((await stack.pool.query('SELECT document FROM studio_design WHERE id=$1',[legacy.id])).rows[0].document.schemaVersion,version)
      await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${legacy.id}`);await page.getByLabel('Nombre del diseño').fill(`RC historical ${version} saved`);await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('status').filter({hasText:/^Guardado/}).first().waitFor();assert.equal((await json(await api(`/studio/designs/${legacy.id}`))).document.objects[0].fill,'#123456')
    }
    record('Documents v1/v2/v3/v4 open, normalize and save through current real UI/API')
    await page.screenshot({path:join(stack.directory,'rc1-templates-ui.png'),fullPage:true})
    assert.deepEqual(errors,[]);assert.deepEqual(serverErrors,[])
    const audit=(await stack.pool.query("SELECT action,count(*)::int AS count FROM audit_log WHERE module_key='runly.studio' AND actor_id=$1 AND action LIKE 'studio.template.%' GROUP BY action",[administrator.id])).rows
    for(const action of ['create','update','publish','use','delete'])assert.ok(audit.some(r=>r.action===`studio.template.${action}`&&r.count>0),action)
    return {checks,server500:serverErrors.length,canPublishNormal:false,audit,compatibility:{designId:original.id,document:validateDocument(scene),token:adminToken,companyId:company.id,actorId:administrator.id,name:saved.name}}
  } catch(error){
    for(const [i,context]of contexts.entries())for(const [n,page]of context.pages().entries()){
      await page.screenshot({path:join(stack.directory,`rc1-failure-${i}-${n}.png`),fullPage:true}).catch(()=>{})
      await writeFile(join(stack.directory,`rc1-failure-${i}-${n}.txt`),await page.locator('body').innerText().catch(()=>''))
    }
    throw error
  } finally {await Promise.all(contexts.map(c=>c.close()));await browser.close()}
}
