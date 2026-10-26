import { validateDocument } from '../../../../../shared/studio/document.js'
import { applyOps, checkOps, compactOps, diffOps } from '../../../../../shared/studio/operations.js'

// One immutable uncertain batch; newer edits stay in a separate outbox.
export function createStudioSync({document,revision,name,clientId,transport,editor,onStatus,onName,onError,onConflict,
  storage,storageKey,delay=80,gapTimeout=1500,retry=attempt=>Math.min(8000,500*2**attempt),timers=globalThis}) {
  let server=validateDocument(document),local=server,sequence=revision,title=name,outbox=[],outboxName,batch=null,nextBatch=1
  let inflight=false,closed=false,blocked=null,flushTimer,gapTimer,retryTimer,attempt=0,status='synced',render=Promise.resolve(),resyncing=null,version=0
  const buffered=new Map(),waiters=[],touched=new Set()
  const failure=(message,status=0)=>Object.assign(Error(message),{status})
  const work=()=>Boolean(batch||outbox.length||outboxName!==undefined)
  const setStatus=value=>{if(status!==value){status=value;onStatus?.(value)}}
  const persist=()=>{
    if(!storage||!storageKey)return
    try{
      if(work())storage.setItem(storageKey,JSON.stringify({version:1,batch,outbox,outboxName,document:local,revision:sequence,name:title}))
      else storage.removeItem(storageKey)
    }catch(e){onError?.('No se pudo conservar la cola local.',e)}
  }
  try{
    const saved=storage&&storageKey&&JSON.parse(storage.getItem(storageKey))
    if(saved?.version===1){
      checkOps(saved.outbox,10000)
      if(saved.batch){checkOps(saved.batch.ops);if(!/^[a-zA-Z0-9_-]{8,64}$/.test(saved.batch.clientId)||!Number.isSafeInteger(saved.batch.id)||saved.batch.id<1)throw Error('Cola inválida.')}
      local=validateDocument(saved.document);outbox=saved.outbox;outboxName=saved.outboxName;batch=saved.batch;status=work()?'offline':'synced'
      for(const op of [...(batch?.ops??[]),...outbox])if(op.type==='patch')for(const key of [...Object.keys(op.set),...(op.unset??[])])touched.add(`${op.id}:${key}`)
    }
  }catch(e){onError?.('La cola local no se pudo recuperar. El borrador se conserva.',e)}
  const settle=()=>{
    persist()
    if(blocked){waiters.splice(0).forEach(w=>w.reject(blocked));return}
    if(!work()&&!inflight&&!buffered.size&&!resyncing){setStatus('synced');waiters.splice(0).forEach(w=>w.resolve())}
  }
  function collides(ops){return ops.some(op=>op.type==='remove'&&[...touched].some(k=>k.startsWith(`${op.id}:`))||op.type==='patch'&&[...Object.keys(op.set),...(op.unset??[])].some(k=>touched.has(`${op.id}:${k}`)))}
  function draft(reason){
    const properties=new Map()
    for(const key of touched){const colon=key.indexOf(':'),id=key.slice(0,colon),field=key.slice(colon+1),object=local.objects.find(o=>o.id===id);if(!object)continue
      if(!properties.has(id))properties.set(id,{type:'patch',id,set:{},unset:[]})
      if(object[field]===undefined)properties.get(id).unset.push(field);else properties.get(id).set[field]=object[field]
    }
    return {document:local,revision:sequence,name:title,reason,operations:compactOps([...diffOps(server,local),...properties.values()])}
  }
  const remember=reason=>onConflict?.(draft(reason))
  function reconcile(){
    render=render.catch(()=>{}).then(async()=>{
      if(closed||blocked)return
      const target=validateDocument(applyOps(server,[...(batch?.ops??[]),...outbox]))
      if(JSON.stringify(target)===JSON.stringify(local))return
      const generation=version;local=target
      const shown=await editor.apply(target)
      if(shown&&generation===version)local=validateDocument(shown)
      persist()
    })
    return render
  }
  function schedule(wait=delay){if(!closed&&!blocked&&!flushTimer&&!retryTimer)flushTimer=timers.setTimeout(()=>{flushTimer=null;send()},wait)}
  function deny(error=failure('El diseño ya no permite guardar cambios.',403)){
    if(blocked||closed)return
    remember('rejected');blocked=error;[flushTimer,retryTimer,gapTimer].forEach(t=>timers.clearTimeout(t));flushTimer=retryTimer=gapTimer=null
    setStatus('error');onError?.(error.message,error);settle()
  }
  async function send(){
    if(closed||blocked||inflight||(!batch&&!outbox.length&&outboxName===undefined))return
    if(!batch){
      outbox=compactOps(outbox)
      const ops=[]
      while(outbox.length&&ops.length<500){if(ops.length&&JSON.stringify([...ops,outbox[0]]).length>1_050_000)break;ops.push(outbox.shift())}
      batch={clientId,id:nextBatch++,ops,...(outboxName!==undefined?{name:outboxName}:{})};outboxName=undefined
    }
    const sent=batch;inflight=true;persist();setStatus('syncing')
    try{
      const ack=await transport.send({clientId:sent.clientId,batchId:sent.id,ops:sent.ops,...(sent.name!==undefined?{name:sent.name}:{})})
      if(closed||blocked)return
      attempt=0
      if(batch===sent)batch=null
      if(ack.revision>sequence)receive({...ack,clientId:sent.clientId,batchId:sent.id,ops:ack.ops??sent.ops})
      else await resync()
      await render
    }catch(error){
      if(closed||blocked)return
      if(error.status>=400&&error.status<500){deny(error);return}
      if(batch===sent){setStatus('offline');retryTimer=timers.setTimeout(()=>{retryTimer=null;send()},retry(attempt++))}
    }finally{
      inflight=false
      if(!closed&&!blocked&&!retryTimer){if(work())schedule(0);else settle()}
      persist()
    }
  }
  function receive(message){
    if(closed||blocked||!Number.isSafeInteger(message?.revision))return
    if(batch&&message.clientId===batch.clientId&&message.batchId===batch.id)batch=null
    if(message.revision<=sequence){settle();return}
    if(buffered.size>=128&&!buffered.has(message.revision)){resync();return}
    buffered.set(message.revision,message);drain()
  }
  function drain(){
    if(closed||blocked)return
    let applied=false
    try{
      while(buffered.has(sequence+1)){
        const message=buffered.get(sequence+1);buffered.delete(sequence+1)
        if(message.refetch){resync();return}
        checkOps(message.ops??[])
        const affected=message.ops??[]
        if(message.clientId!==clientId&&collides(affected)){remember('last-write-wins');touched.clear()}
        server=validateDocument(applyOps(server,affected));sequence=message.revision;applied=true
        if(message.name!==undefined&&outboxName===undefined&&batch?.name===undefined&&message.name!==title){title=message.name;onName?.(title)}
      }
    }catch(error){onError?.(error.message,error);resync();return}
    timers.clearTimeout(gapTimer);gapTimer=null
    if(buffered.size)gapTimer=timers.setTimeout(()=>{gapTimer=null;resync()},gapTimeout)
    if(applied)reconcile().then(settle,error=>{remember('render');setStatus('error');onError?.(error.message,error)})
  }
  function resync(){
    if(closed||blocked)return Promise.resolve()
    if(resyncing)return resyncing
    resyncing=(async()=>{
      try{
        const latest=await transport.fetch(batch?{clientId:batch.clientId,batchId:batch.id}:undefined)
        if(closed||blocked)return
        if(latest.canEdit===false&&work()){deny(failure('El diseño es de solo lectura.',403));return}
        if(batch&&latest.receipt?.clientId===batch.clientId&&latest.receipt.batchId===batch.id&&latest.receipt.revision<=latest.revision)batch=null
        if(latest.revision>=sequence){
          const next=validateDocument(latest.document)
          if(collides(diffOps(server,next)))remember('reconcile')
          server=next;sequence=latest.revision
          for(const n of buffered.keys())if(n<=sequence)buffered.delete(n)
          if(latest.name!==undefined&&outboxName===undefined&&batch?.name===undefined){title=latest.name;onName?.(title)}
        }
        await reconcile()
        if(work()){setStatus('syncing');schedule(0)}else settle()
      }catch(error){if([401,403,404].includes(error.status))deny(error);else{setStatus('offline');onError?.(error.message,error)}}
      finally{resyncing=null;drain();settle()}
    })()
    return resyncing
  }
  return {
    local(document){
      if(closed||blocked)return
      const next=validateDocument(document),ops=diffOps(local,next);local=next;version++
      if(!ops.length)return
      for(const op of ops)if(op.type==='patch')for(const key of [...Object.keys(op.set),...(op.unset??[])])touched.add(`${op.id}:${key}`)
      outbox=compactOps([...outbox,...ops]);setStatus(status==='offline'?'offline':'syncing');persist();schedule()
    },
    rename(value){if(closed||blocked||value===title)return;title=value;outboxName=value;setStatus('syncing');persist();schedule()},
    receive,resync,deny,draft,start(){closed=false;return resync()},
    changed(n){if(!Number.isSafeInteger(n)||n>sequence)return resync()},
    flush(){
      if(blocked)return Promise.reject(blocked)
      if(closed)return Promise.reject(failure('La sesión de edición está cerrada.'))
      timers.clearTimeout(flushTimer);timers.clearTimeout(retryTimer);flushTimer=retryTimer=null
      const promise=new Promise((resolve,reject)=>waiters.push({resolve,reject}));send();render.then(settle);return promise
    },
    state:()=>({status,revision:sequence,pending:(batch?1:0)+(outbox.length||outboxName!==undefined?1:0),document:local,name:title}),
    close(){persist();closed=true;[flushTimer,gapTimer,retryTimer].forEach(t=>timers.clearTimeout(t));waiters.splice(0).forEach(w=>w.reject(failure('La sesión de edición está cerrada.')))},
  }
}
