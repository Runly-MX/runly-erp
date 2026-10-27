import test from 'node:test'
import assert from 'node:assert/strict'
import {scheduled}from'./resource-queue.js'
test('a saturated external queue does not block Files and queued cancellation is immediate',async()=>{
  const controller=new AbortController(),releases=[]
  const active=Array.from({length:4},()=>scheduled(()=>new Promise(resolve=>releases.push(resolve)),controller.signal,'catalog'))
  await new Promise(resolve=>setImmediate(resolve))
  const waitingController=new AbortController(),pending=scheduled(()=>{throw Error('cancelled task started')},waitingController.signal,'catalog')
  waitingController.abort();await assert.rejects(pending,{name:'AbortError'})
  assert.equal(await scheduled(async()=> 'private-file',controller.signal),'private-file')
  releases.forEach(resolve=>resolve());await Promise.all(active)
})
