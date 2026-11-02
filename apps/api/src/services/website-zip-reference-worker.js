import {parentPort,workerData} from 'node:worker_threads'
import {validateStaticReferences} from './website-zip-policy.js'
// Only our parser executes. Imported scripts are strings, never evaluated.
try{validateStaticReferences(workerData.files,new Map(workerData.texts));parentPort.postMessage({ok:true})}
catch(error){parentPort.postMessage({ok:false,code:error.code??'invalid_archive',status:error.status??422})}
