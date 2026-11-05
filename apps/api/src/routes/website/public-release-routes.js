import {Hono} from 'hono'
import {websiteErrorHandler} from '../../services/website-authorization-service.js'
import {websiteReleasePath} from '../../services/website-release-service.js'
import {websiteIsolatedHeaders} from '../../services/website-static-serving.js'
import {requestOrigin,websiteSeoHead} from '../../services/website-seo-head.js'
import {resolvePublicSupabaseUrl} from '../../lib/supabase-public-url.js'
import {brotliCompressSync,gzipSync,constants as zlib} from 'node:zlib'
// The runtime and stylesheet are content-addressed (the URL carries their hash), so they never change: they are
// compressed once and cached by browsers for a year. A ~1 MB runtime sent raw with no-store took ~5 s on a phone.
const compressed=new Map()
function sendCode(c,hash,bytes,mime) {
  const accept=c.req.header('accept-encoding')??'', encoding=/br/.test(accept)?'br':/gzip/.test(accept)?'gzip':null
  c.header('Content-Type',mime);c.header('Cache-Control','public, max-age=31536000, immutable');c.header('Vary','Accept-Encoding')
  if(!encoding||bytes.length<1024)return c.body(bytes)
  const key=`${encoding}:${hash}`
  if(!compressed.has(key)){if(compressed.size>64)compressed.delete(compressed.keys().next().value);compressed.set(key,encoding==='br'?brotliCompressSync(bytes,{params:{[zlib.BROTLI_PARAM_QUALITY]:9}}):gzipSync(bytes,{level:9}))}
  c.header('Content-Encoding',encoding);return c.body(compressed.get(key))
}
const isCode=mime=>/^text\/(?:javascript|css)/.test(mime??'')
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
export function createPublicReleaseRoutes({gateway,runtime}) {
 const app=new Hono();app.onError(websiteErrorHandler)
 app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');return next()})
 app.get('/releases/:releaseId/assets/:hash',async c=>{
   const result=await gateway.asset(c,c.req.param('releaseId'),c.req.param('hash'))
   if(result.kind==='dist')websiteIsolatedHeaders(c)
   if(result.kind!=='dist'&&isCode(result.mime))return sendCode(c,c.req.param('hash'),Buffer.from(result.bytes),result.mime)
   c.header('Content-Type',result.mime);return c.body(result.bytes)
 })
 app.get('/runtime/:hash',async c=>{
   const files=await runtime(), file=Object.values(files).find(f=>f.hash===c.req.param('hash'))
   if(!file)return c.notFound();return sendCode(c,file.hash,Buffer.from(file.bytes),file.mime)
 })
 return app
}
export async function serveWebsiteRelease(c,gateway,path,runtime,ssr) {
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
 // Tab icon: the site's favicon or logo pinned in this release; without one, an empty icon so the browser does not fall back to the host's /favicon.ico.
 const settings=snapshot.release.manifest.identity?.settings??{}, iconId=settings.faviconFileId||settings.logoFileId
 const icon=snapshot.release.manifest.dynamic?.find(d=>d.kind==='file'&&d.fileId===iconId)
 const iconTag=`<link rel="icon" href="${icon?url(icon):'data:,'}">`
 c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff')
 // Catalog product covers are served straight from Supabase Storage (public bucket or signed URL), not pinned in the release.
 const storage=(()=>{try{return ' '+new URL(resolvePublicSupabaseUrl()).origin}catch{return ''}})()
 c.header('Content-Security-Policy',`default-src 'self'; script-src 'self'${challenge}; frame-src ${turnstile?'https://challenges.cloudflare.com':"'none'"}; style-src 'self' 'unsafe-inline'; img-src 'self' data:${storage}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`)
 // Attributes carry only UUIDs and hex digests. The body is pre-rendered by React from the same release data the
 // runtime fetches (React escapes all tenant text; rich HTML is reduced to plain text on the server), then hydrated.
 const origin=requestOrigin(c), config={company:data.site.company,companySlug:data.site.company,siteId:data.site.id,apiUrl:origin,baseUrl:origin,analyticsMode:data.site.analyticsMode,turnstileSiteKey:data.site.turnstileSiteKey}
 const rendered=ssr?await ssr({releaseId:snapshot.release.id,path,entryHash:ref.hash,page:data.page,theme:data.theme,config}):null
 const body=rendered?`<div id="runly-public-root" data-ssr="${rendered.hydrate?'hydrate':'replace'}">${rendered.html}</div>`:'<div id="runly-public-root"></div>'
 return c.html(`<!doctype html><html lang="es" data-release="${snapshot.release.id}" data-page-id="${data.page.id}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${websiteSeoHead({page:data.page,identity:snapshot.release.manifest.identity,origin:requestOrigin(c)})}${iconTag}${css?`<link rel="stylesheet" href="${url(css)}">`:''}<link rel="modulepreload" href="${url(ref)}"></head><body>${body}<script type="module" src="${url(ref)}"></script></body></html>`)
}
