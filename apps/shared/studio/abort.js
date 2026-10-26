export function checkAbort(signal){if(signal?.aborted)throw new DOMException('Exportación cancelada.','AbortError')}

// Stops waiting without cancelling independent work such as document sync.
export function abortable(promise,signal){
  if(!signal)return promise
  checkAbort(signal)
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new DOMException('Exportación cancelada.','AbortError'))
    signal.addEventListener('abort',abort,{once:true})
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))
  })
}
