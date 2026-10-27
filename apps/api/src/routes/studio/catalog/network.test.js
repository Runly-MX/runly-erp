import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createCatalogNetwork } from './network.js'

const a={address:'203.0.113.7',family:4},b={address:'203.0.113.8',family:4},v6={address:'2001:db8::7',family:6}
function fixture(plan, options={}) {
  const calls=[],events=[];let destroyed=0
  const network=createCatalogNetwork({lookup:async()=>[a],addressAllowed:row=>[a.address,b.address,v6.address].includes(row),timeoutMs:150,
    stageTimeouts:{DNS:20,CONNECT:20,TLS:20,HEADERS:20,DOWNLOAD:20},observe:event=>events.push(event),
    transport:(url,settings,respond)=>{
      const request=new EventEmitter(),socket=new EventEmitter();request.destroy=()=>{destroyed++}
      calls.push({host:url.hostname,settings})
      request.end=()=>queueMicrotask(()=>{request.emit('socket',socket);plan({url,settings,request,socket,respond,index:calls.length-1})})
      return request
    },...options})
  return {network,calls,events,destroyed:()=>destroyed}
}
function answer({socket,respond},status=200,body='{}',headers={}) {
  socket.emit('connect');socket.emit('secureConnect')
  const response=new PassThrough();response.statusCode=status;response.headers={'content-type':'application/json',...headers};respond(response)
  if(!response.destroyed)response.end(body)
}
test('safe address fallback covers a stalled A, unreachable IPv6 and a second valid A with pinned TLS/SNI',async()=>{
  const f=fixture(call=>{if(call.index===0)return;if(call.index===1){call.request.emit('error',Object.assign(Error('private internals'),{code:'ENETUNREACH'}));return queueMicrotask(()=>call.socket.emit('error',Error('late socket failure')))}answer(call)},{lookup:async()=>[v6,a,b]})
  assert.equal((await f.network.get('https://api.iconify.design/search')).bytes.toString(),'{}')
  assert.deepEqual(f.calls.map(c=>c.settings.family),[4,6,4])
  for(const call of f.calls){assert.equal(call.settings.servername,'api.iconify.design');assert.equal(call.settings.rejectUnauthorized,true);assert.equal(call.settings.autoSelectFamily,false)}
  let pinned
  f.calls[0].settings.lookup('api.iconify.design',{},(...args)=>{pinned=args})
  assert.equal(pinned,undefined)
  await Promise.resolve();assert.deepEqual(pinned,[null,a.address,4])
  assert.equal(f.destroyed(),2)
})
test('DNS/connect/TLS/first-byte/download timeouts have distinct codes and release their resources',async()=>{
  const cases=[['DNS',()=>{}, {lookup:()=>new Promise(()=>{})}],['CONNECT',()=>{}],['TLS',({socket})=>socket.emit('connect')],['HEADERS',({socket})=>{socket.emit('connect');socket.emit('secureConnect')}],['DOWNLOAD',({socket,respond})=>{socket.emit('connect');socket.emit('secureConnect');const response=new PassThrough();response.statusCode=200;response.headers={};respond(response);response.write('partial')}]]
  for(const [stage,plan,options]of cases){const f=fixture(plan,options);await assert.rejects(f.network.get('https://api.openverse.org/v1/images/'),{status:504,code:`CATALOG_${stage}_TIMEOUT`});if(stage!=='DNS')assert.equal(f.destroyed(),1)}
})
test('total budget is shared across redirects and cancellation never starts a late DNS result',async()=>{
  const f=fixture(call=>setTimeout(()=>answer(call,302,'',{location:'https://api.iconify.design/next'}),10),{timeoutMs:25})
  await assert.rejects(f.network.get('https://api.iconify.design/search'),error=>error.status===504)
  assert.ok(f.calls.length<=3)
  const controller=new AbortController(),g=fixture(answer,{lookup:()=>new Promise(resolve=>setTimeout(()=>resolve([a]),10))})
  const promise=g.network.get('https://api.iconify.design/search',{signal:controller.signal});controller.abort()
  await assert.rejects(promise,{status:499});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(g.calls.length,0)
})
test('private/mixed DNS and malicious redirects are refused before reaching their target',async()=>{
  for(const rows of [[],[a,{address:'127.0.0.1',family:4}],[{address:a.address,family:6}]]){
    const f=fixture(answer,{lookup:async()=>rows});await assert.rejects(f.network.get('https://api.iconify.design/search'));assert.equal(f.calls.length,0)
  }
  const f=fixture(call=>answer(call,302,'',{location:'https://127.0.0.1/secrets'}))
  await assert.rejects(f.network.get('https://api.iconify.design/search'),{status:403});assert.equal(f.calls.length,1)
})
test('upstream HTTP errors remain distinct from local timeouts and transport exceptions are sanitized',async()=>{
  for(const status of [429,502,504]){
    const f=fixture(call=>answer(call,status));await assert.rejects(f.network.get('https://api.iconify.design/search'),{status:status===429?429:502,code:`CATALOG_UPSTREAM_${status}`});assert.equal(f.calls.length,1)
  }
  const f=fixture(answer,{transport:()=>{throw Error('secret private URL')}})
  await assert.rejects(f.network.get('https://api.iconify.design/search'),error=>error.code==='CATALOG_CONNECT_FAILED'&&!error.message.includes('secret'))
})
