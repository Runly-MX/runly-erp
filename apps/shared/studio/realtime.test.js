import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { createEphemeralKey, signEphemeral, verifyEphemeral, importEphemeralKey, validCertificate, validEphemeral, verifyAttestation, realtimeBytes, createLatestSender, packEphemeral, unpackEphemeral, realtimeSize } from './realtime.js'

const scope={designId:'00000000-0000-4000-8000-000000000001',companyId:'00000000-0000-4000-8000-000000000002',epoch:'4',now:100000}
const certificate={v:1,...scope,actorId:'00000000-0000-4000-8000-000000000003',sessionId:'a'.repeat(32),publicKey:'A'.repeat(87),name:'Persona verificada',role:'EDITOR',issuedAt:99000,expiresAt:129000};delete certificate.now
const pages=[{id:'page-1',width:320,height:240}]
const payload={v:1,sessionId:certificate.sessionId,type:'cursor',seq:1,at:100000,pageId:'page-1',x:10,y:20,selectedId:null,activity:'active'}
test('ephemeral contract rejects scope, expired leases, extra identity and invalid geometry',()=>{
  assert.ok(validCertificate(certificate,scope));assert.ok(validEphemeral(payload,certificate,pages,scope.now))
  for(const change of [{companyId:scope.designId},{epoch:'5'},{expiresAt:100000},{expiresAt:200000},{role:'ADMIN'},{userId:certificate.actorId}])assert.equal(validCertificate({...certificate,...change},scope),false)
  for(const change of [{x:Infinity},{x:-1},{x:321},{x:null},{pageId:'page-2'},{seq:0},{at:90000},{userId:certificate.actorId},{activity:'html'}])assert.equal(validEphemeral({...payload,...change},certificate,pages,scope.now),false)
  assert.equal(validEphemeral(payload,certificate,pages,130000),false)
})
test('client keys cannot be extracted; signatures reject altered fields and another session key',async()=>{
  const first=await createEphemeralKey(),second=await createEphemeralKey(),key=await importEphemeralKey(first.publicKey)
  await assert.rejects(crypto.subtle.exportKey('jwk',first.pair.privateKey))
  const envelope=await signEphemeral(payload,first.pair.privateKey)
  assert.ok(await verifyEphemeral(envelope,key));assert.equal(await verifyEphemeral({...envelope,payload:{...payload,x:30}},key),false)
  assert.equal(await verifyEphemeral(envelope,await importEphemeralKey(second.publicKey)),false)
})

test('compact wire format preserves signed fields, rejects extra slots and does not authorize altered coordinates',async()=>{
  const identity=await createEphemeralKey(),key=await importEphemeralKey(identity.publicKey),envelope=await signEphemeral(payload,identity.pair.privateKey)
  const packed=packEphemeral(envelope),roundTrip=unpackEphemeral(JSON.parse(JSON.stringify(packed)))
  assert.deepEqual(roundTrip,envelope);assert.ok(await verifyEphemeral(roundTrip,key))
  assert.ok(realtimeSize(packed)<realtimeSize(envelope)*.7)
  assert.equal(unpackEphemeral([...packed,'forged actor']),null);assert.equal(unpackEphemeral(envelope),null)
  packed[6]=31;assert.equal(await verifyEphemeral(unpackEphemeral(packed),key),false)
})
test('server attestation proves name, role and session public key without sharing a signing secret',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64url')
  const signature=sign(null,realtimeBytes(certificate),privateKey).toString('base64url')
  assert.ok(await verifyAttestation(certificate,signature,key))
  assert.equal(await verifyAttestation({...certificate,name:'Spoofed'},signature,key),false)
  assert.equal(await verifyAttestation({...certificate,publicKey:'B'.repeat(87)},signature,key),false)
})
test('throttle coalesces latest sample with bounded in-flight work and cancels its timer',async()=>{
  let clock=0,next=0,release;const jobs=new Map(),sent=[]
  const timers={setTimeout(fn,delay){jobs.set(++next,{fn,at:clock+delay});return next},clearTimeout:id=>jobs.delete(id)}
  const step=async time=>{clock=time;for(const [id,j]of [...jobs])if(j.at<=clock){jobs.delete(id);j.fn()}await Promise.resolve();await Promise.resolve()}
  const sender=createLatestSender(async value=>{sent.push(value);if(value===3)await new Promise(r=>{release=r})},{timers,now:()=>clock,interval:100})
  sender.push(1);sender.push(2);sender.push(3);assert.equal(jobs.size,1);await step(0);assert.deepEqual(sent,[3])
  for(let i=4;i<1000;i++)sender.push(i);assert.equal(jobs.size,0);assert.equal(sender.state().pending,true)
  release();await Promise.resolve();await Promise.resolve();await step(99);assert.deepEqual(sent,[3]);await step(100);assert.deepEqual(sent,[3,999])
  sender.push(1000);sender.cancel();await step(1000);assert.deepEqual(sent,[3,999]);assert.equal(jobs.size,0)
})
