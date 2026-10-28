import { catalogUrl } from './network.js'
import { StudioError } from '../../../../../shared/studio/document.js'
// Explicit disposable-stack transport. Cannot redirect to an arbitrary host or
// run without the fresh project's database marker. Production uses HTTPS+DNS pinning.
// Redirects are followed like production (max 2, each hop re-checked against the provider allowlist).
const BASE=()=>process.env.STUDIO_CATALOG_TEST_URL||'http://studio-catalog-test:9080'
export function createLocalCatalogFixtureNetwork(prisma,project) {
  return {async get(value,{maxBytes=262144,signal,provider,timeoutMs=8000,userAgent}={}) {
    if(!/^runly-studio-e2e-[a-f0-9]{12}$/.test(project))throw new StudioError('Simulador local no autorizado.',503)
    let url=catalogUrl(value,provider)
    let marker
    try{[marker]=await prisma.$queryRaw`SELECT id FROM runly_studio_test.environment`}catch{throw new StudioError('Simulador local no autorizado.',503)}
    if(marker?.id!==project)throw new StudioError('Simulador local no autorizado.',503)
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(8000,timeoutMs)),limit=Date.now()
    try{
      for(let hops=0;hops<=2;hops++){
        const response=await fetch(`${BASE()}${url.pathname}${url.search}`,{headers:{'X-Catalog-Host':url.hostname,...(userAgent?{'X-Catalog-User-Agent':userAgent}:{})},redirect:'manual',signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal})
        if([301,302,303,307,308].includes(response.status)){
          if(hops===2||!response.headers.get('location'))throw new StudioError('Redirección del proveedor no permitida.',403,'CATALOG_REDIRECT_DENIED')
          url=catalogUrl(new URL(response.headers.get('location'),url).href,provider);continue
        }
        if(!response.ok)throw new StudioError('Proveedor simulado no disponible.',[404,429].includes(response.status)?response.status:502,`CATALOG_UPSTREAM_${response.status}`)
        const chunks=[];let size=0
        for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){controller.abort();throw new StudioError('Recurso demasiado grande.',413)}chunks.push(chunk)}
        return{bytes:Buffer.concat(chunks),mime:String(response.headers.get('content-type')??'').split(';')[0]}
      }
    }catch(error){
      if(error instanceof StudioError)throw error
      if(signal?.aborted)throw new StudioError('Solicitud cancelada.',499,'CATALOG_CANCELLED')
      if(controller.signal.aborted||Date.now()-limit>=timeoutMs)throw new StudioError('El proveedor no respondió a tiempo.',504,'CATALOG_HEADERS_TIMEOUT')
      throw new StudioError('Sin conexión con el proveedor simulado.',502)
    }finally{clearTimeout(timer)}
  }}
}
