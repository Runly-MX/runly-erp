import { STUDIO_REALTIME as P, createEphemeralKey, createLatestSender, validCertificate, validEphemeral,
  signEphemeral, verifyAttestation, importEphemeralKey, verifyEphemeral, realtimeSize, packEphemeral, unpackEphemeral } from '../../../../../shared/studio/realtime.js'

const releasing=new WeakMap()
function releaseDocument(client,channel){
  let topics=releasing.get(client);if(!topics){topics=new Map();releasing.set(client,topics)}
  const topic=channel.topic.replace(/^realtime:/,''),task=Promise.resolve(client.removeChannel(channel)).catch(()=>{})
  topics.set(topic,task);void task.finally(()=>{if(topics.get(topic)===task)topics.delete(topic)})
  return task
}

export function createPresenceStore() {
  let rows=[];const listeners=new Set()
  return {getSnapshot:()=>rows,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},set(next){rows=next;for(const fn of listeners)fn()}}
}

export function createStudioRealtimeSession({id,companyId,getToken,api,client,createSocket,onParticipants=()=>{},onStatus=()=>{},onRevision,onDenied,onChange,
  store=createPresenceStore(),timers=globalThis,now=()=>Date.now(),random=Math.random,visible=()=>true,crypto=globalThis.crypto,instrument=false}) {
  let active=true,denied=false,grant,identity,documentChannel,socketClient,ephemeralChannel,request,requestAbort,renewTimer,expiryTimer,sequence=0,offset=0,
    generation=0,attempt=0,lastSuccess=-Infinity,lastToken,documentJoined=false,ephemeralJoined=false,presenceBusy=false,presencePending=false,trackPending=false,pendingType=null,lastMetadata='',lastState='',lastPoint,
    state={pageId:'page-1',x:null,y:null,selectedId:null,activity:'active'}
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('')
  const sessions=new Map(),sequences=new Map(),verifying=new Set(),rates=new Map(),unknownPages=new Set(),counts={sent:0,received:0,dropped:0,reconnections:0,contexts:0}
  const count=k=>{if(instrument)counts[k]=(counts[k]??0)+1},serverNow=()=>now()+offset
  const alive=()=>active&&!denied&&grant&&serverNow()<grant.expiresAt
  const status=()=>onStatus(documentJoined&&ephemeralJoined&&alive()?'Conectado':'Reconectando')
  function publish(){
    const rows=[...sessions.values()].map(s=>s.row).filter(Boolean)
    store.set(rows)
    const metadata=rows.map(({x:_x,y:_y,seenAt:_seen,...p})=>p),signature=JSON.stringify(metadata)
    if(signature!==lastMetadata){lastMetadata=signature;if(active)onParticipants(metadata)}
  }
  async function removeChannels(){
    generation++;documentJoined=false;ephemeralJoined=false;sessions.clear();rates.clear();publish()
    const doc=documentChannel,socket=ephemeralChannel,owned=socketClient
    documentChannel=ephemeralChannel=socketClient=null
    const closing=socket?owned.removeAllChannels():undefined
    // This socket belongs only to Studio. Its close also removes Presence when
    // an unsubscribe acknowledgement cannot arrive during a network failure.
    owned?.realtime.disconnect()
    await Promise.allSettled([doc?releaseDocument(client,doc):undefined,closing])
  }
  function deny(){
    if(!active||denied)return;denied=true;timers.clearTimeout(renewTimer);timers.clearTimeout(expiryTimer);sender.cancel();tracker.cancel()
    requestAbort?.abort();timers.clearInterval(expiry);void removeChannels();onStatus('Sin acceso');onDenied?.()
  }
  function planRenew(delay=P.renewMs){timers.clearTimeout(renewTimer);if(active&&!denied)renewTimer=timers.setTimeout(()=>{void refresh()},delay+Math.floor(random()*1000))}
  async function refresh(){
    if(!active||denied)return
    if(request)return request
    if(alive()&&getToken()===lastToken&&now()-lastSuccess<500)return
    requestAbort=new AbortController()
    const watchdog=timers.setTimeout(()=>requestAbort.abort(),8000)
    request=(async()=>{
      try{
        identity??=await createEphemeralKey(crypto)
        if(!active||denied)return
        const started=now();count('contexts')
        const authToken=getToken(),response=await api(id,{version:1,sessionId:nonce,publicKey:identity.publicKey},authToken,requestAbort.signal),data=response?.data??response
        if(!active||denied)return
        if(data?.version!==1||data.certificate?.publicKey!==identity.publicKey||data.certificate?.designId!==id||data.certificate?.companyId!==companyId||
          data.topic!==`studio:ephemeral:${id}@${data.certificate.epoch}`||data.documentTopic!==`studio:design:${id}@${data.certificate.epoch}`||
          !Number.isFinite(data.serverTime)||!Array.isArray(data.pages)||data.pages.length>24||data.expiresAt!==data.certificate.expiresAt||
          !validCertificate(data.certificate,{designId:id,companyId,epoch:data.certificate.epoch,now:data.serverTime})||
          !await verifyAttestation(data.certificate,data.certificateSignature,data.verificationKey,crypto))throw Object.assign(Error('Actualiza Studio y el API.'),{status:426})
        if(!active||denied)return
        offset=data.serverTime-started
        const changed=grant?.topic!==data.topic
        grant=data;attempt=0;lastSuccess=now();lastToken=authToken
        for(const page of data.pages)unknownPages.delete(page.id)
        if(changed||!ephemeralChannel||!documentChannel||ephemeralChannel.state==='closed'||documentChannel.state==='closed')await connect()
        else {await socketClient.realtime.setAuth(data.socketToken);queue('activity',true)}
        if(!active||denied)return
        onRevision?.(data.revision,data.canEdit)
        timers.clearTimeout(expiryTimer)
        expiryTimer=timers.setTimeout(()=>{if(active){grant=null;void removeChannels();onStatus('Reconectando')}},Math.max(0,data.expiresAt-serverNow()))
        planRenew(Math.min(P.renewMs,Math.max(1000,data.expiresAt-serverNow()-8000)))
      }catch(error){
        count(`contextFailure_${error.status??'transport'}`)
        if(!active||denied)return
        // Auth may refresh just after resume. Stop all capabilities immediately,
        // but let the latest token recover without labelling it an ACL revoke.
        if(error.status===401){timers.clearTimeout(expiryTimer);grant=null;await removeChannels();onStatus('Renovando sesión');planRenew(Math.min(P.renewMs,1000*2**Math.min(attempt++,5)));return}
        if([403,404,426].includes(error.status)){deny();return}
        onStatus('Reconectando');planRenew(Math.min(P.renewMs,1000*2**Math.min(attempt++,5)))
      }finally{timers.clearTimeout(watchdog);request=null}
    })()
    return request
  }
  async function connect(){
    await removeChannels();if(!active||denied||!alive())return
    const epoch=generation,current=grant;let joinedOnce=false
    await releasing.get(client)?.get(current.documentTopic)
    if(!active||epoch!==generation)return
    socketClient=createSocket(()=>grant?.socketToken??null)
    await socketClient.realtime.setAuth(current.socketToken)
    if(!active||epoch!==generation){socketClient?.realtime.disconnect();return}
    ephemeralChannel=socketClient.channel(current.topic,{config:{private:true,broadcast:{self:false,ack:true},presence:{key:current.certificate.sessionId}}})
      .on('presence',{event:'sync'},()=>{void syncPresence(epoch)})
      .on('broadcast',{event:'ephemeral:v1'},message=>{void receive(message.payload,epoch)})
    documentChannel=client.channel(current.documentTopic,{config:{private:true}})
      .on('broadcast',{event:'change'},message=>{if(alive()&&epoch===generation&&Number.isSafeInteger(message.payload?.revision)){persistent(message.payload);onChange?.(message.payload)}})
      .on('broadcast',{event:'changed'},message=>{if(alive()&&epoch===generation&&Number.isSafeInteger(message.payload?.revision))onRevision?.(message.payload.revision)})
    documentChannel.subscribe((value,error)=>{
      if(!active||epoch!==generation)return
      const was=documentJoined;documentJoined=value==='SUBSCRIBED';status()
      count(`document_${value}`)
      if(instrument&&error)counts.documentError=error.message
      if(documentJoined&&!was){if(joinedOnce&&serverNow()-grant.serverTime>1000){count('reconnections');void refresh()}joinedOnce=true}
    })
    ephemeralChannel.subscribe((value,error)=>{
      if(!active||epoch!==generation)return
      ephemeralJoined=value==='SUBSCRIBED';status()
      count(`ephemeral_${value}`)
      if(instrument&&error)counts.ephemeralError=error.message
      if(ephemeralJoined)queue('activity',true)
      else {sessions.clear();publish();if(value==='CLOSED')planRenew(1000)}
    })
  }
  async function syncPresence(epoch){
    if(!alive()||!ephemeralChannel||epoch!==generation)return
    if(presenceBusy){presencePending=true;return}
    presenceBusy=true
    try{
      const raw=Object.values(ephemeralChannel.presenceState()).flat().slice(0,P.maxSessions),seen=new Set()
      for(const entry of raw){
        const c=entry?.certificate
        if(!c||c.sessionId===grant.certificate.sessionId||realtimeSize(entry)>P.maxBytes||Object.keys(entry).some(k=>!['certificate','certificateSignature','payload','signature','presence_ref'].includes(k))||!validCertificate(c,{designId:id,companyId,epoch:grant.certificate.epoch,now:serverNow()}))continue
        if(sequences.size>=1000&&!sequences.has(c.sessionId))continue
        let known=sessions.get(c.sessionId)
        if(!known||known.certificateSignature!==entry.certificateSignature){
          if(!await verifyAttestation(c,entry.certificateSignature,grant.verificationKey,crypto))continue
          known={...known,certificate:c,certificateSignature:entry.certificateSignature,key:await importEphemeralKey(c.publicKey,crypto),lastSeq:known?.lastSeq??sequences.get(c.sessionId)?.seq??0}
        }
        const envelope={payload:entry.payload,signature:entry.signature}
        if(!validEphemeral(entry.payload,c,grant.pages,serverNow(),P.leaseMs)||!await verifyEphemeral(envelope,known.key,crypto))continue
        if(!alive()||epoch!==generation)return
        seen.add(c.sessionId);sessions.set(c.sessionId,known)
        if(entry.payload.seq>known.lastSeq)apply(known,entry.payload)
      }
      if(!alive()||epoch!==generation)return
      for(const key of sessions.keys())if(!seen.has(key))sessions.delete(key)
      publish()
    }finally{presenceBusy=false;if(presencePending){presencePending=false;void syncPresence(generation)}}
  }
  function apply(known,p){
    const entered=known.row?.pageId!==p.pageId&&p.pageId===state.pageId
    known.lastSeq=p.seq
    sequences.set(p.sessionId,{seq:p.seq,expiresAt:known.certificate.expiresAt})
    known.row={userId:known.certificate.actorId,sessionId:known.certificate.sessionId,name:known.certificate.name,role:known.certificate.role,
      pageId:p.pageId,x:p.activity==='active'?p.x:null,y:p.activity==='active'?p.y:null,selectedId:p.selectedId,activity:p.activity,seenAt:new Date(p.at).toISOString()}
    if(entered)queue('activity',true)
  }
  function persistent(message){
    let changed=false,pagesChanged=false
    for(const op of message.ops??[]){
      const pageId=op.pageId??'page-1'
      if(op.type==='addPage'&&op.scene?.page&&!grant.pages.some(p=>p.id===op.scene.page.id)){grant.pages.push({...op.scene.page});pagesChanged=true}
      if(op.type==='patchPage'){const page=grant.pages.find(p=>p.id===pageId);if(page)Object.assign(page,op.set);pagesChanged=true}
      if(op.type==='removePage'){grant.pages=grant.pages.filter(p=>p.id!==pageId);pagesChanged=true}
      if(!['remove','removePage'].includes(op.type))continue
      for(const s of sessions.values())if(s.row?.pageId===pageId&&(op.type==='removePage'||s.row.selectedId===op.id)){s.row={...s.row,selectedId:null,...(op.type==='removePage'?{x:null,y:null}:{})};changed=true}
      if(state.pageId===pageId&&(op.type==='removePage'||state.selectedId===op.id)){state={...state,selectedId:null,x:null,y:null};queue('selection',true)}
    }
    if(changed)publish()
    if(pagesChanged&&grant.pages.some(p=>p.id===state.pageId))queue('page',true)
  }
  async function receive(frame,epoch){
    count('received')
    if(realtimeSize(frame)>P.maxBytes){count('dropped');return}
    const envelope=unpackEphemeral(frame)
    if(instrument&&!counts.envelopeShape)counts.envelopeShape={keys:Object.keys(envelope??{}),payloadKeys:Object.keys(envelope?.payload??{})}
    const p=envelope?.payload,known=sessions.get(p?.sessionId),time=serverNow(),rate=rates.get(p?.sessionId)
    if(!alive()||epoch!==generation||!known||realtimeSize(envelope)>P.maxBytes||verifying.has(p.sessionId)||
      p.seq<=known.lastSeq||rate&&time-rate.start<1000&&rate.count>=20||!validEphemeral(p,known.certificate,grant.pages,time)){count('dropped');return}
    rates.set(p.sessionId,rate&&time-rate.start<1000?{...rate,count:rate.count+1}:{start:time,count:1});verifying.add(p.sessionId)
    try{
      if(await verifyEphemeral(envelope,known.key,crypto)&&alive()&&epoch===generation&&p.seq>known.lastSeq&&sessions.get(p.sessionId)===known){apply(known,p);publish()}
      else count('dropped')
    }finally{verifying.delete(p.sessionId)}
  }
  const tracker=createLatestSender(async value=>{
    if(!alive()||value.generation!==generation||!ephemeralJoined||value.certificate.expiresAt<=serverNow())return
    const result=visible()?await ephemeralChannel.track(value.entry):await ephemeralChannel.untrack()
    count(result==='ok'?'presenceSent':'presenceFailed')
  },{timers,now,interval:1000,onError:()=>count('presenceFailed')})
  const sender=createLatestSender(async value=>{
    if(!alive()||!ephemeralJoined||!ephemeralChannel)return
    pendingType=null
    const receivers=()=>sessions.size&&(value.type!=='cursor'||[...sessions.values()].some(s=>s.row?.pageId===value.state.pageId&&s.row.activity==='active'))
    if(!trackPending&&!receivers())return
    const epoch=generation,c=grant.certificate,certificateSignature=grant.certificateSignature,payload={v:1,sessionId:c.sessionId,type:value.type,seq:++sequence,at:Math.floor(serverNow()),...value.state}
    if(!validEphemeral(payload,c,grant.pages,serverNow()))return
    const envelope=await signEphemeral(payload,identity.pair.privateKey,crypto)
    if(!alive()||epoch!==generation)return
    if(trackPending){trackPending=false;tracker.push({generation:epoch,certificate:c,entry:{certificate:c,certificateSignature,...envelope}})}
    if(!alive()||epoch!==generation||!visible()||!receivers())return
    // send() must never fall back to Supabase's HTTP broadcast endpoint.
    if(ephemeralChannel.state==='joined'){const result=await ephemeralChannel.send({type:'broadcast',event:'ephemeral:v1',payload:packEphemeral(envelope)});count(result==='ok'?'sent':'sendFailed')}
  },{timers,now,onError:()=>{onStatus('Reconectando')}})
  function queue(type,track=false){
    if(!active||denied)return
    trackPending||=track
    const signature=JSON.stringify(state)
    if(!track&&signature===lastState)return
    if(type!=='cursor')pendingType=type
    lastState=signature;sender.push({type:pendingType??type,state:{...state}})
  }
  function discoverPage(pageId){
    if(!grant||grant.pages.some(p=>p.id===pageId)||unknownPages.has(pageId)||unknownPages.size>=100)return
    unknownPages.add(pageId);void refresh()
  }
  const expiry=timers.setInterval(()=>{
    if(!active)return;let changed=false
    for(const [sid,s]of sequences)if(s.expiresAt<=serverNow())sequences.delete(sid)
    for(const sid of rates.keys())if(!sessions.has(sid))rates.delete(sid)
    for(const [sid,s]of sessions)if(s.certificate.expiresAt<=serverNow()){sessions.delete(sid);rates.delete(sid);changed=true}
    if(changed)publish()
  },1000)
  return {store,start:refresh,refresh,
    pointer(point,pageId=state.pageId){
      if(!visible())return
      if(pageId!==state.pageId){state={...state,pageId,selectedId:null};trackPending=true}
      const x=point?.x??null,y=point?.y??null
      if(lastPoint?.pageId===pageId&&((x===null&&lastPoint.x===null)||(x!==null&&lastPoint.x!==null&&Math.hypot(x-lastPoint.x,y-lastPoint.y)<1)))return
      lastPoint={pageId,x,y};state={...state,x,y,activity:'active'};queue('cursor')
      discoverPage(pageId)
    },
    selection(selectedId,pageId=state.pageId){if(pageId===state.pageId&&(selectedId??null)===state.selectedId)return;const changed=pageId!==state.pageId;if(changed)state={...state,x:null,y:null};state={...state,pageId,selectedId:selectedId??null};queue('selection',changed);discoverPage(pageId)},
    visibility(){state={...state,activity:visible()?'active':'idle',x:null,y:null};queue('activity',true);if(visible())void refresh()},
    stats:()=>({...counts,channels:Number(Boolean(documentChannel))+Number(Boolean(ephemeralChannel)),sessions:sessions.size,documentState:documentChannel?.state,ephemeralState:ephemeralChannel?.state,sequence,leaseRemainingMs:grant?grant.expiresAt-serverNow():0,sender:sender.state(),tracker:tracker.state()}),
    close(){if(!active)return;active=false;requestAbort?.abort();sender.cancel();tracker.cancel();timers.clearTimeout(renewTimer);timers.clearTimeout(expiryTimer);timers.clearInterval(expiry);return removeChannels()},
  }
}
