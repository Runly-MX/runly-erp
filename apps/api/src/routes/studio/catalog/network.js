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
    !(['api.iconify.design','api.openverse.org','upload.wikimedia.org','live.staticflickr.com'].includes(host) || /^farm[1-9]\.staticflickr\.com$/.test(host))) {
    throw new StudioError('Este origen de recursos no está permitido.', 403)
  }
  return url
}
export function publicCatalogAddress(address) {
  if (!isPublicAddress(address)) return false
  if (net.isIP(address) === 4) return true
  // Only global IPv6; exclude transition mechanisms, mapped IPv4 and local scopes.
  return /^[23][\da-f]{0,3}:/i.test(address) && !/^200[12]:/i.test(address)
}

export function createCatalogNetwork({ lookup = dns.lookup, transport = https.request, timeoutMs = 8000, addressAllowed = publicCatalogAddress } = {}) {
  async function get(value, { maxBytes = 262144, redirects = 0, signal } = {}) {
    const url = catalogUrl(value)
    if (signal?.aborted) throw new StudioError('Solicitud cancelada.', 499)
    return new Promise((resolve,reject) => {
      let request, settled = false
      const finish = (error,result) => { if (settled) return; settled=true; clearTimeout(timer); signal?.removeEventListener('abort',abort); error ? reject(error) : resolve(result) }
      const abort = () => { request?.destroy(); finish(new StudioError('Solicitud cancelada.',499)) }
      const timer = setTimeout(() => { request?.destroy(); finish(new StudioError('El proveedor tardó demasiado. Reintenta más tarde.',504)) },timeoutMs)
      signal?.addEventListener('abort',abort,{once:true})
      lookup(url.hostname,{all:true,verbatim:true}).then(addresses => {
        if (settled) return
        if (!addresses.length || !addresses.every(row=>addressAllowed(row.address))) return finish(new StudioError('El origen resuelve a una red no permitida.',403))
        request = transport(url,{ method:'GET',servername:url.hostname,headers:{Accept:'application/json,image/*','User-Agent':'Runly-Studio/1'},
          lookup: (_host,options,callback) => options?.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family) },response => {
          const status=response.statusCode ?? 0
          if ([301,302,303,307,308].includes(status)) {
            response.resume()
            if (redirects >= 2 || !response.headers.location) return finish(new StudioError('Redirección del proveedor no permitida.',403))
            let next
            try { next=catalogUrl(new URL(response.headers.location,url).href) } catch(error) { return finish(error) }
            get(next.href,{maxBytes,redirects:redirects+1,signal}).then(result=>finish(null,result),finish);return
          }
          if (status !== 200) { response.resume(); return finish(new StudioError(status===429?'El proveedor limitó las solicitudes. Espera antes de reintentar.':status===404?'El recurso ya no está disponible.':'No se pudo consultar el proveedor.',status===429?429:status===404?404:502)) }
          if (Number(response.headers['content-length'])>maxBytes) { response.destroy(); return finish(new StudioError('El recurso supera el límite permitido.',413)) }
          const chunks=[];let size=0
          response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){response.destroy();finish(new StudioError('El recurso supera el límite permitido.',413))}else chunks.push(chunk)})
          response.on('error',()=>finish(new StudioError('No se pudo leer el recurso.',502)))
          response.on('end',()=>finish(null,{bytes:Buffer.concat(chunks),mime:String(response.headers['content-type']??'').split(';')[0]}))
        })
        request.on('error',()=>finish(new StudioError('No hay conexión con el proveedor.',502))); request.end()
      }).catch(()=>finish(new StudioError('No se pudo resolver o consultar el proveedor.',502)))
    })
  }
  return { get }
}
