import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync,sign } from 'node:crypto'
import { createStudioRealtimeSession } from './studio-realtime.js'
import { createEphemeralKey,signEphemeral,realtimeBytes,packEphemeral } from '../../../../../shared/studio/realtime.js'
const designId='00000000-0000-4000-8000-000000000001',companyId='00000000-0000-4000-8000-000000000002',actorId='00000000-0000-4000-8000-000000000003'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function until(check){for(let i=0;i<100;i++){if(check())return;await sleep(2)}assert.fail('Condition did not settle')}
function fixture(){
  let clock=Date.now(),token='auth-1',fail,calls=0,next=0,denied=0;const tasks=new Map(),channels=[],sent=[],metadata=[]
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),verificationKey=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url')
  const timers={setTimeout(fn,ms){tasks.set(++next,{fn,at:clock+ms});return next},clearTimeout:id=>tasks.delete(id),setInterval(fn,ms){tasks.set(++next,{fn,at:clock+ms,interval:ms});return next},clearInterval:id=>tasks.delete(id)}
  const advance=async ms=>{clock+=ms;for(const [key,t]of [...tasks])if(t.at<=clock){if(t.interval)t.at=clock+t.interval;else tasks.delete(key);t.fn()}await sleep(2)}
  function attest(publicKey,sessionId='a'.repeat(32),actor=actorId){const certificate={v:1,designId,companyId,actorId:actor,sessionId,publicKey,name:'Verified',role:'EDITOR',epoch:'4',issuedAt:clock,expiresAt:clock+30000};return {certificate,certificateSignature:sign(null,realtimeBytes(certificate),privateKey).toString('base64url')}}
  const api=async(_id,input,auth,signal)=>{calls++;assert.equal(auth,token);if(fail)throw fail;assert.equal(signal.aborted,false);return {version:1,...attest(input.publicKey),verificationKey,socketToken:`socket-${calls}`,serverTime:clock,expiresAt:clock+30000,topic:`studio:ephemeral:${designId}@4`,documentTopic:`studio:design:${designId}@4`,revision:1,canEdit:true,pages:[{id:'page-1',width:320,height:240},{id:'page-2',width:240,height:320}]}}
  function client(){const local=[];return {removeAllChannels:async()=>{for(const ch of local){ch.state='closed';ch.emit('status','CLOSED')}},realtime:{setAuth:async()=>{},disconnect(){}},removeChannel:async ch=>{ch.state='closed';ch.emit('status','CLOSED')},channel(topic){const bindings=[];const ch={topic,state:'closed',presence:{},on(type,filter,fn){bindings.push({type,event:filter.event,fn});return ch},subscribe(fn){bindings.push({type:'status',fn});ch.state='joined';queueMicrotask(()=>fn('SUBSCRIBED'));return ch},presenceState:()=>ch.presence,track:async p=>{ch.tracked=p;return'ok'},untrack:async()=>{ch.tracked=null;return'ok'},send:async frame=>{sent.push(frame);return'ok'},emit(type,event,payload){for(const b of bindings)if(b.type===type&&(type==='status'||b.event===event))b.fn(type==='status'?event:payload)}};channels.push(ch);local.push(ch);return ch}}}
  const session=createStudioRealtimeSession({id:designId,companyId,getToken:()=>token,api,client:client(),createSocket:()=>client(),onParticipants:r=>metadata.push(r),onDenied:()=>denied++,timers,now:()=>clock,random:()=>0,instrument:true})
  return {session,advance,channels,sent,tasks,metadata,attest,now:()=>clock,get calls(){return calls},get denied(){return denied},set token(t){token=t},set fail(e){fail=e}}
}
test('cursor coalescing uses Broadcast, suppresses duplicate selection and never calls the context per movement',async()=>{
  const f=fixture();try{await f.session.start();await f.advance(0)
    const peer=await createEphemeralKey(),proof=f.attest(peer.publicKey,'b'.repeat(32)),payload={v:1,sessionId:proof.certificate.sessionId,type:'activity',seq:1,at:f.now(),pageId:'page-1',x:null,y:null,selectedId:null,activity:'active'}
    const ch=f.channels.find(c=>c.topic.includes('ephemeral'));ch.presence={peer:[{...proof,...await signEphemeral(payload,peer.pair.privateKey)}]};ch.emit('presence','sync',{});await until(()=>f.session.store.getSnapshot().length===1);await f.advance(100);await until(()=>f.sent.length===1)
    for(let n=0;n<10;n++){for(let i=0;i<20;i++)f.session.pointer({x:n*20+i,y:20});await f.advance(100);await until(()=>f.sent.length===n+2)}
    assert.equal(f.calls,1);assert.equal(f.sent.length,11);assert.ok(f.sent.every(e=>e.type==='broadcast'))
    f.session.selection('shape-1');await f.advance(100);await until(()=>f.sent.length===12)
    for(let i=0;i<20;i++)f.session.selection('shape-1');await f.advance(100);assert.equal(f.sent.length,12)
    f.session.pointer({x:30,y:40},'page-2');await f.advance(100);await sleep(10)
    await f.advance(1000);await until(()=>ch.tracked?.payload.pageId==='page-2')
    assert.equal(ch.tracked.payload.selectedId,null);assert.equal(f.sent.length,12,'No cursor broadcast to a page without other participants')
  }finally{await f.session.close()}assert.equal(f.tasks.size,0)
})
test('signed Presence and cursors ignore spoofed fields, signatures and out-of-order events; leaving removes the session',async()=>{
  const f=fixture();try{await f.session.start();await f.advance(0);const peer=await createEphemeralKey(),proof=f.attest(peer.publicKey,'b'.repeat(32),'00000000-0000-4000-8000-000000000004')
    const payload={v:1,sessionId:proof.certificate.sessionId,type:'cursor',seq:1,at:f.now(),pageId:'page-1',x:20,y:30,selectedId:'shape-1',activity:'active'}
    const envelope=await signEphemeral(payload,peer.pair.privateKey),ch=f.channels.find(c=>c.topic.includes('ephemeral'))
    ch.presence={peer:[{...proof,...envelope}]};ch.emit('presence','sync',{});await until(()=>f.session.store.getSnapshot().length===1)
    ch.emit('broadcast','ephemeral:v1',{payload:packEphemeral({...envelope,payload:{...payload,seq:2,x:100}})});await sleep(10);assert.equal(f.session.store.getSnapshot()[0].x,20)
    const next=await signEphemeral({...payload,seq:3,x:50},peer.pair.privateKey);ch.emit('broadcast','ephemeral:v1',{payload:packEphemeral(next)});await until(()=>f.session.store.getSnapshot()[0].x===50)
    ch.emit('broadcast','ephemeral:v1',{payload:packEphemeral(envelope)});await sleep(5);assert.equal(f.session.store.getSnapshot()[0].x,50)
    f.channels.find(c=>c.topic.includes('design')).emit('broadcast','change',{payload:{revision:2,ops:[{type:'remove',pageId:'page-1',id:'shape-1'}]}})
    assert.equal(f.session.store.getSnapshot()[0].selectedId,null)
    ch.presence={};ch.emit('presence','sync',{});await until(()=>f.session.store.getSnapshot().length===0)
    ch.presence={replay:[{...proof,...envelope}]};ch.emit('presence','sync',{});await sleep(10);assert.equal(f.session.store.getSnapshot().length,0)
  }finally{await f.session.close()}
})
test('API outage expires the lease, stops transport and cleans timers without pretending it is a revocation',async()=>{
  const f=fixture();await f.session.start();await f.advance(0);f.fail=Object.assign(Error('offline'),{status:503})
  await f.advance(21000);await f.advance(10000);assert.equal(f.session.stats().channels,0);assert.equal(f.denied,0)
  f.session.pointer({x:90,y:20});await f.advance(100);assert.equal(f.sent.length,0)
  await f.session.close();assert.equal(f.tasks.size,0)
})
test('renewal uses current Auth token; denied state and double mount leave no open channels or timers',async()=>{
  const first=fixture();const pending=first.session.start();await first.session.close();await pending;assert.equal(first.channels.length,0);assert.equal(first.tasks.size,0)
  const f=fixture();await f.session.start();await f.advance(0);f.token='auth-2';await f.advance(21000);await until(()=>f.calls===2)
  f.fail=Object.assign(Error('denied'),{status:403});await f.advance(21000);await until(()=>f.denied===1)
  assert.equal(f.session.stats().channels,0);await f.session.close();assert.equal(f.tasks.size,0)
})
test('late Auth renewal clears capabilities on 401 and recovers with the refreshed token',async()=>{
  const f=fixture();try{await f.session.start();await f.advance(0);f.fail=Object.assign(Error('expired'),{status:401});await f.advance(21000);await until(()=>f.session.stats().channels===0)
    assert.equal(f.denied,0);f.token='new-auth';f.fail=null;await f.advance(1100);await until(()=>f.session.stats().channels===2)
  }finally{await f.session.close()}assert.equal(f.tasks.size,0)
})
test('a temporarily unknown page cannot turn pointer events into repeated context HTTP',async()=>{
  const f=fixture();try{await f.session.start();await f.advance(1000)
    for(let i=0;i<100;i++)f.session.pointer({x:i,y:20},'pending-page')
    await until(()=>f.calls===2);await sleep(20)
    for(let i=0;i<100;i++)f.session.pointer({x:i+1,y:20},'pending-page')
    await f.advance(100);assert.equal(f.calls,2)
  }finally{await f.session.close()}
})
