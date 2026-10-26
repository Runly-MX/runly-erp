import test from 'node:test'
import assert from 'node:assert/strict'
import {abortable,checkAbort} from './abort.js'
test('aborting an export wait does not cancel or swallow independent document synchronization',async()=>{
  let finish,saved=false
  const saving=new Promise(resolve=>{finish=()=>{saved=true;resolve('confirmed')}}),controller=new AbortController()
  const exporting=abortable(saving,controller.signal);controller.abort()
  await assert.rejects(exporting,{name:'AbortError'});assert.equal(saved,false)
  finish();assert.equal(await saving,'confirmed');assert.throws(()=>checkAbort(controller.signal),{name:'AbortError'})
})
