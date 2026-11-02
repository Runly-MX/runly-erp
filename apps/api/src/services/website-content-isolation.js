import {getDomain} from 'tldts'
import {strictWebsiteHostname} from './website-gateway-service.js'
import {WebsiteServiceError} from '../routes/website/service-helpers.js'

// Configuration is owned by the installation, never accepted from an API body.
export function createWebsiteContentIsolation({adminOrigin,contentRoot,previewRoot,previewProtocol='https:',previewPort='',localLab=false}={}) {
  const fail=()=>new WebsiteServiceError('El origen aislado no está habilitado.',409,'isolation_required')
  function independent(root) {
    if(!root||!adminOrigin)throw fail()
    const host=strictWebsiteHostname(root),admin=new URL(adminOrigin)
    const domain=getDomain(host,{allowPrivateDomains:true}),adminDomain=getDomain(admin.hostname,{allowPrivateDomains:true})
    if(host==='runly.mx'||host.endsWith('.runly.mx')||host===admin.hostname||domain&&domain===adminDomain)throw fail()
    if(localLab&&host.endsWith('.localhost')&&['localhost','127.0.0.1'].includes(admin.hostname))return host
    if(!domain||!adminDomain||previewProtocol!=='https:')throw fail()
    return host
  }
  function publicHost(host) {const root=independent(contentRoot);const h=strictWebsiteHostname(host);if(h===root||!h.endsWith('.'+root))throw fail();return h}
  function previewHost(label) {return `${label}.${independent(previewRoot)}`}
  function previewOrigin(host) {return `${previewProtocol}//${host}${previewPort?':'+previewPort:''}`}
  function admin(){if(!adminOrigin)throw fail();return new URL(adminOrigin).origin}
  function isPreviewHost(host){const matches=!!previewRoot&&host.endsWith('.'+previewRoot)&&/^[a-f0-9]{32}$/.test(host.slice(0,-previewRoot.length-1));if(matches)independent(previewRoot);return matches}
  return {publicHost,previewHost,previewOrigin,admin,isPreviewHost,localLab}
}
