import { catalogUrl } from './network.js'
import { StudioError } from '../../../../../shared/studio/document.js'
// Explicit disposable-stack transport. Cannot redirect to an arbitrary host or
// run without the fresh project's database marker. Production uses HTTPS+DNS pinning.
export function createLocalCatalogFixtureNetwork(prisma,project) {
  return {async get(value,{maxBytes=262144,signal}={}) {
    const url=catalogUrl(value)
    if(!/^runly-studio-e2e-[a-f0-9]{12}$/.test(project))throw new StudioError('Simulador local no autorizado.',503)
    let marker
    try{[marker]=await prisma.$queryRaw`SELECT id FROM runly_studio_test.environment`}catch{throw new StudioError('Simulador local no autorizado.',503)}
    if(marker?.id!==project)throw new StudioError('Simulador local no autorizado.',503)
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000)
    try{
      const response=await fetch(`http://studio-catalog-test:9080${url.pathname}${url.search}`,{headers:{'X-Catalog-Host':url.hostname},redirect:'error',signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal})
      if(!response.ok)throw new StudioError('Proveedor simulado no disponible.',[404,429].includes(response.status)?response.status:502,`CATALOG_UPSTREAM_${response.status}`)
      const chunks=[];let size=0
      for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){controller.abort();throw new StudioError('Recurso demasiado grande.',413)}chunks.push(chunk)}
      return{bytes:Buffer.concat(chunks),mime:String(response.headers.get('content-type')??'').split(';')[0]}
    }catch(error){if(error instanceof StudioError)throw error;throw new StudioError('Sin conexión con el proveedor simulado.',502)}finally{clearTimeout(timer)}
  }}
}
