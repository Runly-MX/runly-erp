import test from 'node:test'
import assert from 'node:assert/strict'
import { invalidateRealtimeQuery } from '../realtimeInvalidation.js'
const tick = () => new Promise(resolve=>setImmediate(resolve))

test('multiple listeners batch a query without cancelling in-flight refetches', async context => {
  context.mock.timers.enable({apis:['setTimeout']})
  const calls=[],client={isFetching:()=>0,invalidateQueries:async(filters,options)=>calls.push({filters,options})}
  const waiting=Array.from({length:10},()=>invalidateRealtimeQuery(client,['chat-messages','one']))
  context.mock.timers.tick(40);await Promise.all(waiting)
  assert.equal(calls.length,1)
  assert.deepEqual(calls[0],{filters:{queryKey:['chat-messages','one']},options:{cancelRefetch:false}})
})

test('an event arriving during a fetch gets a later fresh pass', async context => {
  context.mock.timers.enable({apis:['setTimeout']})
  let finish,calls=0
  const client={isFetching:()=>0,invalidateQueries:()=>{calls++;return calls===1?new Promise(resolve=>{finish=resolve}):Promise.resolve()}}
  const a=invalidateRealtimeQuery(client,['chat-conversations']);context.mock.timers.tick(40)
  const b=invalidateRealtimeQuery(client,['chat-conversations']);context.mock.timers.tick(100)
  assert.equal(calls,1)
  finish();await tick();context.mock.timers.tick(40);await Promise.all([a,b])
  assert.equal(calls,2)
})

test('a fetch from before the committed event is followed by a new snapshot', async context => {
  context.mock.timers.enable({apis:['setTimeout']})
  let calls=0
  const client={isFetching:()=>1,invalidateQueries:async()=>{calls++}}
  const result=invalidateRealtimeQuery(client,['notifications']);context.mock.timers.tick(40);await result
  assert.equal(calls,2)
})

test('outages release waiters and do not create an infinite retry timer', async context => {
  context.mock.timers.enable({apis:['setTimeout']})
  let calls=0
  const client={isFetching:()=>0,invalidateQueries:async()=>{calls++;throw Error('offline')}}
  const result=invalidateRealtimeQuery(client,['chat-conversations']);context.mock.timers.tick(40);await result
  context.mock.timers.tick(10000);assert.equal(calls,1)
})
