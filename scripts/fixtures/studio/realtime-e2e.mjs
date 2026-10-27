import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createEphemeralKey, packEphemeral } from '../../../apps/shared/studio/realtime.js'
import { documentPages } from '../../../apps/shared/studio/pages.js'
import { commitStudioMcpUpdate } from './operations-mcp.mjs'
const {createClient}=createRequire(new URL('../../../apps/api/package.json',import.meta.url))('@supabase/supabase-js')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(fn,message,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await fn())return;await sleep(100)}assert.fail(message)}

export async function verifyStudioRealtimeBrowser({stack,data,tokens,authSessions,design,browser,url,outageMs=30000,nativeLifecycle=false}) {
  const {users,companies}=data,company=companies[0],contexts=[],checks=[],network=[],clients=[]
  const api=async(path,{actor=0,body,method=body?'POST':'GET'}={})=>{
    const r=await fetch(stack.urls.api+path,{method,headers:{Authorization:`Bearer ${tokens[actor]}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'3','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
    const result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result.data
  }
  const start=async(actor,strict=false,designId=design.id)=>{
    const context=await browser.newContext(),page=await context.newPage();contexts.push(context)
    page.on('request',r=>{if(r.url().startsWith(stack.urls.api))network.push(new URL(r.url()).pathname)})
    await page.goto(url);await page.waitForFunction(()=>!!window.start)
    await page.evaluate(({input,strict})=>window.start(input,strict),{input:{api:stack.urls.api,url:stack.urls.kong,key:stack.secret.SUPABASE_ANON_KEY,token:tokens[actor],companyId:company.id,actorId:users[actor].id,designId},strict})
    await page.waitForFunction(()=>window.state().status==='Conectado',null,{timeout:20000});return {page,context}
  }
  const person=async(page,actor)=>page.evaluate(id=>window.state().participants.find(p=>p.userId===id),users[actor].id)
  let owner,peer,viewer,lifecycle
  try{
    await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3',[company.roleId,company.id,users[1].id])
    await api(`/studio/designs/${design.id}/collaborators`,{method:'PUT',body:{userId:users[1].id,role:'VIEWER'}})
    owner=await start(0,true);peer=await start(2);viewer=await start(1)
    await until(async()=> (await owner.page.evaluate(()=>window.state().participants.length))===2,'Presence did not enumerate editor and viewer')
    const started=Date.now();await owner.page.evaluate(()=>window.point({x:100,y:60}))
    await until(async()=> (await person(peer.page,0))?.x===100,'Cursor not delivered')
    const cursorObservedMs=Date.now()-started
    assert.equal(network.filter(p=>p.endsWith('/live')).length,0)
    assert.ok((await person(peer.page,0)).name.startsWith('Studio'))
    await owner.page.evaluate(()=>window.select('shape-1'))
    await until(async()=> (await person(peer.page,0))?.selectedId==='shape-1','Selection not delivered')
    await owner.page.evaluate(()=>window.point({x:70,y:80},'page-2'))
    await until(async()=>{const p=await person(peer.page,0);return p?.pageId==='page-2'&&p.selectedId===null},'Page transition retained prior selection')
    await owner.page.evaluate(()=>window.select('shape-2','page-2'))
    await until(async()=> (await person(peer.page,0))?.selectedId==='shape-2','Second-page selection not delivered')
    await api(`/studio/designs/${design.id}/changes`,{body:{clientId:'remove-selection',batchId:1,ops:[{type:'remove',pageId:'page-2',id:'shape-2'}]}})
    await until(async()=> (await person(peer.page,0))?.selectedId===null,'Deleted object selection remained')
    await api(`/studio/designs/${design.id}/changes`,{body:{clientId:'restore-selection',batchId:1,ops:[{type:'upsert',pageId:'page-2',object:design.document.additionalPages[0].objects[0]}]}})
    checks.push('Real Presence/selection/page transitions, deletion cleanup, verified names and StrictMode; no /live requests')

    const actorKey=await createEphemeralKey(),grant=await api(`/studio/designs/${design.id}/collaboration`,{actor:2,body:{version:1,sessionId:'d'.repeat(32),publicKey:actorKey.publicKey}})
    const attack=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{accessToken:async()=>grant.socketToken,auth:{persistSession:false,autoRefreshToken:false}});clients.push(attack)
    await attack.realtime.setAuth(grant.socketToken)
    const ch=attack.channel(grant.topic,{config:{private:true,presence:{key:'attacker',enabled:true},broadcast:{ack:true}}})
    const victim=await person(peer.page,0)
    await owner.page.evaluate(()=>{const c=window.studioSockets.at(-1).getChannels()[0],send=c.send.bind(c);c.send=(frame,...args)=>{if(frame.event==='ephemeral:v1')window.capturedEnvelope=frame.payload;return send(frame,...args)}})
    await new Promise((resolve,reject)=>ch.subscribe(s=>{if(s==='SUBSCRIBED')resolve();else if(s==='CHANNEL_ERROR')reject(Error('Attacker scope failed'))}))
    assert.equal(await ch.send({type:'broadcast',event:'ephemeral:v1',payload:packEphemeral({payload:{v:1,sessionId:victim.sessionId,type:'cursor',seq:999999,at:Date.now(),pageId:'page-1',x:319,y:239,selectedId:null,activity:'active'},signature:'A'.repeat(86)})}),'ok')
    assert.equal(await ch.track({certificate:{...grant.certificate,actorId:users[0].id,name:'Forged name'},certificateSignature:grant.certificateSignature,payload:{},signature:'A'.repeat(86)}),'ok')
    await owner.page.evaluate(()=>window.point({x:110,y:65},'page-1'))
    try{await until(()=>owner.page.evaluate(()=>Boolean(window.capturedEnvelope)),'No signed frame captured')}catch(e){console.error('Owner transport:',await owner.page.evaluate(()=>window.state()));console.error('Peer transport:',await peer.page.evaluate(()=>window.state()));throw e}
    const old=await owner.page.evaluate(()=>window.capturedEnvelope)
    await owner.page.evaluate(()=>window.point({x:120,y:70},'page-1'));await until(async()=> (await person(peer.page,0))?.x===120,'New frame not delivered')
    await ch.send({type:'broadcast',event:'ephemeral:v1',payload:old});await sleep(250)
    assert.equal((await person(peer.page,0)).x,120)
    assert.ok(!(await peer.page.evaluate(()=>window.state().participants)).some(p=>p.name==='Forged name'))
    await attack.removeAllChannels();attack.realtime.disconnect()
    checks.push('Malicious authorized sender cannot forge another session, alter verified identity or rewind a signed cursor with replay')

    const tab=await start(0)
    await until(async()=> (await peer.page.evaluate(id=>window.state().participants.filter(p=>p.userId===id).length,users[0].id))===2,'Two tabs collapsed into one session')
    const leaveAt=Date.now();await tab.context.close()
    await until(async()=> (await peer.page.evaluate(id=>window.state().participants.filter(p=>p.userId===id).length,users[0].id))===1,'Closed tab presence persisted')
    const leaveObservedMs=Date.now()-leaveAt
    await owner.page.evaluate(()=>window.localEdit('shape-1','page-1',41));await peer.page.evaluate(()=>window.localEdit('shape-2','page-2',52))
    await Promise.all([owner.page.evaluate(()=>window.flush()),peer.page.evaluate(()=>window.flush())])
    await until(async()=>{const a=await owner.page.evaluate(()=>window.syncState()),b=await peer.page.evaluate(()=>window.syncState());return a.revision===b.revision&&!a.pending&&!b.pending},'Simultaneous batches failed to converge')
    let saved=await api(`/studio/designs/${design.id}`)
    assert.equal(saved.document.objects[0].x,41);assert.equal(saved.document.additionalPages[0].objects[0].x,52)
    const mcpDocument=structuredClone(saved.document);mcpDocument.objects[0].y=99
    await commitStudioMcpUpdate(stack,{token:tokens[0],companyId:company.id,designId:design.id,name:saved.name,document:mcpDocument,revision:saved.revision})
    await until(async()=> (await peer.page.evaluate(()=>window.syncState().document.objects[0].y))===99,'MCP whole-document update did not reconcile')
    checks.push('Multiple tabs clean up independently; concurrent multipage changes and real MCP approval/commit converge through the unchanged sync engine')

    if(nativeLifecycle){
      const cdp=await peer.context.newCDPSession(peer.page),{windowId}=await cdp.send('Browser.getWindowForTarget')
      await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}})
      assert.equal((await cdp.send('Browser.getWindowBounds',{windowId})).bounds.windowState,'minimized')
      await sleep(1000)
      lifecycle={minimizedVisibility:await peer.page.evaluate(()=>document.visibilityState)}
      await cdp.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}})
      const background=await peer.context.newPage();await background.goto('about:blank');await background.bringToFront();await sleep(1000)
      lifecycle.backgroundVisibility=await peer.page.evaluate(()=>document.visibilityState)
      await background.close();await peer.page.bringToFront()
      // Automated Chrome can keep visibilityState visible even with native window
      // bounds minimized. Exercise the hidden-event branch explicitly, and label it.
      await peer.page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
      await until(async()=>!await person(owner.page,2),'Hidden session retained Presence')
      await peer.page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))})
      await until(async()=>Boolean(await person(owner.page,2)),'Visible session failed to rejoin')
      await peer.context.route('**/studio/designs/*/changes',route=>route.abort())
      await peer.page.evaluate(()=>window.localEdit('shape-2','page-2',171))
      await cdp.send('Page.setWebLifecycleState',{state:'frozen'})
      try{
        await owner.page.evaluate(()=>window.localEdit('shape-1','page-1',172));await owner.page.evaluate(()=>window.flush())
        await sleep(35000)
        await until(async()=>!await person(owner.page,2),'Frozen session outlived socket capability',5000)
      }finally{await cdp.send('Page.setWebLifecycleState',{state:'active'})}
      await peer.context.unroute('**/studio/designs/*/changes');await peer.page.evaluate(()=>window.dispatchEvent(new Event('online')))
      await until(async()=> (await peer.page.evaluate(()=>window.state().status))==='Conectado','Frozen renderer did not reconnect',20000)
      await peer.page.evaluate(()=>window.flush())
      await until(async()=>{const s=await peer.page.evaluate(()=>window.syncState());return s.document.objects[0].x===172&&s.document.additionalPages[0].objects[0].x===171&&!s.pending},'Freeze/resume lost local or remote changes',20000)
      lifecycle.rendererFrozenMs=35000;lifecycle.osSuspensionTested=false;lifecycle.hiddenEventSynthetic=true
      checks.push('Native minimize/tab switch exercised; explicit hidden event removes Presence; 35 s renderer freeze/resume preserves pending and remote changes (not OS suspension)')
    }

    const legacyState=await api(`/studio/designs/${design.id}/live`,{body:{sessionId:'legacy-compatible-session',cursor:{x:12,y:14}}})
    const legacy=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{accessToken:async()=>tokens[0],auth:{persistSession:false,autoRefreshToken:false}});clients.push(legacy)
    await legacy.realtime.setAuth(tokens[0]);let legacyRevision=0
    const legacyChannel=legacy.channel(legacyState.topic,{config:{private:true}}).on('broadcast',{event:'change'},m=>{legacyRevision=m.payload.revision})
    await new Promise((resolve,reject)=>legacyChannel.subscribe(s=>{if(s==='SUBSCRIBED')resolve();if(s==='CHANNEL_ERROR')reject(Error('Legacy subscription denied'))}))
    await api(`/studio/designs/${design.id}/changes`,{body:{clientId:'legacy-realtime-fixture',batchId:1,ops:[{type:'patch',pageId:'page-1',id:'shape-1',set:{x:66}}]}})
    await until(async()=> (await peer.page.evaluate(()=>window.syncState().document.objects[0].x))===66,'New client missed legacy persistent operation')
    await owner.page.evaluate(()=>window.localEdit('shape-1','page-1',77));await owner.page.evaluate(()=>window.flush())
    await until(()=>legacyRevision>0,'Legacy client missed confirmed new-client operation')
    const oldProtocol=await fetch(`${stack.urls.api}/studio/designs/${design.id}`,{method:'PUT',headers:{Authorization:`Bearer ${tokens[0]}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'2','Content-Type':'application/json'},body:JSON.stringify({name:'Old overwrite',revision:1,document:design.document})})
    assert.equal(oldProtocol.status,426)
    await api(`/studio/designs/${design.id}/live`,{body:{sessionId:'legacy-compatible-session',leave:true}})
    await legacy.removeAllChannels();legacy.realtime.disconnect()
    checks.push('Old live/SQL presence and new transport coexist; persistent changes cross both ways and protocol-2 overwrite remains rejected')

    await stack.compose(['stop','-t','1','supabase-realtime']);await sleep(outageMs)
    const auth=createClient(stack.urls.kong,stack.secret.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
    const refreshed=await auth.auth.refreshSession({refresh_token:authSessions[2].refresh_token});assert.ok(!refreshed.error)
    tokens[2]=refreshed.data.session.access_token
    await peer.page.evaluate(token=>window.renewToken(token),tokens[2]);await stack.compose(['up','-d','--no-deps','--wait','--wait-timeout','90','supabase-realtime'])
    await until(async()=> (await peer.page.evaluate(()=>window.state().status))==='Conectado','Reconnect after 30 s failed',20000)
    try{
      await until(async()=>Boolean(await person(peer.page,0))&&Boolean(await person(owner.page,2)),'Roster did not recover after socket reconnection',10000)
      await owner.page.evaluate(()=>window.point({x:130,y:80}));await until(async()=> (await person(peer.page,0))?.x===130,'Reconnected peer missed cursor')
    }catch(e){console.error('Reconnected owner:',await owner.page.evaluate(()=>window.state()));console.error('Reconnected peer:',await peer.page.evaluate(()=>window.state()));throw e}
    await peer.context.route('**/studio/designs/*/collaboration',route=>route.abort())
    await sleep(31000)
    assert.equal(await peer.page.evaluate(()=>window.activeSockets()),0,'Expired lease retained a receiving channel during API outage')
    await peer.context.unroute('**/studio/designs/*/collaboration');await peer.page.evaluate(()=>window.dispatchEvent(new Event('online')))
    await until(async()=> (await peer.page.evaluate(()=>window.state().status))==='Conectado','API restoration did not recover',20000)
    checks.push(`Real Supabase reconnection after ${outageMs/1000} s, Auth token refresh, API-only outage, lease shutdown and restoration preserve the session`)

    await peer.context.route('**/studio/designs/*/changes',route=>route.abort())
    await peer.page.evaluate(()=>window.localEdit('shape-2','page-2',213))
    await until(async()=> (await peer.page.evaluate(()=>window.syncState().pending))>0,'No pending local draft')
    const revokeAt=Date.now()
    await api(`/studio/designs/${design.id}/collaborators`,{method:'PUT',body:{userId:users[2].id,role:null}})
    await peer.context.unroute('**/studio/designs/*/changes')
    await until(async()=>await peer.page.evaluate(()=>window.state().denied),'Revocation was not reported',32000)
    const revocationObservedMs=Date.now()-revokeAt
    assert.ok((await peer.page.evaluate(()=>window.draft().document.additionalPages[0].objects[0].x))===213)
    saved=await api(`/studio/designs/${design.id}`);assert.notEqual(saved.document.additionalPages[0].objects[0].x,213)
    await until(async()=> (await peer.page.evaluate(()=>window.activeSockets()))===0,'Revoked session retained Studio subscriptions',2000)
    checks.push('Revocation denies writes, closes both receiving channels within lease and preserves pending local edits for review')
    const other=await api('/studio/designs',{body:{name:'Switch target',document:design.document}})
    await owner.page.evaluate(()=>window.stop());await sleep(100)
    await until(async()=> (await owner.page.evaluate(()=>window.activeSockets()))===0,'Unmount retained Studio subscriptions',2000)
    await owner.page.evaluate(input=>window.start(input),{api:stack.urls.api,url:stack.urls.kong,key:stack.secret.SUPABASE_ANON_KEY,token:tokens[0],companyId:company.id,actorId:users[0].id,designId:other.id})
    await owner.page.waitForFunction(()=>window.state().status==='Conectado')
    assert.equal(await owner.page.evaluate(()=>window.state().participants.length),0)
    await owner.page.evaluate(()=>window.stop());await until(async()=> (await owner.page.evaluate(()=>window.activeSockets()))===0,'Final unmount retained Studio subscriptions',2000)
    checks.push('Design switch and final unmount release channels and timers without participant leakage')
    return {passed:true,checks,cursorObservedMs,leaveObservedMs,revocationObservedMs,documentPages:documentPages(saved.document).length,liveRequests:network.filter(p=>p.endsWith('/live')).length,...lifecycle?{lifecycle}:{}}
  }finally{await stack.compose(['unpause','supabase-realtime']).catch(()=>{});for(const c of clients){await c.removeAllChannels();c.realtime.disconnect()}for(const c of contexts)await c.close()}
}
