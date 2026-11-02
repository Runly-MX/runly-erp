import {Hono} from 'hono'
import {websiteAccessFromRequest,websiteErrorHandler} from '../../services/website-authorization-service.js'
import {strictWebsiteHostname} from '../../services/website-gateway-service.js'
import {websiteReleasePath} from '../../services/website-release-service.js'
import {staticArtifactRoute,staticArtifactDirectoryRedirect,websiteIsolatedHeaders} from '../../services/website-static-serving.js'

export function createWebsitePreviewRoutes({previews,requirePermission}) {
  const app=new Hono();app.onError(websiteErrorHandler)
  const args=c=>({companyId:c.get('companyId'),siteId:c.req.param('siteId'),access:websiteAccessFromRequest(c),idempotencyKey:c.req.header('Idempotency-Key')})
  app.post('/sites/:siteId/previews',requirePermission('website.pages.read'),async c=>c.json({data:await previews.create({...await c.req.json(),...args(c)})},201))
  app.delete('/sites/:siteId/previews/:previewId',requirePermission('website.pages.read'),async c=>c.json({data:await previews.revoke({...args(c),previewId:c.req.param('previewId')})}))
  return app
}
// Mounted before CORS/auth/API routers. Preview hosts have exactly this surface.
export function createWebsitePreviewHandler({previews,isolation,gateway,prisma}) {
  return async(c,next)=>{
    let host;try{host=strictWebsiteHostname(c.req.header('host')??new URL(c.req.url).host)}catch{return c.notFound()}
    if(!isolation.isPreviewHost(host))return next()
    const path=c.req.path.replace(/^\/public\/site(?=\/)/,'')
    try {
      websiteIsolatedHeaders(c,{preview:true,adminOrigin:isolation.admin()})
      if(path==='/__preview'&&c.req.method==='GET'){
        await previews.session(host)
        return c.html('<!doctype html><meta name="referrer" content="no-referrer"><title>Vista previa privada</title><p id="state">Abriendo vista previa…</p><script src="/__preview/bootstrap.js"></script>')
      }
      if(path==='/__preview/bootstrap.js'&&c.req.method==='GET'){
        await previews.session(host);c.header('Content-Type','text/javascript')
        return c.body("const token=location.hash.slice(1);history.replaceState(null,'','/__preview');fetch('/__preview/exchange',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({token})}).then(r=>{if(!r.ok)throw Error();location.replace('/')}).catch(()=>document.getElementById('state').textContent='Vista previa no disponible.');")
      }
      if(path==='/__preview/exchange'&&c.req.method==='POST'){
        const body=await c.req.json();c.header('Set-Cookie',await previews.exchange(host,body.token,c.req.header('origin')));return c.body(null,204)
      }
      if(c.req.method!=='GET')return c.notFound()
      const snapshot=await previews.authorize(host,c.req.header('cookie')),m=snapshot.release.manifest
      if(path==='/public/website/resolve'&&m.kind==='builder'){
        const company=await prisma.company.findFirst({where:{id:snapshot.site.companyId,enabled:true},select:{slug:true}})
        const data=gateway.response({...snapshot,company,hostname:host},c.req.query('path')??'/')
        return c.json({...data,site:{...data.site,analyticsMode:'off',turnstileSiteKey:null},dynamic:[],preview:true,capabilities:{formSubmission:false,analytics:false,calendar:false,dynamicCatalog:false}})
      }
      if(path.startsWith('/public/website/releases/')&&m.kind==='builder'){
        const parts=path.split('/'),releaseId=parts[4],digest=parts[6]
        if(releaseId!==snapshot.release.id)return c.notFound()
        const ref=m.assets[digest]??Object.values(m.runtime.assets).find(r=>r.hash===digest)
        if(!ref)return c.notFound();c.header('Content-Type',ref.mime);return c.body(await previews.bytes(ref))
      }
      websiteReleasePath(path)
      if(m.kind==='dist'){
        const file=staticArtifactRoute(m,path,c.req.header('accept')?.includes('text/html'))
        const canonical=staticArtifactDirectoryRedirect(file,path)
        if(canonical)return c.redirect(canonical+new URL(c.req.url).search,308)
        if(!file)return c.notFound();c.header('Content-Type',file.mime);return c.body(await previews.bytes(file))
      }
      if(!m.routes.some(r=>r.path===path))return c.notFound()
      const url=ref=>`/public/website/releases/${snapshot.release.id}/assets/${ref.hash}`,css=m.runtime.assets['style.css']
      return c.html(`<!doctype html><html lang="es" data-preview="true" data-release="${snapshot.release.id}"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css?`<link rel="stylesheet" href="${url(css)}">`:''}</head><body><div id="runly-public-root"></div><script type="module" src="${url(m.runtime.assets['entry.js'])}"></script></body></html>`)
    }catch(e){return websiteErrorHandler(e,c)}
  }
}
