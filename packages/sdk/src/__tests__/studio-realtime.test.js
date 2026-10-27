import test from 'node:test'
import assert from 'node:assert/strict'
import {createRunlyClient} from '../index.js'
test('collaboration bootstrap is scoped, authenticated, cancellable and separate from legacy live',async()=>{
  const calls=[],signal=new AbortController().signal
  const client=createRunlyClient({baseUrl:'https://api.example.test',getActiveCompanyId:()=> 'company',fetch:async(url,options)=>{calls.push({url,options});return new Response('{}',{headers:{'Content-Type':'application/json'}})}})
  const input={version:1,sessionId:'a'.repeat(32),publicKey:'public-key-fixture'}
  await client.studio.collaborationContext('design/one',input,'test-token',signal)
  await client.studio.live('design/one',{peek:true},'test-token',signal)
  assert.ok(calls[0].url.endsWith('/designs/design%2Fone/collaboration'));assert.ok(calls[1].url.endsWith('/designs/design%2Fone/live'))
  for(const {options}of calls){assert.equal(options.headers.Authorization,'Bearer test-token');assert.equal(options.headers['X-Runly-Company-Id'],'company');assert.equal(options.headers['X-Runly-Studio-Protocol'],'3');assert.equal(options.signal,signal)}
  assert.deepEqual(JSON.parse(calls[0].options.body),input)
})
