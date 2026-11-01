import {newAttemptKey} from './retailErrors.js'

const PREFIX='runly.pos.pending.v1:'
export const pendingKey=(userId,companyId,resource)=>`${PREFIX}${userId}:${companyId}:${resource}`
export function readPending(key,storage=globalThis.localStorage){
  const raw=storage?.getItem(key)
  return raw?JSON.parse(raw):null
}
export function writePending(key,value,storage=globalThis.localStorage){
  try{
    if(!storage)throw new Error('Storage unavailable')
    if(value)storage.setItem(key,JSON.stringify(value));else storage.removeItem(key)
  }catch{throw Object.assign(new Error('No se pudo conservar el intento. Habilita el almacenamiento local antes de operar.'),{code:'RECOVERY_STORAGE_UNAVAILABLE',status:409})}
  globalThis.window?.dispatchEvent(new Event('runly:pos-pending'))
}
export function pendingForSession({userId,companyId,sessionId,terminalId},storage=globalThis.localStorage){
  if(!storage||!userId||!companyId||(!sessionId&&!terminalId))return []
  const rows=[]
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i)
    if(!key?.startsWith(`${PREFIX}${userId}:${companyId}:`))continue
    const record=readPending(key,storage)
    if(record&&((sessionId&&(record.sessionId===sessionId||record.body?.sessionId===sessionId))||(terminalId&&(record.terminalId===terminalId||(record.prefix==='pos-open'&&record.body?.terminalId===terminalId)))))rows.push({...record,storageKey:key})
  }
  return rows
}
export function createPendingCommand({key,metadata,storage=globalThis.localStorage}){
  let flight=null
  return{
    read:()=>readPending(key,storage),
    execute(body,send){
      if(flight)return flight
      flight=(async()=>{
        let record=readPending(key,storage)
        const recovered=Boolean(record)
        if(record&&JSON.stringify(record.body)!==JSON.stringify(body))throw Object.assign(new Error('Recupera el intento pendiente antes de cambiar los datos.'),{code:'PENDING_OPERATION',status:409})
        record??={...metadata,body,key:newAttemptKey(metadata.prefix)}
        writePending(key,record,storage)
        try{
          const result=await send(record.body,{idempotencyKey:record.key})
          writePending(key,null,storage)
          return result
        }catch(error){
          if(error.status&&error.status<500&&![408,...(recovered?[401,403]:[])].includes(error.status)&&!['company_changed','PENDING_OPERATION','RECOVERY_STORAGE_UNAVAILABLE'].includes(error.code))writePending(key,null,storage)
          throw error
        }
      })().finally(()=>{flight=null})
      return flight
    },
  }
}

// The workflow is a journal of already requested server commands, not an
// offline sales engine. Every step freezes path/body/key before sending it.
export function createOrderWorkflow({key,metadata,send,onOrder,storage=globalThis.localStorage}){
  let flight=null
  function read(){return readPending(key,storage)}
  async function drain(){
    let state=read()
    while(state?.steps.length){
      const step=state.steps[0]
      if(!step.body){
        step.body={...step.input,...(step.action==='createOrder'?{}:{expectedVersion:state.order.version})}
        step.orderId=state.order?.id??null
        writePending(key,state,storage)
      }
      try{
        const retried=Boolean(step.attempted)
        step.attempted=true
        writePending(key,state,storage)
        step.retried=retried
        const order=(await send(step)).data
        // Persist the acknowledged order before removing an attempt. A crash
        // between steps therefore resumes the original chain and its keys.
        state={...state,order,steps:state.steps.slice(1)}
        onOrder(order)
        writePending(key,state.steps.length?state:null,storage)
      }catch(error){
        if(error.status&&error.status<500&&![408,...(step.retried?[401,403]:[])].includes(error.status)&&!['company_changed','RECOVERY_STORAGE_UNAVAILABLE'].includes(error.code))writePending(key,null,storage)
        throw error
      }
    }
    return state?.order??null
  }
  return{
    read,
    start(intent){
      if(flight)return flight
      if(read())return Promise.reject(Object.assign(new Error('Recupera la operación pendiente antes de iniciar otra.'),{code:'PENDING_OPERATION',status:409}))
      if(!intent.steps.length)return Promise.resolve(intent.order??null)
      writePending(key,{...metadata,order:intent.order??null,steps:intent.steps.map((s)=>({...s,key:newAttemptKey(`pos-${s.action}`)}))},storage)
      return this.resume()
    },
    resume(){if(!flight)flight=drain().finally(()=>{flight=null});return flight},
  }
}
