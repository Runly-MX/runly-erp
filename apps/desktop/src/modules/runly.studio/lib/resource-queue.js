// Shared by Files and external catalogs: at most two active thumbnail downloads.
const waiting=[]
let active=0
function pump() {
  while(active<2&&waiting.length) {
    const job=waiting.shift()
    if(job.signal.aborted){job.reject(new DOMException('Cancelado','AbortError'));continue}
    active++
    Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{active--;pump()})
  }
}
export function scheduled(work,signal) {
  if(waiting.length>=48)return Promise.reject(new Error('Vuelve a abrir la biblioteca.'))
  return new Promise((resolve,reject)=>{waiting.push({work,signal,resolve,reject});pump()})
}
