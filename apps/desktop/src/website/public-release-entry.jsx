// Trusted public runtime only. No ERP shell, auth provider or editor entry.
import React from 'react'
import {createRoot,hydrateRoot} from 'react-dom/client'
import {WebsitePageRenderer} from './WebsitePageRenderer.jsx'
import {setApiUrl} from '../lib/runtimeConfig.js'
async function start() {
  const preview=document.documentElement.dataset.preview==='true'
  const response=await fetch(`/public/website/resolve?path=${encodeURIComponent(location.pathname)}`,{credentials:preview?'same-origin':'omit',cache:'no-store'})
  if(!response.ok)throw new Error('Sitio no disponible')
  const snapshot=await response.json()
  if((snapshot.releaseId??'legacy')!==document.documentElement.dataset.release) {location.reload();return}
  setApiUrl(location.origin)
  window.RUNLY_CONFIG={company:snapshot.site.company,companySlug:snapshot.site.company,siteId:snapshot.site.id,apiUrl:location.origin,baseUrl:location.origin,analyticsMode:snapshot.site.analyticsMode,turnstileSiteKey:snapshot.site.turnstileSiteKey}
  window.ATLAS_CONFIG=window.RUNLY_CONFIG
  const root=document.getElementById('runly-public-root'), tree=<WebsitePageRenderer page={snapshot.page} theme={snapshot.theme}/>
  // Server-rendered pages are adopted in place (no flash, animations keep running); 'replace' pages are re-rendered.
  if(root.dataset.ssr==='hydrate')hydrateRoot(root,tree)
  else createRoot(root).render(tree)
}
// A pre-rendered page stays readable (links and native menus work) even if the runtime cannot start.
start().catch(()=>{const root=document.getElementById('runly-public-root');if(!root.dataset.ssr)root.textContent='Sitio no disponible.'})
