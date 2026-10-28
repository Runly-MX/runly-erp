import test from 'node:test'
import assert from 'node:assert/strict'
import { shareMessages, shareBroadcasts } from '../sharedSubscriptions.js'
const tick = () => new Promise(resolve=>setImmediate(resolve))
function fixture() {
  const channels=[],removed=[]
  const client={channel(topic,options){
    const bindings=[]
    const channel={topic,options,on(type,filter,handler){bindings.push({type,filter,handler});return this},subscribe(callback){this.status=callback;return this},emit(type,event,payload){for(const binding of bindings)if(binding.type===type&&(binding.filter.event==='*'||binding.filter.event===event))binding.handler(type==='broadcast'?{...payload,event}:payload)}}
    channels.push(channel);return channel
  },async removeChannel(channel){removed.push(channel)}}
  return {client,channels,removed}
}
test('main and floating message consumers retain independent handlers and one channel', async () => {
  const {client,channels,removed}=fixture(),a=[],b=[]
  const first=shareMessages(client,'one',event=>a.push(event)),second=shareMessages(client,'one',event=>b.push(event))
  await tick();assert.equal(channels.length,1)
  channels[0].emit('postgres_changes','INSERT',{id:1});assert.equal(a.length,1);assert.equal(b.length,1)
  first();await tick();assert.equal(removed.length,0)
  channels[0].emit('postgres_changes','UPDATE',{id:1});assert.equal(a.length,1);assert.equal(b.length,2)
  second();await tick();assert.equal(removed.length,1)
})
test('broadcast consumers can add distinct events without stealing a joined topic', async () => {
  const {client,channels,removed}=fixture(),events=[]
  const a=shareBroadcasts(client,'chat:conv:one',{new_guest_message:()=>events.push('message')},{config:{private:true}})
  await tick()
  const b=shareBroadcasts(client,'chat:conv:one',{guest_typing:()=>events.push('typing')},{config:{private:true}})
  channels[0].emit('broadcast','new_guest_message',{});channels[0].emit('broadcast','guest_typing',{})
  assert.deepEqual(events,['message','typing']);assert.equal(channels.length,1)
  a();await tick();assert.equal(removed.length,0);b();await tick();assert.equal(removed.length,1)
})
test('StrictMode remount coalesces ownership; asynchronous removal completes before reconnect', async () => {
  const {client,channels}=fixture()
  let finish
  client.removeChannel=()=>new Promise(resolve=>{finish=resolve})
  const a=shareMessages(client,'one',()=>{});await tick();a()
  const b=shareMessages(client,'one',()=>{});await tick();assert.equal(channels.length,1)
  b();await tick();const c=shareMessages(client,'one',()=>{});await tick();assert.equal(channels.length,1)
  finish();await tick();assert.equal(channels.length,2);c();await tick();finish();await tick()
})
test('reconnect reconciles every owner and changing accounts retires old listeners', async () => {
  const {client,channels,removed}=fixture();let recoveries=0,oldEvents=0
  const a=shareMessages(client,'one',()=>oldEvents++,{ownerId:'old',onReconnect:()=>recoveries++})
  await tick();channels[0].status('SUBSCRIBED');channels[0].status('CHANNEL_ERROR');channels[0].status('SUBSCRIBED');assert.equal(recoveries,1)
  const b=shareMessages(client,'one',()=>{},{ownerId:'new'});await tick();assert.equal(removed.length,1);assert.equal(channels.length,2)
  channels[0].emit('postgres_changes','INSERT',{});assert.equal(oldEvents,0)
  a();b();await tick()
})
