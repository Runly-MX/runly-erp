import {releaseBytesHash} from './website-release-storage.js'
import {websiteDocumentHash as hash} from './website-draft-service.js'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'

export function staticArtifactRoute(manifest,path,navigation=false) {
  const files=manifest.files,clean=path.replace(/^\//,'')
  let file=files.find(f=>f.path===clean)
  if(!file&&!/\.[^/]+$/.test(clean))file=files.find(f=>f.path===`${clean.replace(/\/$/,'')}${clean?'/':''}index.html`)??files.find(f=>f.path===clean+'.html')
  if(!file&&navigation&&manifest.routingMode==='spa'&&!/\.[^/]+$/.test(clean))file=files.find(f=>f.path==='index.html')
  return file
}
export function staticArtifactDirectoryRedirect(file,path) {
  return file?.mime==='text/html'&&path!=='/'&&!path.endsWith('/')&&file.path===path.slice(1)+'/index.html'?path+'/':null
}
export function websiteIsolatedHeaders(c,{adminOrigin,preview=false}={}) {
  c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer')
  c.header('Cross-Origin-Resource-Policy','same-origin');c.header('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  c.header('Content-Security-Policy',`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; worker-src 'none'; form-action 'none'; frame-src 'none'; frame-ancestors ${preview?adminOrigin:"'none'"}; sandbox allow-scripts allow-same-origin`)
}
export function createWebsiteStaticServing({prisma,storage,isolation}) {
  async function serve(c,snapshot,path) {
    isolation.publicHost(snapshot.hostname)
    let ref=snapshot.release.manifest.kind==='dist'?staticArtifactRoute(snapshot.release.manifest,path,c.req.header('accept')?.includes('text/html')):null
    if(!ref&&!/\.html?$/.test(path)){
      const binding=await prisma.websitePublicAssetBinding.findUnique({where:{siteId_path:{siteId:snapshot.site.id,path:path.slice(1)}}})
      if(binding&&binding.companyId===snapshot.site.companyId){
        const r=await prisma.websiteRelease.findFirst({where:{id:binding.releaseId,companyId:binding.companyId,siteId:binding.siteId,state:'ready'}})
        if(r&&hash(r.manifest)===r.manifestHash)ref=r.manifest.files?.find(f=>f.path===binding.path&&f.hash===binding.hash&&f.mime!=='text/html')
      }
    }
    if(!ref)return c.notFound()
    websiteIsolatedHeaders(c)
    const canonical=staticArtifactDirectoryRedirect(ref,path)
    if(canonical)return c.redirect(canonical+new URL(c.req.url).search,308)
    const bytes=await storage.get(ref.objectKey)
    if(bytes.length!==ref.size||releaseBytesHash(bytes)!==ref.hash)throw new WebsiteServiceError('Recurso no disponible.',503,'integrity_failed')
    c.header('Content-Type',ref.mime);return c.body(bytes)
  }
  return {serve}
}
