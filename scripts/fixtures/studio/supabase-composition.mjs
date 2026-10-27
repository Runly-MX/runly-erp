import {waitForSynced} from './editor-controls.mjs'
import {openPanel,layer,selectLayer,insertText,insertShape,showFiles,createBlank,exportImage,shareDialog,properties} from './editor-controls.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { chromium } from 'playwright'
const sharp = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('sharp')

export async function verifyStudioComposition(stack, { users, companies }) {
  const [owner,,peer] = users, [a] = companies, checks = [], metrics = []
  const record = message => { checks.push(message); console.log(`Studio MVP: ${message}`) }
  const login = async user => (await (await fetch(`${stack.urls.api}/auth/login`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password}) })).json()).data.access_token
  const token=await login(owner), peerToken=await login(peer)
  const api=(path,body,method=body?'POST':'GET',actor=token)=>fetch(`${stack.urls.api}${path}`, {method,headers:{'X-Runly-Studio-Protocol':'3',Authorization:`Bearer ${actor}`,'X-Runly-Company-Id':a.id,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const browser=await chromium.launch({channel:'chrome',headless:true})
  const contexts=[]
  async function ui(user) {
    const context=await browser.newContext({viewport:{width:1600,height:1200}}),page=await context.newPage();contexts.push(context)
    await page.goto(`${stack.urls.web}/app/login`);await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'))
    return page
  }
  async function choose(page,label,option) {
    await page.getByLabel(label,{exact:true}).click()
    await page.getByRole('option',{name:option,exact:true}).click()
  }
  async function save(page) {await waitForSynced(page)}
  async function size(page,width,height,background,scale=false) {
    await openPanel(page,'Página')
    await page.getByRole('textbox',{name:'Ancho (px)',exact:true}).fill(String(width));await page.getByRole('textbox',{name:'Alto (px)',exact:true}).fill(String(height))
    await page.getByLabel('Color hexadecimal',{exact:true}).fill(background);await page.getByLabel('Color hexadecimal',{exact:true}).press('Enter')
    if(scale)await page.getByText('Escalar contenido proporcionalmente',{exact:true}).click()
    await page.getByRole('button',{name:'Aplicar cambios',exact:true}).click()
  }
  try {
    const page=await ui(owner)
    await page.goto(`${stack.urls.web}/app/home`)
    await page.getByText('Studio',{exact:true}).first().waitFor()
    assert.ok(await page.locator('.lucide-pen-tool').count()>0)
    assert.equal(await page.getByText('Runly Studio',{exact:true}).count(),0)
    await page.screenshot({path:join(stack.directory,'studio-branding-dashboard.png'),fullPage:true})
    await page.getByRole('button',{name:'Cambiar a modo oscuro',exact:true}).click()
    await page.screenshot({path:join(stack.directory,'studio-branding-dark.png'),fullPage:true})
    await page.getByRole('button',{name:'Cambiar a modo claro',exact:true}).click()
    const pwa=await(await fetch(`${stack.urls.api}/pwa/manifest/runly.studio.webmanifest`)).json()
    assert.equal(pwa.short_name,'Studio');assert.equal(pwa.name,'Studio — Runly');assert.equal(pwa.theme_color,'#D946EF')
    const icon=await fetch(`${stack.urls.api}${pwa.icons[0].src}`);assert.equal(icon.status,200)
    assert.equal((await sharp(Buffer.from(await icon.arrayBuffer())).metadata()).width,192)
    await page.goto(`${stack.urls.web}/app/m/runly.studio/`)
    await page.getByText('Studio',{exact:true}).first().waitFor()
    assert.equal(await page.getByText('Runly Studio',{exact:true}).count(),0)
    assert.ok(await page.locator('.lucide-pen-tool').count()>0)
    await page.getByRole('button',{name:/^Tamaño personalizado/}).click()
    await page.getByRole('button',{name:/^Historia o reel/}).click()
    assert.equal(await page.getByRole('textbox',{name:'Alto (px)',exact:true}).inputValue(),'1920')
    await page.getByRole('textbox',{name:'Ancho (px)',exact:true}).fill('800');await page.getByRole('textbox',{name:'Alto (px)',exact:true}).fill('600');await page.getByLabel('Color hexadecimal',{exact:true}).fill('#f97316');await page.getByLabel('Color hexadecimal',{exact:true}).press('Enter')
    await page.getByRole('button',{name:'Crear con este tamaño',exact:true}).click()
    await insertShape(page,'Rectángulo')
    await page.getByLabel('Posición X',{exact:true}).fill('100');await page.getByLabel('Posición Y',{exact:true}).fill('100')
    await page.getByLabel('Ancho',{exact:true}).fill('100');await page.getByLabel('Alto',{exact:true}).fill('80')
    await insertText(page);await page.getByLabel('Texto del elemento',{exact:true}).fill('Composición MVP')
    await page.getByLabel('Posición X',{exact:true}).fill('350');await page.getByLabel('Posición Y',{exact:true}).fill('200')
    const bytes=await sharp({create:{width:120,height:80,channels:4,background:'#f59e0b'}}).png().toBuffer()
    await showFiles(page); await page.locator('input[type=file]').setInputFiles({name:'composition.png',mimeType:'image/png',buffer:bytes})
    await selectLayer(page,3)
    await page.getByLabel('Nombre del diseño').fill('Composición sintética MVP');await save(page)
    const id=new URL(page.url()).searchParams.get('design'),root=`/studio/designs/${id}`
    const get=async()=> (await(await api(root)).json()).data
    const first=await get();assert.equal(first.document.page.width,800);assert.equal(first.document.page.height,600)
    await size(page,1200,900,'#84cc16');await save(page)
    assert.deepEqual((await get()).document.objects,first.document.objects)
    await page.getByRole('button',{name:'Deshacer (Ctrl+Z)',exact:true}).click();await page.getByText('800 × 600 px',{exact:true}).first().waitFor()
    await page.getByRole('button',{name:'Rehacer (Ctrl+Y)',exact:true}).click();await page.getByText('1200 × 900 px',{exact:true}).first().waitFor()
    await size(page,600,450,'#84cc16',true);await save(page)
    const scaled=await get();assert.equal(scaled.document.objects[0].x,50);assert.equal(scaled.document.objects[0].width,50)
    for (const dimensions of [{width:0},{height:4097},{width:128.5}]) {
      const response=await api(root,{name:scaled.name,revision:scaled.revision,document:{...scaled.document,page:{...scaled.document.page,...dimensions}}},'PUT')
      assert.equal(response.status,400);assert.equal((await get()).revision,scaled.revision)
    }
    record('custom creation/preset, invalid dimensions rejected atomically; page/background resize preserves objects, explicit proportional scaling, undo/redo')
    await selectLayer(page,1)
    await page.getByRole('list',{name:'Capas del diseño'}).locator('li:nth-last-child(2)').getByRole('checkbox').check();await page.getByRole('list',{name:'Capas del diseño'}).locator('li:nth-last-child(3)').getByRole('checkbox').check()
    await page.getByRole('radio',{name:'Entre sí',exact:true}).click()
    await page.getByRole('button',{name:'Alinear a la izquierda',exact:true}).click();await page.getByRole('button',{name:'Distribuir verticalmente',exact:true}).click();await save(page)
    const aligned=await get();assert.notDeepEqual(aligned.document.objects,scaled.document.objects)
    await page.reload();await selectLayer(page,1)
    assert.equal(Number(await page.getByLabel('Posición X',{exact:true}).inputValue()),Math.round(aligned.document.objects[0].x*100)/100)
    record('multi-selection alignment/distribution from UI; canonical positions survive save and reopen')
    const beforeNavigation=await get()
    await page.getByRole('button',{name:'Ajustar a la pantalla',exact:true}).click()
    await page.getByRole('button',{name:/^Zoom \d+ %$/}).click();await page.getByRole('menuitem',{name:/^200 %/}).click()
    const viewport=page.getByLabel('Lienzo',{exact:true}),box=await viewport.boundingBox()
    const scroll=await viewport.evaluate(node=>node.scrollLeft)
    await page.getByRole('button',{name:/^Mover la vista/}).click()
    await page.mouse.move(box.x+150,box.y+80);await page.mouse.down();await page.mouse.move(box.x+70,box.y+80,{steps:8});await page.mouse.up()
    assert.ok(await viewport.evaluate(node=>node.scrollLeft)>scroll+30)
    await page.getByRole('button',{name:/^Mover la vista/}).click()
    await page.getByRole('application').focus();await page.keyboard.down('Space')
    const secondScroll=await viewport.evaluate(node=>node.scrollLeft)
    await page.mouse.move(box.x+140,box.y+90);await page.mouse.down();await page.mouse.move(box.x+80,box.y+90,{steps:6});await page.mouse.up();await page.keyboard.up('Space')
    assert.ok(await viewport.evaluate(node=>node.scrollLeft)>secondScroll+20)
    await page.mouse.move(box.x+200,box.y+120);await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control')
    await page.waitForTimeout(200);assert.ok(Number((await page.getByRole('button',{name:/^Zoom \d+ %$/}).getAttribute('aria-label')).match(/\d+/)[0])>200)
    await page.getByRole('button',{name:/^Zoom \d+ %$/}).click();await page.getByRole('menuitem',{name:/^100 %/}).click()
    await page.getByRole('button',{name:'Zoom 100 %',exact:true}).waitFor()
    await page.getByRole('button',{name:'Ajustar a la pantalla',exact:true}).click();await page.setViewportSize({width:1400,height:950});await page.waitForTimeout(200)
    await page.getByRole('status').filter({hasText:/^Guardado/}).waitFor()
    assert.deepEqual((await get()).document,beforeNavigation.document)
    record('fit/center, preset and wheel zoom, Hand/Space pan, 100%, viewport resize without dirtying JSON/history')
    for (const [format,quality] of [['png',null],['jpg','70 %'],['jpg','100 %']]) {
      const started=Date.now(),download=page.waitForEvent('download')
      await exportImage(page,format.toUpperCase(),quality??'100 %')
      const file=join(stack.directory,`composition-${format}-${quality??'lossless'}.${format}`)
      await(await download).saveAs(file)
      const metadata=await sharp(file).metadata(),pixel=await sharp(file).extract({left:590,top:440,width:1,height:1}).raw().toBuffer()
      const image=aligned.document.objects.find(object=>object.type==='image')
      const imagePixel=await sharp(file).extract({left:Math.floor(image.x+image.width/2),top:Math.floor(image.y+image.height/2),width:1,height:1}).raw().toBuffer()
      assert.equal(metadata.format,format==='jpg'?'jpeg':'png');assert.equal(metadata.width,600);assert.equal(metadata.height,450)
      assert.ok(Math.abs(pixel[0]-132)<8 && Math.abs(pixel[1]-204)<8 && Math.abs(pixel[2]-22)<8)
      assert.ok(Math.abs(imagePixel[0]-245)<15 && Math.abs(imagePixel[1]-158)<15 && Math.abs(imagePixel[2]-11)<15)
      metrics.push({format,quality,width:metadata.width,height:metadata.height,bytes:(await stat(file)).size,elapsedMs:Date.now()-started,pixel:[...pixel],imagePixel:[...imagePixel]})
    }
    record('PNG and genuine JPEG (70/100 quality), exact dimensions, opaque background pixel samples, original image validation')
    await page.screenshot({path:join(stack.directory,'composition-editor.png'),fullPage:true})
    // Real private revisions for page changes; viewers can navigate/export but cannot resize.
    assert.equal((await api(`${root}/collaborators`,{userId:peer.id,role:'VIEWER'},'PUT')).status,200)
    const B=await ui(peer)
    const frames=[];B.on('websocket',socket=>socket.on('framereceived',event=>{if(String(event.payload).includes('changed'))frames.push(String(event.payload))}))
    await B.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await B.getByText('Solo lectura',{exact:true}).waitFor()
    assert.equal(await B.getByRole('button',{name:'Tamaño y fondo',exact:true}).isDisabled(),true)
    await size(page,640,480,'#84cc16');await save(page)
    await B.getByText('640 × 480 px',{exact:true}).first().waitFor()
    assert.ok(frames.length>0,'No confirmed resize event arrived through the real WebSocket')
    await B.getByRole('button',{name:/^Zoom \d+ %$/}).click();await B.getByRole('menuitem',{name:/^100 %/}).click();await B.getByRole('button',{name:'Zoom 100 %',exact:true}).waitFor()
    const viewerDownload=B.waitForEvent('download');await exportImage(B)
    const viewerFile=join(stack.directory,'composition-viewer.png');await(await viewerDownload).saveAs(viewerFile)
    assert.equal((await sharp(viewerFile).metadata()).width,640)
    assert.equal((await api(root,{name:aligned.name,document:aligned.document,revision:(await get()).revision},'PUT',peerToken)).status,404)
    record('saved resize propagates to real Auth viewer; read-only mutation remains denied')
    await insertText(page)
    await page.getByLabel('Posición X',{exact:true}).fill('300');await page.getByLabel('Posición Y',{exact:true}).fill('300')
    const textCanvas=await page.locator('canvas.upper-canvas').boundingBox(),textScale=textCanvas.width/640
    await page.mouse.dblclick(textCanvas.x+310*textScale,textCanvas.y+310*textScale)
    await page.keyboard.press('End');await page.keyboard.type(' con espacio');await page.keyboard.press('Escape');await save(page)
    assert.ok((await get()).document.objects.some(object=>object.type==='text' && object.text.includes('con espacio')))
    // Dirty shell navigation / explicit back / native history / company switch all ask before changing context.
    // Reopen via the SPA so Back targets a same-document entry; a pre-reload
    // entry uses the browser's beforeunload dialog instead of a popstate event.
    await page.getByRole('button',{name:'Volver a mis diseños',exact:true}).click()
    await page.getByRole('button',{name:/^Abrir Composición sintética MVP/}).click()
    await page.getByText('640 × 480 px',{exact:true}).first().waitFor()
    let releasePending
    const holdChanges=async()=>{const pending=new Promise(resolve=>{releasePending=resolve});await page.route('**/studio/designs/*/changes',async route=>{if(route.request().method()==='POST')await pending;await route.continue().catch(()=>{})})}
    await holdChanges()
    await page.getByLabel('Nombre del diseño').fill('Borrador protegido MVP')
    await page.getByRole('button',{name:'Volver a mis diseños',exact:true}).click();await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).waitFor()
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('design'),id)
    await page.keyboard.press('Control+.');await page.getByPlaceholder('Buscar aplicación...').fill('Archivos')
    await page.getByText('Archivos',{exact:true}).click()
    await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click()
    assert.equal(new URL(page.url()).searchParams.get('design'),id)
    await page.evaluate(()=>history.back());await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).waitFor()
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('design'),id)
    await page.locator('button[title="Studio Test A"]').click();await page.getByRole('menuitem').filter({hasText:'Studio Test B'}).click()
    await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click()
    assert.ok(await page.locator('button[title="Studio Test A"]').count())
    const unload=page.waitForEvent('dialog');const reload=page.reload().catch(()=>{})
    const dialog=await unload;assert.equal(dialog.type(),'beforeunload');await dialog.dismiss();await reload
    await page.getByText('640 × 480 px',{exact:true}).first().waitFor()
    assert.equal(await page.getByLabel('Nombre del diseño').inputValue(),'Borrador protegido MVP')
    assert.equal(await page.getByRole('button',{name:'Guardar',exact:true}).count(),0)
    releasePending();await page.unroute('**/studio/designs/*/changes');await save(page)
    await holdChanges()
    // Fault injection is limited to the browser draft store. Auth and Supabase
    // Storage/network remain real and untouched.
    await page.evaluate(()=>{
      window.studioOriginalSetItem=Storage.prototype.setItem
      Storage.prototype.setItem=function(key,value){if(String(key).startsWith('runly:studio:draft:'))throw new DOMException('Synthetic quota','QuotaExceededError');return window.studioOriginalSetItem.call(this,key,value)}
    })
    await page.getByLabel('Nombre del diseño').fill('Borrador con cuota agotada')
    await page.getByRole('button',{name:'Volver a mis diseños',exact:true}).click()
    await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).getByText(/No se pudo conservar la copia local/).waitFor()
    await page.getByRole('button',{name:'Cancelar',exact:true}).click()
    const concurrent=await get()
    assert.equal((await api(root,{name:'Versión concurrente sintética',document:concurrent.document,revision:concurrent.revision},'PUT')).status,200)
    assert.equal(await page.getByLabel('Nombre del diseño').inputValue(),'Borrador con cuota agotada')
    await page.evaluate(()=>{Storage.prototype.setItem=window.studioOriginalSetItem;delete window.studioOriginalSetItem})
    releasePending();await page.unroute('**/studio/designs/*/changes');await save(page)
    assert.equal((await get()).name,'Borrador con cuota agotada')
    await holdChanges()
    await page.getByLabel('Nombre del diseño').fill('Copia local al cambiar empresa')
    await page.locator('button[title="Studio Test A"]').click();await page.getByRole('menuitem').filter({hasText:'Studio Test B'}).click()
    await page.getByRole('dialog',{name:'Salir antes de sincronizar',exact:true}).waitFor();await page.getByRole('button',{name:'Salir',exact:true}).click()
    await page.locator('button[title="Studio Test B"]').waitFor()
    assert.ok((await page.evaluate(()=>Object.values(localStorage))).some(value=>value.includes('Copia local al cambiar empresa')))
    releasePending();await page.unroute('**/studio/designs/*/changes')
    record('dirty Back, shell module change, native history, beforeunload and company switch cancel safely; quota failure warns and prevents losing a conflicting draft; confirmed company change retains scoped draft')
    return {passed:true,checks,metrics,interceptors:0}
  }catch(error){let index=0;for(const context of contexts)for(const page of context.pages())await page.screenshot({path:join(stack.directory,`composition-failure-${index++}.png`),fullPage:true}).catch(()=>{});throw error}
  finally{await browser.close()}
}
