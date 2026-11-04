import {Hono} from 'hono'
import {websiteErrorHandler} from '../../services/website-authorization-service.js'
import {websiteReleasePath} from '../../services/website-release-service.js'
import {websiteIsolatedHeaders} from '../../services/website-static-serving.js'
import {requestOrigin,websiteSeoHead} from '../../services/website-seo-head.js'
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
export function createPublicReleaseRoutes({gateway,runtime}) {
 const app=new Hono();app.onError(websiteErrorHandler)
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');return next()})
 app.get('/releases/:releaseId/assets/:hash',async c=>{
   const result=await gateway.asset(c,c.req.param('releaseId'),c.req.param('hash'))
   if(result.kind==='dist')websiteIsolatedHeaders(c)
   c.header('Content-Type',result.mime);return c.body(result.bytes)
 })
 app.get('/runtime/:hash',async c=>{
   const files=await runtime(), file=Object.values(files).find(f=>f.hash===c.req.param('hash'))
   if(!file)return c.notFound();c.header('Content-Type',file.mime);return c.body(file.bytes)
 })
 return app
}
export async function serveWebsiteRelease(c,gateway,path,runtime) {
 const snapshot=await gateway.resolve(c)
 const turnstile=snapshot.release?snapshot.release.manifest.dynamic?.some(d=>d.kind==='form')&&snapshot.release.manifest.identity.turnstileSiteKey:snapshot.site.turnstileSiteKey
 const challenge=turnstile?' https://challenges.cloudflare.com':''
 websiteReleasePath(path)
 if(snapshot.release?.manifest.kind==='dist')return gateway.staticContent(c,snapshot,path)
 if(!snapshot.release) {
   if(snapshot.site.sourceType!=='builder')return null
   // Historical URLs remain on a standalone public runtime, never the ERP SPA.
   const files=await runtime(), js=files['entry.js'], css=files['style.css']
   c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff')
   // Historical JSON is untrusted too. Preserve external legacy images while
   // denying executable markup, workers and administrative shell fallbacks.
   c.header('Content-Security-Policy',`default-src 'self'; script-src 'self'${challenge}; frame-src ${turnstile?'https://challenges.cloudflare.com':"'none'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; worker-src 'none'`)
   return c.html(`<!doctype html><html lang="es" data-release="legacy"><head><meta charset="utf-8">${css?`<link rel="stylesheet" href="/public/website/runtime/${css.hash}">`:''}</head><body><div id="runly-public-root"></div><script type="module" src="/public/website/runtime/${js.hash}"></script></body></html>`)
 }
 websiteReleasePath(path)
 const data=gateway.response(snapshot,path)
 if(!data.page&&/\.[^/]+$/.test(path)&&! /\.html?$/i.test(path))return gateway.staticContent(c,snapshot,path)
 if(!data.page)return c.text('Página no encontrada.',404)
 const ref=snapshot.release.manifest.runtime.assets['entry.js'], css=snapshot.release.manifest.runtime.assets['style.css']
 const url=ref=>`/public/website/releases/${snapshot.release.id}/assets/${ref.hash}`
 c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff')
 c.header('Content-Security-Policy',`default-src 'self'; script-src 'self'${challenge}; frame-src ${turnstile?'https://challenges.cloudflare.com':"'none'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`)
 // Only UUIDs and computed hex digests enter the shell; tenant text is fetched as JSON.
 return c.html(`<!doctype html><html lang="es" data-release="${snapshot.release.id}" data-page-id="${data.page.id}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${websiteSeoHead({page:data.page,identity:snapshot.release.manifest.identity,origin:requestOrigin(c)})}${css?`<link rel="stylesheet" href="${url(css)}">`:''}</head><body><div id="runly-public-root"></div><script type="module" src="${url(ref)}"></script></body></html>`)
}
