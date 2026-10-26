import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalogUrl, publicCatalogAddress, createCatalogNetwork } from './network.js'
import { createCatalogCache } from './cache.js'
import { openverseLicense } from '../../../../../shared/studio/licenses.js'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createLocalCatalogFixtureNetwork } from './test-network.js'

test('catalog rejects arbitrary targets, credentials, ports, private DNS and IPv6 transition addresses',async()=>{
  for(const url of ['http://api.iconify.design/search','https://api.iconify.design.evil.test/','https://user@api.iconify.design/','https://api.iconify.design:8443/','https://127.0.0.1/','https://api.iconify.design/#secret'])assert.throws(()=>catalogUrl(url))
  for(const ip of ['127.0.0.1','::1','fc00::1','fe80::1','::ffff:7f00:1','64:ff9b::7f00:1','2002:7f00:1::'])assert.equal(publicCatalogAddress(ip),false)
  let connected=false
  const network=createCatalogNetwork({lookup:async()=>[{address:'127.0.0.1',family:4}],transport:()=>{connected=true}})
  await assert.rejects(network.get('https://api.iconify.design/search'),{status:403});assert.equal(connected,false)
})
test('provider cache expires, evicts and isolates scope without retaining object references',()=>{
  let now=0;const cache=createCatalogCache({clock:()=>now,ttl:20,maxEntries:2,maxBytes:200})
  const value={title:'One'};cache.set('company-a:user-a',value);value.title='Changed'
  assert.equal(cache.get('company-a:user-a').title,'One');assert.equal(cache.get('company-b:user-a'),null)
  cache.set('two',{});cache.set('three',{});assert.equal(cache.get('company-a:user-a'),null)
  now=21;assert.equal(cache.get('two'),null);assert.ok(cache.state().bytes<=200)
})
test('only explicit commercial/adaptation-compatible photo licenses are admitted',()=>{
  for(const license of ['by-nc','by-nd','by-sa','unknown',''])assert.equal(openverseLicense({license,license_version:'4.0'}),null)
  assert.equal(openverseLicense({license:'by',license_version:'4.0'}).attributionRequired,true)
  assert.equal(openverseLicense({license:'cc0',license_version:'1.0'}).attributionRequired,false)
  assert.equal(openverseLicense({license:'by',license_version:'999'}),null)
  assert.equal(openverseLicense({license:{toString:'invalid'},license_version:'4.0'}),null)
  assert.equal(openverseLicense({license:'by',license_version:'4.0',license_url:'https://example.com/license'}),null)
  assert.equal(openverseLicense({license:'by',license_version:'2.0',license_url:'https://creativecommons.org/licenses/by/2.0/de/'}),null)
})

function simulatedResponse(status,headers={},body='{}') {
  let pinned=false,connections=0
  const network=createCatalogNetwork({lookup:async()=>[{address:'203.0.113.7',family:4}],addressAllowed:address=>address==='203.0.113.7',timeoutMs:100,
    transport:(_url,options,respond)=>{
      connections++;options.lookup('api.iconify.design',{},(_error,address)=>{pinned=address==='203.0.113.7'})
      const request=new EventEmitter();request.destroy=()=>{};request.end=()=>queueMicrotask(()=>{
        const response=new PassThrough();response.statusCode=status;response.headers=headers;respond(response);if(!response.destroyed)response.end(body)
      });return request
    }})
  return {network,pinned:()=>pinned,connections:()=>connections}
}
test('catalog transport pins approved DNS answers and bounds redirect chains, response bytes and status failures',async()=>{
  const okay=simulatedResponse(200,{'content-type':'application/json'},'{}')
  assert.equal((await okay.network.get('https://api.iconify.design/search')).bytes.toString(),'{}');assert.equal(okay.pinned(),true)
  const redirect=simulatedResponse(302,{location:'https://127.0.0.1/secret'})
  await assert.rejects(redirect.network.get('https://api.iconify.design/search'),{status:403});assert.equal(redirect.connections(),1)
  const loop=simulatedResponse(302,{location:'https://api.iconify.design/search'})
  await assert.rejects(loop.network.get('https://api.iconify.design/search'),{status:403});assert.equal(loop.connections(),3)
  for(const headers of [{'content-length':'100'},{}]){
    const huge=simulatedResponse(200,headers,'123456789')
    await assert.rejects(huge.network.get('https://api.iconify.design/search',{maxBytes:4}),{status:413})
  }
  for(const status of [404,429])await assert.rejects(simulatedResponse(status).network.get('https://api.iconify.design/search'),{status})
})
test('timeout, aborted requests and mixed public/private DNS responses fail closed',async()=>{
  const stalled=createCatalogNetwork({lookup:()=>new Promise(()=>{}),timeoutMs:10})
  await assert.rejects(stalled.get('https://api.iconify.design/search'),{status:504})
  const controller=new AbortController();const pending=stalled.get('https://api.iconify.design/search',{signal:controller.signal});controller.abort();await assert.rejects(pending,{status:499})
  const mixed=createCatalogNetwork({lookup:async()=>[{address:'203.0.113.7',family:4},{address:'127.0.0.1',family:4}],addressAllowed:address=>address==='203.0.113.7'})
  await assert.rejects(mixed.get('https://api.iconify.design/search'),{status:403})
})
test('local provider simulator requires an exact disposable database marker',async()=>{
  for(const project of ['production','runly-studio-e2e-123456789abc']) {
    const simulator=createLocalCatalogFixtureNetwork({$queryRaw:async()=>[{id:'wrong-project'}]},project)
    await assert.rejects(simulator.get('https://api.iconify.design/search'),{status:503})
  }
})
