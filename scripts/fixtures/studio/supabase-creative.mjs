import assert from 'node:assert/strict'
import {createRequire}from'node:module'
import {join}from'node:path'
import {readFile}from'node:fs/promises'
import {createHash}from'node:crypto'
import {chromium}from'playwright'
import {blankDocument}from'../../../apps/shared/studio/document.js'
import {openTemplates,useTemplate}from'./editor-controls.mjs'
const sharp=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('sharp')

export async function verifyStudioCreative(stack,{users,companies,admin}) {
  const[owner,denied,peer,foreign]=users,[company,other]=companies,checks=[],metrics={}
  const tokens=await Promise.all(users.map(async user=>{const r=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})});assert.equal(r.status,200);return(await r.json()).data.access_token}))
  const api=(path,body,index=0,companyId=company.id,method=body?'POST':'GET')=>fetch(`${stack.urls.api}${path}`,{method,headers:{Authorization:`Bearer ${tokens[index]}`,'X-Runly-Company-Id':companyId,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const data=async response=>{assert.ok(response.ok,`${response.status}: ${await response.clone().text()}`);return(await response.json()).data}
  const record=message=>{checks.push(message);console.log(`Studio creative: ${message}`)}
  const browser=await chromium.launch({channel:'chrome',headless:true}),contexts=[]
  async function login(user) {
    const context=await browser.newContext({viewport:{width:1600,height:1100}});contexts.push(context);const page=await context.newPage()
    await page.goto(`${stack.urls.web}/app/login`);await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'));return{page,context}
  }
  async function save(page){await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('status').filter({hasText:/^Guardado/}).first().waitFor()}
  async function choose(page,label,option){await page.getByLabel(label,{exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()}
  async function exportAs(page,format,name) {
    await page.getByRole('button',{name:'Descargar',exact:true}).click()
    await page.getByRole('menuitem',{name:format==='png'?/^PNG/:/^JPG · 100/}).click()
    await page.getByRole('dialog',{name:'Créditos del diseño',exact:true}).waitFor()
    await page.getByRole('button',{name:`Exportar ${format.toUpperCase()}`,exact:true}).waitFor({state:'visible'})
    const download=page.waitForEvent('download');await page.getByRole('button',{name:`Exportar ${format.toUpperCase()}`,exact:true}).click()
    const path=join(stack.directory,name);await(await download).saveAs(path);return path
  }
  try {
    const templates=await data(await api('/studio/templates'));assert.equal(templates.pagination.pageSize,12);assert.ok(templates.pagination.total>=16)
    assert.equal((await data(await api('/studio/templates?q=Un%20momento'))).data.length,1)
    assert.equal((await api('/studio/templates',null,1)).status,403)
    const created=await data(await api('/studio/templates/quiet/designs',{})),id=created.id,root=`/studio/designs/${id}`
    const beforeFiles=(await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count
    for(const provider of ['iconify','openverse']) {
      const results=await data(await api(`/studio/catalog/${provider}/search?q=star`));assert.equal(results.data.length,1)
      assert.equal((await api(`/studio/catalog/${provider}/search?q=star`,null,1)).status,403)
    }
    assert.equal((await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count,beforeFiles)
    assert.equal((await api('/studio/catalog/iconify/search?q=rate-limit')).status,429)
    assert.equal((await api('/studio/catalog/iconify/search?q=malformed')).status,502)
    assert.equal((await api('/studio/catalog/openverse/00000000-0000-4000-8000-000000000099')).status,404)
    const iconPath='/studio/catalog/iconify/tabler%3Astar/import'
    assert.equal((await api(iconPath,{designId:id},3,other.id)).status,404)
    await data(await api(`${root}/collaborators`,{userId:peer.id,role:'VIEWER'},0,company.id,'PUT'))
    assert.equal((await api(iconPath,{designId:id},2)).status,404)
    record('paginated authenticated templates and catalogs; search creates no Files; tenant, denied user, viewer, 429, malformed and retired-resource negatives')

    const{page,context}=await login(owner),errors=[];page.on('pageerror',error=>errors.push(error.message))
    const requests=[];page.on('request',request=>requests.push(request.url()))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/`)
    await openTemplates(page)
    await page.getByLabel('Buscar plantillas',{exact:true}).fill('Un momento')
    await page.getByRole('button',{name:'Ver plantilla Un momento para ti',exact:true}).click()
    await page.screenshot({path:join(stack.directory,'creative-template-preview.png'),fullPage:true})
    await useTemplate(page);await page.waitForURL(url=>url.searchParams.has('design'))
    const uiId=new URL(page.url()).searchParams.get('design'),uiRoot=`/studio/designs/${uiId}`,get=async()=>data(await api(uiRoot))
    metrics.heapBefore=await page.evaluate(()=>performance.memory?performance.memory.usedJSHeapSize:null)
    await page.getByRole('button',{name:'Imágenes',exact:true}).click()
    await page.getByRole('radio',{name:'Iconos',exact:true}).click()
    await page.getByLabel('Buscar iconos',{exact:true}).fill('star')
    await page.getByRole('button',{name:'Ver recurso star',exact:true}).click()
    await page.getByRole('button',{name:'Insertar recurso',exact:true}).click()
    await page.getByRole('radio',{name:'#d946ef',exact:true}).first().click()
    await page.getByLabel('Ancho',{exact:true}).fill('240');await page.getByLabel('Rotación',{exact:true}).fill('20');await save(page)
    let current=await get(),icon=current.document.objects.find(o=>o.type==='vector')
    assert.equal(icon.fill,'#d946ef');assert.equal(icon.width,240);assert.equal(icon.rotation,20);assert.ok(icon.geometry.paths.length)
    await page.getByRole('button',{name:'Deshacer (Ctrl+Z)',exact:true}).click();await page.getByRole('button',{name:'Rehacer (Ctrl+Y)',exact:true}).click();await save(page)
    record('template search/preview creates independent editable copy; Iconify insertion, recolor, size, rotation and undo/redo persist')
    await page.getByRole('radio',{name:'Fotos',exact:true}).click();await page.getByLabel('Buscar fotografías',{exact:true}).fill('synthetic')
    await page.getByRole('button',{name:'Ver recurso Fotografía sintética violeta',exact:true}).click()
    await page.getByRole('button',{name:'Insertar recurso',exact:true}).click();await save(page)
    current=await get();const photo=current.document.objects.find(o=>o.type==='image')
    assert.ok(photo);assert.ok(!JSON.stringify(current.document).includes('https://'))
    const[file]=(await stack.pool.query('SELECT bucket,object_key,metadata,access_scope,visibility FROM file_asset WHERE id=$1',[photo.fileAssetId])).rows
    assert.equal(file.metadata.studioSource.license,'CC-BY-4.0');assert.equal(file.access_scope,'RESTRICTED');assert.equal(file.visibility,'PRIVATE')
    const original=await admin.storage.from(file.bucket).download(file.object_key);assert.equal(original.error,null)
    const originalBytes=Buffer.from(await original.data.arrayBuffer());assert.equal(createHash('sha256').update(originalBytes).digest('hex'),file.metadata.studioSha256)
    assert.equal((await sharp(originalBytes).metadata()).width,320)
    const repeated=await data(await api('/studio/catalog/openverse/00000000-0000-4000-8000-000000000010/import',{designId:uiId}));assert.equal(repeated.file.id,photo.fileAssetId)
    const credits=await data(await api(`${uiRoot}/credits`,{document:current.document}));assert.ok(credits.some(r=>r.author==='Estudio de pruebas'));assert.ok(credits.some(r=>r.license==='MIT'))
    record('Openverse photo imports original bytes to real private Storage/Files; SHA256 dedup, source/license/author credits retained; no persistent hotlinks')

    await page.getByRole('button',{name:'Capas',exact:true}).click();await page.getByRole('button',{name:'Respira.',exact:true}).click()
    await choose(page,'Tipografía',/^Pacifico/);await page.getByRole('combobox',{name:'Tipografía',exact:true}).filter({hasText:'Pacifico'}).waitFor();await save(page)
    current=await get();assert.equal(current.document.objects.find(o=>o.text?.startsWith('Respira.')).fontFamily,'Pacifico')
    assert.equal(await page.evaluate(()=>document.fonts.check('32px Pacifico')),true)
    const png=await exportAs(page,'png','creative-pacifico.png'),jpg=await exportAs(page,'jpg','creative-pacifico.jpg')
    assert.equal((await sharp(png).metadata()).width,1080);assert.equal((await sharp(jpg).metadata()).height,1080)
    const pngBefore=await sharp(png).raw().toBuffer()
    await page.reload();await page.getByRole('button',{name:'Capas',exact:true}).click();await page.getByRole('button',{name:'Respira.',exact:true}).click()
    assert.equal(await page.evaluate(()=>document.fonts.check('32px Pacifico')),true)
    const reopen=await exportAs(page,'png','creative-reopened.png');assert.deepEqual(await sharp(reopen).raw().toBuffer(),pngBefore)
    await page.getByRole('button',{name:'Respira.',exact:true}).click()
    await choose(page,'Tipografía',/^Space Mono/);await page.getByRole('combobox',{name:'Tipografía',exact:true}).filter({hasText:'Space Mono'}).waitFor();await save(page)
    const mono=await exportAs(page,'png','creative-space-mono.png');assert.notDeepEqual(await sharp(mono).raw().toBuffer(),pngBefore)
    assert.ok(requests.some(url=>url.includes('studio-fonts/pacifico.ttf')));assert.ok(requests.some(url=>url.includes('studio-fonts/spacemono.ttf')))
    metrics.fontDownloads=requests.filter(url=>/studio-fonts\/.*\.ttf/.test(url)).length
    metrics.heap=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null)
    metrics.pngBytes=(await readFile(png)).length;metrics.jpgBytes=(await readFile(jpg)).length
    await page.screenshot({path:join(stack.directory,'creative-editor-desktop.png'),fullPage:true})
    record('bundled font selection and persisted family; real PNG/JPG; reopened Pacifico PNG pixel-identical; Space Mono changes pixels; fonts load only on demand')

    const start=requests.length;await page.reload();await page.getByRole('button',{name:'Guardar',exact:true}).waitFor();await page.getByRole('button',{name:'Imágenes',exact:true}).click();await page.getByRole('radio',{name:'Iconos',exact:true}).click()
    await page.getByLabel('Buscar iconos',{exact:true}).fill('offline');await page.getByText('Catálogo no disponible',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Elementos',exact:true}).click();await page.getByRole('button',{name:'Rectángulo',exact:true}).click();await save(page)
    assert.ok((await get()).document.objects.some(o=>o.type==='rectangle'&&o.fill==='#d946ef'))
    assert.ok(!requests.slice(start).some(url=>/^https:\/\/(api.iconify.design|api.openverse.org)/.test(url)))
    for(const version of [1,2]){const legacy=await data(await api('/studio/designs',{name:`Compatibilidad v${version}`,document:{...blankDocument(),schemaVersion:version}}));assert.equal(legacy.document.schemaVersion,5)}
    await data(await api(`${uiRoot}/collaborators`,{userId:peer.id,role:'VIEWER'},0,company.id,'PUT'))
    const peerView=await data(await api(uiRoot,null,2));assert.equal(peerView.canEdit,false)
    assert.equal((await api(`${uiRoot}/assets/${photo.fileAssetId}/signed-url`,null,2)).status,200)
    await data(await api(`${uiRoot}/collaborators`,{userId:peer.id,role:null},0,company.id,'PUT'))
    assert.equal((await api(uiRoot,null,2)).status,404);assert.equal((await api(`${uiRoot}/assets/${photo.fileAssetId}/signed-url`,null,2)).status,404)
    record('provider outage leaves editing/saving intact; saved designs need no catalogs; v1/v2 compatibility; private-image sharing and revocation')
    await page.setViewportSize({width:390,height:844});await page.reload();await page.getByRole('button',{name:'Imágenes',exact:true}).click();await page.getByRole('radio',{name:'Fotos',exact:true}).click()
    assert.equal(await page.getByRole('radio',{name:'Fotos',exact:true}).getAttribute('aria-checked'),'true')
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.screenshot({path:join(stack.directory,'creative-editor-mobile.png'),fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
    assert.deepEqual(errors,[])
    record('mobile resource sheet, desktop layout and no browser runtime errors')
    return{passed:true,checks,metrics,interceptors:0,providers:'deterministic local Docker simulators; real Supabase Auth/Storage/Files'}
  }catch(error){for(const context of contexts)for(const page of context.pages())await page.screenshot({path:join(stack.directory,'creative-failure.png'),fullPage:true}).catch(()=>{});throw error}
  finally{await browser.close()}
}
