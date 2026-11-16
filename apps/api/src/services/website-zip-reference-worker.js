import {parentPort,workerData} from 'node:worker_threads'
import {validateStaticReferences} from './website-zip-policy.js'
import {validateWebsiteStaticContent} from './website-static-policy.js'
// Only our parser executes. Imported scripts are strings, never evaluated.
try{
  const texts=new Map(workerData.texts)
  if(workerData.contentMode==='static')validateWebsiteStaticContent(workerData.files,texts)
  validateStaticReferences(workerData.files,texts)
  parentPort.postMessage({ok:true})
}
catch(error){parentPort.postMessage({ok:false,code:error.code??'invalid_archive',status:error.status??422})}
