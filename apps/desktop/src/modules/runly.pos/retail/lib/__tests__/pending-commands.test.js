import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPendingCommand,createOrderWorkflow,pendingForSession} from '../pendingCommands.js'

function storage(){const data=new Map();return{getItem:(k)=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:(k)=>data.delete(k),key:(i)=>[...data.keys()][i],get length(){return data.size}}}
const metadata={userId:'u',companyId:'c',sessionId:'s',prefix:'pos-cash'}
const key='runly.pos.pending.v1:u:c:cash'

test('lost cash response survives remount, freezes body/key and does not send a second movement',async()=>{
  const store=storage(),seen=new Map();let count=0,lost=true
  const send=async(body,opts)=>{
    if(!seen.has(opts.idempotencyKey))seen.set(opts.idempotencyKey,{data:{id:++count,...body}})
    if(lost){lost=false;throw new TypeError('response lost')}
    return seen.get(opts.idempotencyKey)
  }
  const first=createPendingCommand({key,metadata,storage:store}),body={kind:'IN',amount:'10.00',reason:'Conteo'}
  await assert.rejects(first.execute(body,send),/response lost/)
  const attempt=first.read()
  const remounted=createPendingCommand({key,metadata,storage:store})
  await assert.rejects(remounted.execute({...body,amount:'20.00'},send),{code:'PENDING_OPERATION'})
  const a=remounted.execute(attempt.body,send),b=remounted.execute(attempt.body,send)
  assert.equal(a,b);assert.equal((await a).data.amount,'10.00');assert.equal(count,1);assert.equal(remounted.read(),null)
});

test('order create and add resume exact steps after navigation and response loss',async()=>{
  for(const lostAction of ['createOrder','addLine']){
    const store=storage(),seen=new Map(),bodies=[];let orders=0,lines=0,dropped=false
    const send=async(step)=>{
      bodies.push(JSON.stringify({body:step.body,key:step.key}))
      if(!seen.has(step.key))seen.set(step.key,{data:{id:'order',version:step.action==='createOrder'?++orders:2,quantity:step.action==='addLine'?++lines:0}})
      if(step.action===lostAction&&!dropped){dropped=true;throw new TypeError('response lost')}
      return seen.get(step.key)
    }
    const make=()=>createOrderWorkflow({key,metadata,send,onOrder:()=>{},storage:store})
    const steps=[{action:'createOrder',input:{outletId:'o',terminalId:'t',sessionId:'s'}},{action:'addLine',input:{productId:'p',quantity:'1'}}]
    await assert.rejects(make().start({steps}),/response lost/)
    const pending=make().read().steps[0];const original=JSON.stringify({body:pending.body,key:pending.key})
    assert.equal((await make().resume()).quantity,1)
    assert.equal(orders,1);assert.equal(lines,1);assert.ok(bodies.filter((b)=>b===original).length>=2);assert.equal(make().read(),null)
  }
});

test('pending work blocks only its user/company/session and preserves unknown outcomes after permission changes',async()=>{
  const store=storage(),command=createPendingCommand({key,metadata,storage:store}),body={amount:'10.00'}
  await assert.rejects(command.execute(body,async()=>{throw new TypeError('lost')}))
  await assert.rejects(command.execute(body,async()=>{throw Object.assign(new Error('revoked'),{status:403})}))
  assert.ok(command.read())
  assert.equal(pendingForSession({userId:'u',companyId:'c',sessionId:'s'},store).length,1)
  assert.equal(pendingForSession({userId:'other',companyId:'c',sessionId:'s'},store).length,0)
  assert.equal(pendingForSession({userId:'u',companyId:'other',sessionId:'s'},store).length,0)
  await assert.rejects(command.execute(body,async()=>{throw Object.assign(new Error('invalid'),{status:400})}))
  assert.equal(command.read(),null)
});

test('storage failure stops dispatch and an empty workflow does not leave a pending operation',async()=>{
  let sent=0
  const broken={getItem:()=>null,setItem:()=>{throw new Error('quota')}}
  await assert.rejects(createPendingCommand({key,metadata,storage:broken}).execute({},async()=>{sent++}),{code:'RECOVERY_STORAGE_UNAVAILABLE'})
  assert.equal(sent,0)
  const store=storage(),workflow=createOrderWorkflow({key,metadata,storage:store,send:async()=>{},onOrder:()=>{}})
  assert.equal(await workflow.start({steps:[],order:null}),null);assert.equal(workflow.read(),null)
});

test('a lost close remains recoverable for its terminal after currentSession disappears',async()=>{
  const store=storage(),command=createPendingCommand({key,metadata:{...metadata,prefix:'pos-close',terminalId:'t'},storage:store})
  await assert.rejects(command.execute({countedCashAmount:'10.00'},async()=>{throw new TypeError('lost after close')}))
  assert.equal(pendingForSession({userId:'u',companyId:'c',terminalId:'t'},store).length,1)
  assert.equal(pendingForSession({userId:'u',companyId:'c',terminalId:'other'},store).length,0)
  await command.execute(command.read().body,async()=>({data:{status:'CLOSED'}}))
  assert.equal(pendingForSession({userId:'u',companyId:'c',terminalId:'t'},store).length,0)
});
