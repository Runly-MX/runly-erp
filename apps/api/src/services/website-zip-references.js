import {Worker} from 'node:worker_threads'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'

// Parsing untrusted source is CPU work too: a stalled regex/parser must never
// block the API event loop or prevent the job deadline from firing.
export function validateWebsiteZipReferences(files,texts,{timeout=30000}={}) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./website-zip-reference-worker.js',import.meta.url),{workerData:{files,texts:[...texts]},resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4}})
    let settled=false
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();if(error)reject(error);else resolve()}
    const fail=(code,status=413)=>new WebsiteServiceError('El artefacto supera el presupuesto de validación.',status,code)
    const timer=setTimeout(()=>finish(fail('archive_timeout')),Math.max(1,timeout))
    worker.once('message',result=>finish(result.ok?null:fail(result.code??'invalid_archive',result.status??422)))
    worker.once('error',()=>finish(fail('reference_budget_exceeded')))
    worker.once('exit',()=>{if(!settled)finish(fail('reference_budget_exceeded'))})
  })
}
