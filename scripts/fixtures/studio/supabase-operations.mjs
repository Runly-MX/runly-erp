import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {chromium} from 'playwright'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {diffOps} from '../../../apps/shared/studio/operations.js'
import {createStudioSync} from '../../../apps/desktop/src/modules/runly.studio/lib/studio-sync.js'
import {selectLayer} from './editor-controls.mjs'
import {commitStudioMcpUpdate} from './operations-mcp.mjs'
const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url)),{createClient}=require('@supabase/supabase-js'),sharp=require('sharp')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,message){for(let n=0;n<100;n++){if(await check())return;await sleep(150)}assert.fail(message)}
const edit=(doc,id,patch)=>({...doc,objects:doc.objects.map(o=>o.id===id?{...o,...patch}:o)})

// All identities, HTTP writes, Realtime RLS, Files and SQL are real and disposable.
export async function verifyStudioOperations(stack,{users,companies}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const [owner,viewer,peer,foreign]=users,[company,other]=companies,checks=[],contexts=[],clients=[],syncs=[]
  await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3',[company.roleId,company.id,viewer.id])
  const tokens=await Promise.all([owner,peer,viewer,foreign].map(async user=>{
    const r=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(r.status,200);return(await r.json()).data.access_token
  }))
  const api=(path,{actor=0,data,body,method=data?'POST':'GET',companyId=actor===3?other.id:company.id}={})=>fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':companyId,...(data?{'Content-Type':'application/json'}:{})},body:body??(data?JSON.stringify(data):undefined)})
  const json=async r=>{const b=await r.json();if(!r.ok)throw Object.assign(Error(`${r.status}: ${JSON.stringify(b)}`),{status:r.status});return b.data}
  const report=text=>{checks.push(text);console.log(`Studio operations: ${text}`)}
  let doc=appendObject(blankDocument(1080,720),'rectangle',{id:'shape-a',x:80,y:100,width:180,height:120})
  doc=appendObject(doc,'ellipse',{id:'shape-b',x:400,y:100,width:160,height:120})
  doc=appendObject(doc,'text',{id:'text-a',x:100,y:300,width:400,height:100,text:'Synthetic collaboration',fontSize:28})
  const design=await json(await api('/studio/designs',{data:{name:'Synthetic operations',document:doc}})),root=`/studio/designs/${design.id}`
  const fresh=()=>api(root).then(json)
  const changes=(actor,clientId,batchId,ops)=>api(`${root}/changes`,{actor,data:{clientId,batchId,ops}})
  const share=(actor,role)=>api(`${root}/collaborators`,{method:'PUT',data:{userId:[owner,peer,viewer,foreign][actor].id,role}}).then(json)
  await share(1,'EDITOR');await share(2,'VIEWER')
  assert.equal((await api(root,{actor:3})).status,404)
  assert.ok([403,404].includes((await changes(2,'viewer-client',1,[])).status))
  async function subscribe(actor,allowed=true){
    const live=await json(await api(`${root}/live`,{actor,data:{sessionId:`test-session-${actor}-000000000`,peek:true}}))
    const client=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(client);await client.realtime.setAuth(tokens[actor])
    const connection={messages:[],wholeMessages:[],held:[],hold:false,enabled:true,core:null}
    connection.channel=client.channel(live.topic,{config:{private:true,broadcast:{ack:true}}})
      .on('broadcast',{event:'change'},m=>{connection.messages.push(m.payload);if(connection.hold)connection.held.push(m.payload);else if(connection.enabled)connection.core?.receive(m.payload)})
      .on('broadcast',{event:'changed'},m=>{connection.wholeMessages.push(m.payload);if(connection.enabled)connection.core?.changed(m.payload.revision)})
    const state=await new Promise(resolve=>{const timeout=setTimeout(()=>resolve('TIMED_OUT'),12000);connection.channel.subscribe(s=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s)){clearTimeout(timeout);resolve(s)}})})
    assert.equal(state==='SUBSCRIBED',allowed,`Realtime actor ${actor}: ${state}`);connection.topic=live.topic
    return connection
  }
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try{
    const sockets=await Promise.all([0,1,2].map(i=>subscribe(i)))
    const deniedClient=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(deniedClient);await deniedClient.realtime.setAuth(tokens[3])
    const deniedChannel=deniedClient.channel(sockets[0].topic,{config:{private:true}})
    const deniedState=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMED_OUT'),12000);deniedChannel.subscribe(s=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(s)){clearTimeout(timer);resolve(s)}})})
    assert.notEqual(deniedState,'SUBSCRIBED')
    const forged=await sockets[2].channel.send({type:'broadcast',event:'change',payload:{revision:999,ops:[]}});assert.notEqual(forged,'ok')
    report('A owner, B editor, C viewer, D foreign: actual private channel admission, forbidden document/write/forged broadcast')

    async function open(user){
      const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage();contexts.push(context)
      await page.goto(stack.urls.web+'/app/login');await page.locator('#identifier').fill(user.email);await page.locator('#password').fill(user.password)
      await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'))
      await page.goto(stack.urls.web+`/app/m/runly.studio/?design=${design.id}`);await page.locator('.upper-canvas').waitFor();return {context,page}
    }
    const [a,b,c]=await Promise.all([owner,peer,viewer].map(open))
    await selectLayer(b.page,1);await b.page.getByLabel('Posición X',{exact:true}).fill('123');await b.page.getByLabel('Posición X',{exact:true}).press('Tab')
    await until(async()=>(await fresh()).document.objects[0].x===123,'B autosave')
    await selectLayer(a.page,1);await until(async()=>Number(await a.page.getByLabel('Posición X',{exact:true}).inputValue())===123,'A receives B')
    await until(()=>sockets[2].messages.length>0,'C receives real operations')
    await selectLayer(a.page,1);await selectLayer(b.page,2)
    await Promise.all([a.page.getByLabel('Posición X',{exact:true}).fill('170').then(()=>a.page.getByLabel('Posición X',{exact:true}).press('Tab')),b.page.getByLabel('Posición X',{exact:true}).fill('430').then(()=>b.page.getByLabel('Posición X',{exact:true}).press('Tab'))])
    await until(async()=>{const d=(await fresh()).document;return d.objects[0].x===170&&d.objects[1].x===430},'Independent browser edits survive')
    await a.page.evaluate(()=>document.activeElement.blur());await a.page.keyboard.press('Control+z')
    await until(async()=>{const d=(await fresh()).document;return d.objects[0].x===123&&d.objects[1].x===430},'Selective Ctrl+Z')
    await a.page.keyboard.press('Control+y');await until(async()=>(await fresh()).document.objects[0].x===170,'Selective Ctrl+Y')
    report('Three separate authenticated browsers: B edits, A/C receive, concurrent objects survive, Ctrl+Z/Y preserves B')

    const receiptOps=[{type:'patch',id:'shape-a',set:{fill:'#abcdef'},unset:[]}],before=(await fresh()).revision
    const replies=await Promise.all([changes(0,'duplicate-client',1,receiptOps).then(json),changes(0,'duplicate-client',1,receiptOps).then(json)])
    assert.deepEqual(replies[0],replies[1]);assert.equal((await fresh()).revision,before+1)
    assert.equal((await changes(0,'duplicate-client',1,[{type:'remove',id:'shape-a'}])).status,409)
    assert.equal((await changes(0,'duplicate-client',0,[])).status,400)
    assert.equal((await stack.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1 AND metadata->>'clientId'='duplicate-client'",[design.id])).rows[0].n,1)
    report('Concurrent identical POSTs commit once, receipt survives real SQL, reused identity with changed content rejects 409')

    async function core(actor,id,options={}){
      const initial=await json(await api(root,{actor})),connection=sockets[actor],state={shown:initial.document,offline:false,loseReply:false,requests:[]}
      state.sync=createStudioSync({document:initial.document,revision:initial.revision,name:initial.name,clientId:id,delay:0,gapTimeout:100,retry:()=>50,...options,
        editor:{apply:async document=>{state.shown=document;return document}},transport:{
          fetch:()=>api(root,{actor}).then(json),send:async batch=>{state.requests.push(structuredClone(batch));if(state.offline)throw Error('simulated disconnected transport');const result=await json(await api(`${root}/changes`,{actor,data:batch}));if(state.loseReply){state.loseReply=false;throw Error('injected lost reply after actual commit')}return result},
        }})
      connection.core=state.sync;syncs.push(state.sync);state.change=patch=>{state.shown=edit(state.sync.state().document,'shape-a',patch);state.sync.local(state.shown)};return state
    }
    const x=await core(0,'owner-core-session'),y=await core(1,'editor-core-session')
    sockets[0].enabled=false;x.loseReply=true;const lostBefore=(await fresh()).revision;x.change({x:211});const saving=x.sync.flush();await sleep(20);x.change({y:150});await saving
    assert.equal((await fresh()).revision,lostBefore+2);assert.deepEqual(x.requests[0],x.requests[1]);sockets[0].enabled=true
    report('Actual commit followed by lost HTTP reply retries unchanged batch once; edits during retry use a separate batch')
    await Promise.all([x.sync.resync(),y.sync.resync()]);x.change({fill:'#d946ef'});y.change({x:300});await Promise.all([x.sync.flush(),y.sync.flush()])
    await until(async()=>{const d=(await fresh()).document.objects[0];return d.fill==='#d946ef'&&d.x===300},'Independent properties')
    await Promise.all([x.sync.resync(),y.sync.resync()]);x.change({x:310});y.change({x:320});await x.sync.flush();await y.sync.flush();await Promise.all([x.sync.resync(),y.sync.resync()]);assert.equal(x.sync.state().document.objects[0].x,y.sync.state().document.objects[0].x)
    const textBase=(await fresh()).document
    await Promise.all([changes(0,'text-owner-session',1,diffOps(textBase,edit(textBase,'text-a',{text:'Whole text A'}))).then(json),changes(1,'text-editor-session',1,diffOps(textBase,edit(textBase,'text-a',{text:'Whole text B'}))).then(json)])
    assert.ok(['Whole text A','Whole text B'].includes((await fresh()).document.objects.find(o=>o.id==='text-a').text))
    report('Same-object independent properties merge; same property and entire text use explicit server-sequenced LWW')
    sockets[0].hold=true
    await changes(1,'ordered-message-session',1,[{type:'patch',id:'shape-b',set:{y:180}}]).then(json)
    await changes(1,'ordered-message-session',2,[{type:'patch',id:'shape-b',set:{y:190}}]).then(json)
    await until(()=>sockets[0].held.length>=2,'Capture actual out-of-order messages')
    for(const message of sockets[0].held.reverse()){x.sync.receive(message);x.sync.receive(message)}sockets[0].hold=false
    await x.sync.resync();assert.equal(x.sync.state().document.objects.find(o=>o.id==='shape-b').y,190)
    const order=(await fresh()).document.objects.map(o=>o.id)
    await Promise.all([changes(0,'order-owner-session',1,[{type:'order',ids:[...order].reverse()}]),changes(1,'order-editor-session',1,[{type:'order',ids:[order[1],order[0]]}])])
    await Promise.all([x.sync.resync(),y.sync.resync()]);assert.deepEqual(x.sync.state().document,y.sync.state().document)
    await changes(0,'delete-owner-session',1,[{type:'remove',id:'shape-b'}]).then(json)
    await changes(1,'delete-editor-session',1,[{type:'patch',id:'shape-b',set:{x:999}}]).then(json)
    assert.ok(!(await fresh()).document.objects.some(o=>o.id==='shape-b'))
    report('Actual Realtime messages reordered/duplicated, revision recovery, concurrent layer ordering, remote deletion beats stale edit')

    await x.sync.resync();x.offline=true;x.change({y:222});await sleep(20)
    const mcpBase=await fresh(),mcpDoc=edit(mcpBase.document,'shape-a',{fill:'#84cc16'})
    const mcp=await commitStudioMcpUpdate(stack,{token:tokens[0],companyId:company.id,designId:design.id,name:mcpBase.name,document:mcpDoc,revision:mcpBase.revision})
    await until(()=>sockets[2].wholeMessages.some(m=>m.revision===mcp.revision),'MCP broadcast after commit')
    x.offline=false;await x.sync.flush();const mcpResult=(await fresh()).document.objects.find(o=>o.id==='shape-a');assert.equal(mcpResult.y,222);assert.equal(mcpResult.fill,'#84cc16')
    report('Actual official MCP SDK + OAuth/PKCE + web approval: update broadcast after commit, idempotent proposal and local pending property preserved')

    // Same actor, distinct session IDs must never deduplicate each other's writes.
    await Promise.all([changes(0,'same-user-tab-one',1,[{type:'patch',id:'shape-a',set:{y:170}}]).then(json),changes(0,'same-user-tab-two',1,[{type:'patch',id:'shape-a',set:{fill:'#123456'}}]).then(json)])
    const tabDoc=(await fresh()).document;assert.equal(tabDoc.objects.find(o=>o.id==='shape-a').y,170);assert.equal(tabDoc.objects.find(o=>o.id==='shape-a').fill,'#123456')
    const upload=async actor=>{const form=new FormData();form.set('file',new File([await sharp({create:{width:80,height:60,channels:4,background:'#84cc16'}}).png().toBuffer()],'synthetic.png',{type:'image/png'}));form.set('moduleKey','runly.files');form.set('entityType','AtlasFile');return json(await api('/files/upload',{actor,body:form,method:'POST'}))}
    const [file,alien]=await Promise.all([upload(0),upload(3)])
    const photo=appendObject((await fresh()).document,'image',{id:'private-photo',fileAssetId:file.id,width:100,height:80,image:{mask:'star'}}).objects.at(-1)
    await changes(0,'photo-owner-session',1,[{type:'upsert',object:photo}]).then(json)
    assert.equal((await changes(1,'photo-editor-session',1,[{type:'patch',id:photo.id,set:{fileAssetId:alien.id}}])).status,403)
    assert.equal((await api(`${root}/assets/${file.id}/signed-url`,{actor:1})).status,200)
    report('Two sessions of one actor stay independent; real private Files/Storage cannot be replaced with foreign-company assets')

    // Preserve work offline, then revoke before either the retry or reload can publish.
    const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
    const pending=await core(1,'offline-editor-session',{storage,storageKey:'offline',retry:()=>10000});pending.offline=true
    await b.context.setOffline(true)
    await selectLayer(b.page,1);await b.page.getByLabel('Posición X',{exact:true}).fill('777');await b.page.getByLabel('Posición X',{exact:true}).press('Tab')
    pending.change({x:888});const abandoned=pending.sync.flush();await sleep(50)
    await share(1,null);pending.offline=false
    const count=sockets[1].messages.length
    pending.sync.resync();await assert.rejects(abandoned,e=>[403,404].includes(e.status));assert.equal(pending.sync.state().document.objects.find(o=>o.id==='shape-a').x,888)
    const retryCount=pending.requests.length;await sleep(150);assert.equal(pending.requests.length,retryCount)
    await b.context.setOffline(false);await b.page.reload();await b.page.getByText('No se pudo abrir el diseño',{exact:true}).waitFor()
    assert.ok([403,404].includes((await changes(1,'duplicate-editor-after-revoke',1,[])).status))
    assert.equal((await api(`${root}/assets/${file.id}/signed-url`,{actor:1})).status,404)
    await changes(0,'post-revoke-owner-session',1,[{type:'patch',id:'shape-a',set:{x:350}}]).then(json);await sleep(500)
    assert.equal(sockets[1].messages.length,count)
    assert.notEqual((await fresh()).document.objects.find(o=>o.id==='shape-a').x,777);assert.ok(values.has('offline'))
    report('Active revocation blocks offline queue/retry/reload and private-image capability; old B channel receives no later operation; local draft retained')
    await a.page.screenshot({path:join(stack.directory,'operations-owner.png')});await c.page.screenshot({path:join(stack.directory,'operations-viewer.png')})
    return {checks,identities:4,auth:'real Supabase',sql:'disposable only',faults:'explicit response loss/offline/message reorder injections; no forged auth'}
  }catch(error){for(const context of contexts)for(const page of context.pages())await page.screenshot({path:join(stack.directory,`operations-failure-${contexts.indexOf(context)}.png`)}).catch(()=>{});throw error}
  finally{for(const sync of syncs)sync.close();await browser.close();await Promise.all(clients.map(c=>c.removeAllChannels()))}
}
