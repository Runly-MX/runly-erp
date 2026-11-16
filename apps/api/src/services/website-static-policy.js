import {parse} from 'parse5'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'

export const STATIC_CONTENT_POLICY='html-css-v1'
export const isStaticWebsiteContent=manifest=>manifest?.contentMode==='static'&&manifest.staticPolicyVersion===STATIC_CONTENT_POLICY

// This runs in the budgeted ZIP worker. Never execute or silently strip source.
export function validateWebsiteStaticContent(files,texts) {
  const fail=()=>{throw new WebsiteServiceError('La plantilla contiene código ejecutable o contenido no permitido.',422,'static_content_required')}
  const forbidden=new Set(['script','iframe','frame','frameset','object','embed','applet','portal','fencedframe','base','foreignobject','animate','animatemotion','animatetransform','set'])
  for(const file of files) {
    if(!/^(?:text\/(?:html|css|plain)|image\/(?:svg\+xml|png|jpeg|gif|webp|avif|x-icon)|font\/(?:woff2?|ttf)|application\/vnd\.ms-fontobject|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|wav))$/.test(file.mime))fail()
    if(!['text/html','image/svg+xml','text/css'].includes(file.mime))continue
    const text=texts.get(file.path)
    if(typeof text!=='string')fail()
    if(file.mime==='image/svg+xml'&&/<!doctype|<\?(?!xml\s)/i.test(text))fail()
    if(file.mime==='text/css') {
      if(/expression\s*\(|(?:-moz-binding|behavior)\s*:|(?:javascript|vbscript)\s*:/i.test(text))fail()
      continue
    }
    // Parse with scripting disabled, matching the response sandbox (including noscript).
    const pending=[parse(text,{scriptingEnabled:false})]
    while(pending.length) {
      const node=pending.pop(),tag=node.tagName?.toLowerCase().split(':').at(-1)
      if(forbidden.has(tag))fail()
      for(const attr of node.attrs??[]) {
        const name=attr.name.toLowerCase().split(':').at(-1),value=attr.value.replace(/[\u0000-\u0020\u007f]/g,'').toLowerCase()
        if(name.startsWith('on')||name==='srcdoc'||name==='ping'||name==='http-equiv'||name==='is')fail()
        if(/^(?:javascript|vbscript|data|blob):/.test(value)&&['href','src','action','formaction','data','poster'].includes(name)) {
          if(!/^(?:src|poster)$/.test(name)||!/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/.test(value))fail()
        }
        if(tag==='link'&&name==='rel'&&/\b(?:modulepreload|import|manifest|prefetch|preconnect|dns-prefetch)\b/.test(attr.value.toLowerCase()))fail()
      }
      pending.push(...node.childNodes??[])
      if(node.content)pending.push(node.content)
    }
  }
}
