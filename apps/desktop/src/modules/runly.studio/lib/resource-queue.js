// Separate lanes keep an unavailable external provider from occupying Files.
const lanes={files:{waiting:[],active:0},catalog:{waiting:[],active:0}}
function pump(lane) {
  const {waiting}=lane
  while(lane.active<4&&waiting.length) {
    const job=waiting.shift()
    job.dequeue()
    if(job.signal.aborted){job.reject(new DOMException('Cancelado','AbortError'));continue}
    lane.active++
    Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{lane.active--;pump(lane)})
  }
}
export function scheduled(work,signal,laneName='files') {
  const lane=lanes[laneName],{waiting}=lane
  if(signal.aborted)return Promise.reject(new DOMException('Cancelado','AbortError'))
  if(waiting.length>=48)return Promise.reject(Object.assign(new Error('La cola de miniaturas está ocupada. Reintenta este recurso.'),{status:429,code:'CATALOG_QUEUE_BUSY'}))
  return new Promise((resolve,reject)=>{
    let timer
    const cancel=error=>{const index=waiting.indexOf(job);if(index<0)return;waiting.splice(index,1);job.dequeue();reject(error)}
    const abort=()=>cancel(new DOMException('Cancelado','AbortError'))
    const job={work,signal,resolve,reject,dequeue:()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}}
    signal.addEventListener('abort',abort,{once:true})
    timer=setTimeout(()=>cancel(Object.assign(new Error('La cola de miniaturas está ocupada. Reintenta este recurso.'),{status:429,code:'CATALOG_QUEUE_BUSY'})),10000)
    waiting.push(job);pump(lane)
  })
}
