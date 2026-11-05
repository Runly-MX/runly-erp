import {websiteErrorHandler} from './website-authorization-service.js'
export function createWebsiteOriginGuard({gateway,adminHosts=[]}) {
 const admin=new Set([...adminHosts,'localhost','127.0.0.1'])
 return async(c,next)=>{
   try {
     const host=await gateway.authority(c)
     if(admin.has(host))return next()
     // Unknown public hosts are no more privileged than registered ones.
     // Never expose the administrative router merely because a binding is absent.
     const allowed=/^\/public\/(?:website\/(?:resolve(?:\/|$)|checkout$|account\/|admin-origin-check$|blog(?:\/|$)|releases\/|runtime\/|forms\/)|site\/(?!erp-badge-check)|storefront\/|catalog\/)/.test(c.req.path)
     if(!allowed)return c.json({error:'Recurso no encontrado.'},404)
     return next()
   }catch(error){return websiteErrorHandler(error,c)}
 }
}
