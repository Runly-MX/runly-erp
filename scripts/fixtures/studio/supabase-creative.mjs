import {waitForSynced} from './editor-controls.mjs'
import assert from 'node:assert/strict'
import {createRequire}from'node:module'
import {join}from'node:path'
import {readFile}from'node:fs/promises'
import {createHash}from'node:crypto'
import {chromium}from'playwright'
import {blankDocument}from'../../../apps/shared/studio/document.js'
import {openTemplates,useTemplate,exportImage}from'./editor-controls.mjs'
const sharp=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('sharp')

export async function verifyStudioCreative(stack,{users,companies,admin}) {
  const[owner,denied,peer,foreign]=users,[company,other]=companies,checks=[],metrics={}
  const tokens=await Promise.all(users.map(async user=>{const r=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})});assert.equal(r.status,200);return(await r.json()).data.access_token}))
  const api=(path,body,index=0,companyId=company.id,method=body?'POST':'GET')=>fetch(`${stack.urls.api}${path}`,{method,headers:{'X-Runly-Studio-Protocol':'3',Authorization:`Bearer ${tokens[index]}`,'X-Runly-Company-Id':companyId,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const data=async response=>{assert.ok(response.ok,`${response.status}: ${await response.clone().text()}`);return(await response.json()).data}
  const record=message=>{checks.push(message);console.log(`Studio creative: ${message}`)}
  const browser=await chromium.launch({channel:'chrome',headless:true}),contexts=[]
  async function login(user) {
    const context=await browser.newContext({viewport:{width:1600,height:1100}});contexts.push(context);const page=await context.newPage()
    await page.goto(`${stack.urls.web}/app/login`);await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'));return{page,context}
  }
  async function save(page){await waitForSynced(page)}
  async function choose(page,label,option){await page.getByLabel(label,{exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()}
  async function exportAs(page,format,name) {
    const download=page.waitForEvent('download');await exportImage(page,format.toUpperCase())
    const path=join(stack.directory,name);await(await download).saveAs(path);return path
  }
  try {
    const templates=await data(await api('/studio/templates'));assert.equal(templates.pagination.pageSize,12);assert.ok(templates.pagination.total>=16)
    assert.equal((await data(await api('/studio/templates?q=Un%20momento'))).data.length,1)
    assert.equal((await api('/studio/templates',null,1)).status,403)
    const created=await data(await api('/studio/templates/quiet/designs',{})),id=created.id,root=`/studio/designs/${id}`
    const beforeFiles=(await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count
    for(const provider of ['iconify','openverse']) {
      const results=await data(await api(`/studio/catalog/${provider}/search?q=star&source=iconify`));assert.equal(results.data.length,1)
      assert.equal((await api(`/studio/catalog/${provider}/search?q=star&source=iconify`,null,1)).status,403)
    }
    assert.equal((await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count,beforeFiles)
    assert.equal((await api('/studio/catalog/iconify/search?q=rate-limit&source=iconify')).status,429)
    assert.equal((await api('/studio/catalog/iconify/search?q=malformed&source=iconify')).status,502)
    assert.equal((await api('/studio/catalog/openverse/00000000-0000-4000-8000-000000000099')).status,404)
    const iconPath='/studio/catalog/iconify/tabler%3Astar/import'
    assert.equal((await api(iconPath,{designId:id},3,other.id)).status,404)
    await data(await api(`${root}/collaborators`,{userId:peer.id,role:'VIEWER'},0,company.id,'PUT'))
    assert.equal((await api(iconPath,{designId:id},2)).status,404)
    assert.equal((await api('/studio/catalog/packs/open-doodles%3Adoggie/import',{designId:id},2)).status,404)
    assert.equal((await api('/studio/catalog/wikimedia/77/import',{designId:id},2)).status,404)
    for(const [provider,query] of [['wikimedia','arbol'],['packs','perro']]){
      assert.equal((await api(`/studio/catalog/${provider}/search?q=${query}`,null,1)).status,403)
      assert.equal((await api(`/studio/catalog/${provider}/search?q=${query}`)).status,200)
    }
    assert.equal((await api('/studio/catalog/status',null,1)).status,403)
    assert.equal((await api('/studio/catalog/packs/open-doodles%3Adoggie/import',{designId:id},3,other.id)).status,404)
    assert.equal((await api('/studio/catalog/wikimedia/77/import',{designId:id},3,other.id)).status,404)
    const statuses=Object.fromEntries((await data(await api('/studio/catalog/status'))).map(row=>[row.id,row.state]))
    assert.deepEqual(statuses,{iconify:'available',openverse:'available',wikimedia:'available',pixabay:'disabled',packs:'available'})
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
    // Inserts sync asynchronously: poll the saved document (10 s at most) instead of reading it once.
    const until=async(read,message)=>{let last;for(let i=0;i<40;i++){last=await read();if(last)return last;await page.waitForTimeout(250)}throw Error(message)}
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
    current=await until(async()=>{const saved=await get();return saved.document.objects.some(o=>o.type==='image')&&saved},'Photo not saved');const photo=current.document.objects.find(o=>o.type==='image')
    assert.ok(photo);assert.ok(!JSON.stringify(current.document).includes('https://'))
    const[file]=(await stack.pool.query('SELECT bucket,object_key,metadata,access_scope,visibility FROM file_asset WHERE id=$1',[photo.fileAssetId])).rows
    assert.equal(file.metadata.studioSource.license,'CC-BY-4.0');assert.equal(file.access_scope,'RESTRICTED');assert.equal(file.visibility,'PRIVATE')
    const original=await admin.storage.from(file.bucket).download(file.object_key);assert.equal(original.error,null)
    const originalBytes=Buffer.from(await original.data.arrayBuffer());assert.equal(createHash('sha256').update(originalBytes).digest('hex'),file.metadata.studioSha256)
    assert.equal((await sharp(originalBytes).metadata()).width,320)
    const repeated=await data(await api('/studio/catalog/openverse/00000000-0000-4000-8000-000000000010/import',{designId:uiId}));assert.equal(repeated.file.id,photo.fileAssetId)
    const credits=await data(await api(`${uiRoot}/credits`,{document:current.document}));assert.ok(credits.some(r=>r.author==='Estudio de pruebas'));assert.ok(credits.some(r=>r.license==='MIT'))
    record('Openverse photo imports original bytes to real private Storage/Files; SHA256 dedup, source/license/author credits retained; no persistent hotlinks')

    // Resource libraries: Spanish search over the local Tabler/Lucide library, CC0 packs and Wikimedia.
    const insertPreview=async title=>{await page.getByRole('button',{name:`Ver recurso ${title}`,exact:true}).click();await page.getByRole('button',{name:'Insertar recurso',exact:true}).click();await save(page)}
    const iconRequests=requests.length
    await page.getByRole('radio',{name:'Iconos',exact:true}).click()
    await page.getByLabel('Buscar iconos',{exact:true}).fill('estrella');await insertPreview('star-filled')
    await choose(page,'Colección','Lucide · ISC / MIT');await page.getByLabel('Buscar iconos',{exact:true}).fill('casa');await insertPreview('house')
    assert.ok(!requests.slice(iconRequests).some(url=>/api\.iconify\.design|simplesvg|unisvg/.test(url)))
    current=await until(async()=>{const saved=await get();return['tabler:star','tabler:star-filled','lucide:house'].every(iconId=>saved.document.objects.some(o=>o.iconId===iconId))&&saved},'Icons not saved: '+JSON.stringify((await get()).document.objects.filter(o=>o.type==='vector').map(o=>o.iconId)))
    assert.ok(current.document.objects.filter(o=>o.type==='vector').every(o=>o.geometry.paths.length>0&&!JSON.stringify(o).includes('<')))
    record('Spanish icon search (estrella, casa) finds local Tabler/Lucide icons; filled and Lucide insert as editable geometry with no Iconify request')
    await page.getByRole('radio',{name:'Ilustraciones',exact:true}).click()
    await page.getByLabel('Buscar ilustraciones',{exact:true}).fill('perro');await insertPreview('Doggie')
    await page.getByLabel('Buscar ilustraciones',{exact:true}).fill('peep 12');await insertPreview('Personaje 12')
    const packQuery="SELECT bucket,object_key,metadata,access_scope,visibility FROM file_asset WHERE metadata->'studioSource'->>'provider'='packs' ORDER BY metadata->'studioSource'->>'id'"
    const packRows=await until(async()=>{const rows=(await stack.pool.query(packQuery)).rows;return rows.length===2&&rows},'Pack files not stored')
    assert.deepEqual(packRows.map(row=>row.metadata.studioSource.id),['open-doodles:doggie','open-peeps:peep-12'])
    for(const row of packRows){
      assert.equal(row.metadata.studioSource.license,'CC0-1.0');assert.equal(row.metadata.studioSource.author,'Pablo Stanley');assert.equal(row.access_scope,'RESTRICTED');assert.equal(row.visibility,'PRIVATE')
      const stored=await admin.storage.from(row.bucket).download(row.object_key);assert.equal(stored.error,null)
      const bytes=Buffer.from(await stored.data.arrayBuffer());assert.equal((await sharp(bytes).metadata()).format,'png');assert.equal(createHash('sha256').update(bytes).digest('hex'),row.metadata.studioSha256)
    }
    record('Open Doodles and Open Peeps import as private PNG originals in Files with CC0 provenance and verified SHA256')
    await page.getByRole('radio',{name:'Fotos',exact:true}).click()
    await choose(page,'Fuente','Wikimedia Commons');await page.getByLabel('Buscar fotografías',{exact:true}).fill('arbol')
    await page.getByRole('button',{name:'Ver recurso Arbol CC BY',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Ver recurso Arbol SA',exact:true}).count(),0)
    await insertPreview('Arbol CC BY')
    const[wiki]=await until(async()=>{const rows=(await stack.pool.query("SELECT metadata,access_scope,visibility FROM file_asset WHERE metadata->'studioSource'->>'provider'='wikimedia'")).rows;return rows.length&&rows},'Wikimedia file not stored')
    assert.equal(wiki.metadata.studioSource.license,'CC-BY-4.0');assert.equal(wiki.metadata.studioSource.author,'Eva & Co');assert.equal(wiki.visibility,'PRIVATE')
    record('Wikimedia search hides non-permitted licenses; CC BY import keeps author and license in a private file')
    current=await until(async()=>{const saved=await get();return saved.document.objects.filter(o=>o.type==='image').length>=4&&saved},'Library images not saved')
    const libraryCredits=await data(await api(`${uiRoot}/credits`,{document:current.document}))
    for(const [author,license] of [['Pablo Stanley','CC0-1.0'],['Eva & Co','CC-BY-4.0'],['Estudio de pruebas','CC-BY-4.0']])assert.ok(libraryCredits.some(r=>r.author===author&&r.license===license),`${author} ${license}`)
    assert.ok(libraryCredits.some(r=>r.license==='ISC / MIT')&&libraryCredits.some(r=>r.license==='MIT'))
    const objectCount=current.document.objects.length
    await page.reload();await waitForSynced(page)
    assert.equal((await get()).document.objects.length,objectCount)
    const libraryPng=await exportAs(page,'png','creative-libraries.png');assert.equal((await sharp(libraryPng).metadata()).width,1080)
    record('credits list every library author and license; reopened design keeps all objects; PNG export succeeds with library assets')
    // One provider failing (503, then 504) never blocks the others.
    await page.getByRole('button',{name:'Imágenes',exact:true}).click();await page.getByRole('radio',{name:'Fotos',exact:true}).click()
    await choose(page,'Fuente','Wikimedia Commons')
    for(const word of ['offline','gateway']){await page.getByLabel('Buscar fotografías',{exact:true}).fill(word);await page.getByText('Proveedor no disponible',{exact:true}).waitFor()}
    // Each failed search is retried once upstream, so two searches reach the 3-failure threshold; poll instead of reading early.
    await until(async()=>(await data(await api('/studio/catalog/status'))).find(row=>row.id==='wikimedia').state==='unavailable','Wikimedia breaker did not open')
    await choose(page,'Fuente','Openverse');await page.getByLabel('Buscar fotografías',{exact:true}).fill('synthetic')
    await page.getByRole('button',{name:'Ver recurso Fotografía sintética violeta',exact:true}).waitFor()
    await page.getByRole('radio',{name:'Iconos',exact:true}).click();await page.getByLabel('Buscar iconos',{exact:true}).fill('flecha')
    await page.getByRole('button',{name:/^Ver recurso arrow/}).first().waitFor()
    assert.equal((await api('/studio/catalog/wikimedia/search?q=roble')).status,503) // uncached query: no upstream call
    assert.equal((await api('/studio/catalog/wikimedia/search?q=arbol')).status,200) // cached results keep being served while the provider cools down
    assert.equal((await api('/studio/catalog/packs/search?q=perro')).status,200)
    record('Wikimedia 503/504 shows a provider error and opens its breaker (503 without upstream calls) while Openverse, packs and icons keep working')

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

    const start=requests.length;await page.reload();await waitForSynced(page);await page.getByRole('button',{name:'Imágenes',exact:true}).click();await page.getByRole('radio',{name:'Fotos',exact:true}).click()
    await page.getByLabel('Buscar fotografías',{exact:true}).fill('offline');await page.getByText('Proveedor no disponible',{exact:true}).waitFor()
    await page.getByRole('button',{name:'Elementos',exact:true}).click();await page.getByRole('button',{name:'Rectángulo',exact:true}).click();await save(page)
    assert.ok((await get()).document.objects.some(o=>o.type==='rectangle'&&o.fill==='#d946ef'))
    assert.ok(!requests.slice(start).some(url=>/^https:\/\/(api.iconify.design|api.openverse.org)/.test(url)))
    for(const version of [1,2]){const legacy=await data(await api('/studio/designs',{name:`Compatibilidad v${version}`,document:{...blankDocument(),schemaVersion:version}}));assert.equal(legacy.document.schemaVersion,7)}
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
