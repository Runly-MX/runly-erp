import dns from 'node:dns/promises'
import https from 'node:https'
import net from 'node:net'
import { isPublicAddress } from '../../../services/automation-http-service.js'
import { StudioError } from '../../../../../shared/studio/document.js'

export function catalogUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new StudioError('Dirección del recurso no válida.', 400) }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash ||
    !(['api.iconify.design','api.openverse.org','upload.wikimedia.org','live.staticflickr.com'].includes(host) || /^farm[1-9]\.staticflickr\.com$/.test(host))) throw new StudioError('Este origen de recursos no está permitido.', 403, 'CATALOG_ORIGIN_DENIED')
  return url
}
export function publicCatalogAddress(address) {
  return isPublicAddress(address) && (net.isIP(address) === 4 || /^[23][\da-f]{0,3}:/i.test(address) && !/^200[12]:/i.test(address))
}
const messages = { DNS:'No se pudo resolver el proveedor.', CONNECT:'No se pudo conectar con el proveedor.', TLS:'No se pudo establecer una conexión segura con el proveedor.', HEADERS:'El proveedor no respondió a tiempo.', DOWNLOAD:'La descarga del proveedor no terminó a tiempo.' }
const failure = (stage, timeout = false) => new StudioError(messages[stage], timeout ? 504 : 502, `CATALOG_${stage}_${timeout ? 'TIMEOUT' : 'FAILED'}`)

export function createCatalogNetwork({ lookup = dns.lookup, transport = https.request, timeoutMs = 15000, addressAllowed = publicCatalogAddress, observe,
  stageTimeouts = {} } = {}) {
  const limits = { DNS:2000, CONNECT:2000, TLS:2500, HEADERS:5000, DOWNLOAD:5000, ...stageTimeouts }
  async function get(value, { maxBytes = 262144, signal, timeoutMs: total = timeoutMs, onTiming } = {}) {
    const started = Date.now(), deadline = started + Math.max(1, Math.min(30000, total))
    const emit = (host, stage, extra = {}) => { const event={host,stage,elapsedMs:Date.now()-started,...extra}; try { observe?.(event); onTiming?.(event) } catch { /* telemetry cannot change authorization or transport */ } }
    const aborted = () => new StudioError('Solicitud cancelada.', 499, 'CATALOG_CANCELLED')
    const remaining = () => Math.max(1, deadline-Date.now())
    let url = catalogUrl(value)
    for (let redirects=0; redirects<=2; redirects++) {
      if (signal?.aborted) throw aborted()
      if (Date.now()>=deadline) throw failure('HEADERS',true)
      const host=url.hostname
      emit(host,'DNS_START')
      const rows=await new Promise((resolve,reject)=>{
        let settled=false
        const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(result)}
        const cancel=()=>finish(aborted()),timer=setTimeout(()=>finish(failure('DNS',true)),Math.min(limits.DNS,remaining()))
        signal?.addEventListener('abort',cancel,{once:true})
        Promise.resolve().then(()=>lookup(host,{all:true,verbatim:true})).then(result=>finish(null,result),()=>finish(failure('DNS')))
      })
      if (!rows?.length || rows.length>64) throw failure('DNS')
      if (!rows.every(row=>net.isIP(row.address)===row.family && addressAllowed(row.address))) throw new StudioError('El origen resuelve a una red no permitida.',403,'CATALOG_DNS_DENIED')
      emit(host,'DNS_END',{families:rows.map(row=>row.family)})
      // Explicit pinned attempts also bound TLS hangs, which TCP Happy Eyeballs
      // cannot recover from once the first TCP connection has succeeded.
      const groups=[rows.filter(r=>r.family===4),rows.filter(r=>r.family===6)],addresses=[]
      for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const group of groups)if(group[i]&&!addresses.some(row=>row.address===group[i].address))addresses.push(group[i])
      let result,lastError
      for(const [attempt,address] of addresses.slice(0,4).entries()) {
        if (Date.now()>=deadline) break
        try {
          result=await new Promise((resolve,reject)=>{
            let request,response,timer,settled=false,stage='CONNECT'
            const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error){response?.destroy();request?.destroy();reject(error)}else resolve(value)}
            const cancel=()=>finish(aborted())
            const phase=next=>{if(settled)return;stage=next;emit(host,next,{attempt,family:address.family});clearTimeout(timer);timer=setTimeout(()=>finish(failure(stage,true)),Math.min(limits[stage],remaining()))}
            signal?.addEventListener('abort',cancel,{once:true});phase('CONNECT')
            try {request=transport(url,{method:'GET',agent:false,autoSelectFamily:false,family:address.family,servername:host,rejectUnauthorized:true,
              headers:{Accept:'application/json,image/*','User-Agent':'Runly-Studio/1'},
              // Match native dns.lookup's asynchronous contract, including an
              // immediately unreachable route during TLSSocket construction.
              lookup:(_host,options,callback)=>queueMicrotask(()=>options?.all?callback(null,[address]):callback(null,address.address,address.family))},incoming=>{
              response=incoming;clearTimeout(timer)
              const status=response.statusCode??0
              emit(host,'FIRST_BYTE',{attempt,status})
              if([301,302,303,307,308].includes(status)) {const location=response.headers.location;response.destroy();return finish(null,{location})}
              if(status!==200){response.destroy();return finish(new StudioError(status===429?'El proveedor limitó las solicitudes. Espera antes de reintentar.':status===404?'El recurso ya no está disponible.':'El proveedor no está disponible.',status===429?429:status===404?404:502,`CATALOG_UPSTREAM_${status}`))}
              if(Number(response.headers['content-length'])>maxBytes)return finish(new StudioError('El recurso supera el límite permitido.',413,'CATALOG_SIZE_LIMIT'))
              phase('DOWNLOAD');const chunks=[];let size=0
              response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)finish(new StudioError('El recurso supera el límite permitido.',413,'CATALOG_SIZE_LIMIT'));else chunks.push(chunk)})
              response.on('error',()=>finish(failure('DOWNLOAD')))
              response.on('aborted',()=>finish(failure('DOWNLOAD')))
              response.on('close',()=>{if(!settled&&!response.readableEnded)finish(failure('DOWNLOAD'))})
              response.on('end',()=>{emit(host,'COMPLETE',{bytes:size});finish(null,{bytes:Buffer.concat(chunks),mime:String(response.headers['content-type']??'').split(';')[0]})})
            })}catch{finish(failure(stage));return}
            request.on('socket',socket=>{
              // An immediate ENETUNREACH may also be emitted by the TLS socket
              // after ClientRequest has detached it during fallback/destruction.
              socket.on('error',()=>finish(failure(stage)))
              socket.once('connect',()=>phase('TLS'))
              socket.once('secureConnect',()=>phase('HEADERS'))
            })
            request.on('error',()=>finish(failure(stage)))
            try{request.end()}catch{finish(failure(stage))}
          })
          break
        } catch(error) {
          lastError=error;emit(host,'FAILED',{attempt,code:error.code})
          if(!/^CATALOG_(CONNECT|TLS)_/.test(error.code??''))throw error
          if(signal?.aborted)throw aborted()
        }
      }
      if(!result)throw lastError??failure('CONNECT',true)
      if(!('location' in result))return result
      if(redirects===2||!result.location)throw new StudioError('Redirección del proveedor no permitida.',403,'CATALOG_REDIRECT_DENIED')
      url=catalogUrl(new URL(result.location,url).href)
    }
  }
  return { get }
}
