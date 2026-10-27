import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {blankDocument,appendObject,validateDocument} from '../../../apps/shared/studio/document.js'
import {applyOps} from '../../../apps/shared/studio/operations.js'
import {documentPages,findPage} from '../../../apps/shared/studio/pages.js'
import {selectLayer} from './editor-controls.mjs'
import {commitStudioMcpUpdate} from './operations-mcp.mjs'
const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url)),sharp=require('sharp'),{PDFDocument}=require('pdf-lib'),{createClient}=require('@supabase/supabase-js')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(fn,label){for(let n=0;n<120;n++){if(await fn())return;await sleep(150)}throw Error(`timeout: ${label}`)}

export async function verifyStudioMultipage(stack,{users,companies}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const [owner,viewer,peer,foreign]=users,[company,other]=companies,checks=[],outputs=[],contexts=[],clients=[]
  await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3',[company.roleId,company.id,viewer.id])
  const tokens=await Promise.all([owner,peer,viewer,foreign].map(async user=>{
    const r=await fetch(stack.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(r.status,200);return(await r.json()).data.access_token
  }))
  const api=(path,{actor=0,data,method=data?'POST':'GET',protocol='3'}={})=>fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':actor===3?other.id:company.id,'X-Runly-Studio-Protocol':protocol,...(data&&!(data instanceof FormData)?{'Content-Type':'application/json'}:{})},body:data?(data instanceof FormData?data:JSON.stringify(data)):undefined})
  const json=async r=>{const b=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(b)}`);return b.data}
  const record=text=>{checks.push(text);console.log(`Studio v7: ${text}`)}
  const original=await sharp({create:{width:80,height:40,channels:3,background:'#f59e0b'}}).png().toBuffer(),form=new FormData()
  form.set('file',new File([original],'synthetic-multipage.png',{type:'image/png'}));form.set('moduleKey','runly.files');form.set('entityType','AtlasFile')
  const file=await json(await api('/files/upload',{data:form}))
  let document=appendObject(blankDocument(320,240),'rectangle',{id:'cover-shape',x:40,y:40,width:100,height:80,fill:'#123456'})
  document=validateDocument(applyOps(document,[2,3,4,5].map(n=>({type:'duplicatePage',pageId:'page-1',newId:`p${n}`}))))
  document=validateDocument(applyOps(document,[2,3,4,5].map(n=>({type:'patchPage',pageId:`p${n}`,set:{width:n%2?320:240,height:n%2?240:320,background:['#ffffff','#ffdddd','#ddffdd','#ddddff'][n-2]}}))))
  document=validateDocument(applyOps(document,[{type:'upsert',pageId:'p3',object:{...document.objects[0],id:'private-shape',x:180,fillPaint:{type:'image',fileAssetId:file.id}}}]))
  const made=await json(await api('/studio/designs',{data:{name:'Synthetic v7 multipage',document}})),root=`/studio/designs/${made.id}`
  const fresh=()=>api(root).then(json)
  const change=(actor,clientId,batchId,ops)=>api(root+'/changes',{actor,data:{clientId,batchId,ops}}).then(json)
  await json(await api(root+'/collaborators',{method:'PUT',data:{userId:peer.id,role:'EDITOR'}}))
  await json(await api(root+'/collaborators',{method:'PUT',data:{userId:viewer.id,role:'VIEWER'}}))
  assert.equal((await json(await api(root+'/pages'))).pages.length,5)
  assert.equal((await api(root,{actor:3})).status,404)
  assert.equal((await api(root+'/changes',{data:{clientId:'old-writer-client',batchId:1,ops:[]},protocol:'2'})).status,426)
  const persisted=await fresh();assert.equal(persisted.document.schemaVersion,7)
  record('Five-page document persists/reopens; page APIs enforce membership; v6 HTTP writer gets 426')

  const browser=await chromium.launch({channel:'chrome',headless:true})
  async function open(user,id,pageId='page-1'){
    const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage();contexts.push(context)
    page.on('dialog',d=>d.accept());page.setDefaultTimeout(20000)
    await page.goto(stack.urls.web+'/app/login');await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'))
    await page.goto(stack.urls.web+`/app/m/runly.studio/?design=${id}&pageId=${pageId}`);await page.locator('.upper-canvas').waitFor()
    return {context,page}
  }
  try{
    const live=await json(await api(root+'/live',{data:{sessionId:'multipage-observer-session',peek:true}}))
    const realtime=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(realtime);await realtime.realtime.setAuth(tokens[0])
    const messages=[],channel=realtime.channel(live.topic,{config:{private:true}}).on('broadcast',{event:'change'},m=>messages.push(m.payload))
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime timeout')),15000);channel.subscribe(state=>{if(state==='SUBSCRIBED'){clearTimeout(timer);resolve()}})})
    const a=await open(owner,made.id),b=await open(peer,made.id,'p2')
    await selectLayer(a.page,1);await selectLayer(b.page,1)
    await Promise.all([[a,176],[b,212]].map(async([session,x])=>{await session.page.getByLabel('Posición X',{exact:true}).fill(String(x));await session.page.getByLabel('Posición X',{exact:true}).press('Tab')}))
    await until(async()=>{const d=(await fresh()).document;return findPage(d,'page-1').objects[0].x===176&&findPage(d,'p2').objects[0].x===212},'two actual browser pages edit independently')
    await until(()=>messages.some(m=>m.ops?.some(op=>op.pageId==='p2')),'page-scoped actual Realtime payload')
    await change(0,'multipage-owner-order',1,[{type:'pageOrder',ids:['p5','p4','p3','p2','page-1']}])
    await b.page.getByLabel('Posición X',{exact:true}).fill('218');await b.page.getByLabel('Posición X',{exact:true}).press('Tab')
    await until(async()=>findPage((await fresh()).document,'p2').objects[0].x===218,'reorder preserves destination')
    record('Two authenticated Web/Fabric sessions edit different pages; real Realtime carries page IDs; reorder preserves edits')

    // Deliberate background click clears the inspector, without a document write.
    const revision=(await fresh()).revision,area=await a.page.getByLabel('Lienzo',{exact:true}).boundingBox()
    await a.page.mouse.click(area.x+8,area.y+Math.min(120,area.height-8))
    await until(async()=>await a.page.getByLabel('Posición X',{exact:true}).count()===0,'outside paper deselect')
    await sleep(300);assert.equal((await fresh()).revision,revision)
    record('Click outside paper clears selection/inspector and causes no document mutation')

    await b.context.setOffline(true);await b.page.getByLabel('Posición X',{exact:true}).fill('333');await b.page.getByLabel('Posición X',{exact:true}).press('Tab');await sleep(400)
    await change(0,'multipage-owner-delete',1,[{type:'removePage',pageId:'p2'}]);await b.context.setOffline(false)
    await until(async()=>!findPage((await fresh()).document,'p2'),'deleted page stays removed')
    await until(()=>b.page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('runly:studio:recovery:')&&localStorage.getItem(key).includes('333'))),'offline deleted-page copy archived before reconciliation')
    await Promise.all([change(0,'multipage-owner-duplicate',1,[{type:'duplicatePage',pageId:'page-1',newId:'copy-a'}]),change(1,'multipage-peer-duplicate',1,[{type:'duplicatePage',pageId:'page-1',newId:'copy-b'}])])
    let current=await fresh();assert.ok(findPage(current.document,'copy-a')&&findPage(current.document,'copy-b'))
    const objectIds=documentPages(current.document).flatMap(p=>p.objects.map(o=>o.id));assert.equal(new Set(objectIds).size,objectIds.length)
    record('Offline work on a concurrently deleted page is archived; no resurrection; simultaneous duplicates have distinct identities')

    await commitStudioMcpUpdate(stack,{token:tokens[0],companyId:company.id,designId:made.id,revision:current.revision,ops:[{type:'patch',pageId:'p3',id:'p3-o1',set:{y:111}}]})
    assert.equal(findPage((await fresh()).document,'p3').objects[0].y,111)
    record('Actual OAuth MCP prepare/approval/commit uses incremental page-scoped action and keeps other pages')
    for(const scope of ['personal','company']){
      const template=await json(await api('/studio/templates',{data:{name:`Synthetic v7 ${scope}`,scope,designId:made.id}}))
      const clone=await json(await api(`/studio/templates/${template.id}/designs`,{data:{}}))
      assert.deepEqual(clone.document,(await fresh()).document)
      assert.ok((await api(`/studio/designs/${clone.id}/assets/${file.id}/signed-url`)).ok)
      const modified=validateDocument(applyOps(template.document,[{type:'patchPage',pageId:'p3',set:{background:'#000000'}}]))
      await json(await api(`/studio/templates/${template.id}`,{method:'PUT',data:{revision:template.revision,document:modified}}))
      assert.notEqual(findPage((await json(await api(`/studio/designs/${clone.id}`))).document,'p3').page.background,'#000000')
    }
    assert.ok((await api(root+`/assets/${file.id}/signed-url`,{actor:2})).ok)
    assert.equal((await api(root+`/assets/${file.id}/signed-url`,{actor:3})).status,404)
    record('Personal/company templates copy every page and private resource; later template changes do not mutate designs; foreign Files denied')

    // A pristine five-page document for reproducible raster/PDF inspection.
    const print=await json(await api('/studio/designs',{data:{name:'Synthetic v7 export',document}})),printing=await open(owner,print.id,'p2')
    const exportPage=printing.page
    async function prepare(type,profile='rgb'){
      await exportPage.getByRole('button',{name:'Descargar',exact:true}).click()
      const dialog=exportPage.getByRole('dialog',{name:'Descargar',exact:true})
      await dialog.getByRole('radio',{name:new RegExp(`^${type}`)}).click()
      if(type==='PDF'){
        await dialog.getByRole('radiogroup',{name:'Perfil de color',exact:true}).getByRole('radio',{name:profile==='rgb'?/RGB/:/CMYK/}).click()
        assert.match(await dialog.innerText(),/las 5 páginas/)
      }else await dialog.getByRole('radio',{name:'×1',exact:true}).click()
      await dialog.getByRole('button',{name:'Descargar',exact:true}).click()
      await exportPage.getByRole('button',{name:`Exportar ${type}`,exact:true}).click()
    }
    for(const type of ['PNG','JPG','PDF-rgb','PDF-cmyk']){
      const isPdf=type.startsWith('PDF'),pending=exportPage.waitForEvent('download',{timeout:60000})
      await prepare(isPdf?'PDF':type,type.endsWith('cmyk')?'cmyk':'rgb')
      const download=await pending,filename=`v7-${type.toLowerCase()}.${isPdf?'pdf':type.toLowerCase()}`,path=join(stack.directory,filename)
      await download.saveAs(path);const bytes=await readFile(path)
      if(isPdf){const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),5);assert.ok(pdf.getPage(0).getWidth()>pdf.getPage(0).getHeight());assert.ok(pdf.getPage(1).getWidth()<pdf.getPage(1).getHeight())}
      else {const meta=await sharp(bytes).metadata();assert.equal(meta.width,240);assert.equal(meta.height,320)}
      outputs.push({filename,bytes:bytes.length})
    }
    record('Final Web exports active-page PNG/JPG and five-page RGB/CMYK PDFs with correct order/orientation through progressive HTTP jobs')
    await json(await api(root+'/collaborators',{method:'PUT',data:{userId:peer.id,role:null}}))
    const denied=await api(root+'/changes',{actor:1,data:{clientId:'multipage-denied-client',batchId:1,ops:[{type:'patchPage',pageId:'p3',set:{background:'#000000'}}]}})
    assert.ok([403,404].includes(denied.status))
    record('Revoked editor cannot replay page operations')
    return {checks,outputs}
  }catch(error){for(const [index,context]of contexts.entries())for(const page of context.pages())await page.screenshot({path:join(stack.directory,`v7-failure-${index}.png`)}).catch(()=>{});throw error}
  finally{for(const client of clients)await client.removeAllChannels();await browser.close()}
}
