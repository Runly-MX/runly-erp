// Disposable lab mounts the actual ERP dialog/editor. Session comes from real local Supabase Auth.
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {AuthContext} from '../../../apps/desktop/src/auth/AuthProvider.jsx'
import {setActiveCompanyId} from '../../../apps/desktop/src/lib/runly.js'
import {MarketplaceWebsiteDialog} from '../../../apps/desktop/src/website/MarketplaceWebsiteDialog.jsx'
import WebsitePageEditorScreen from '../../../apps/desktop/src/modules/runly.website/screens/WebsitePageEditorScreen.jsx'
const data=await(await fetch('/lab/session')).json()
setActiveCompanyId(data.companyId)
const client=new QueryClient()
function Fixture(){const [installed,setInstalled]=useState(()=>JSON.parse(sessionStorage.getItem('website-w3-installed')??'null'));return <QueryClientProvider client={client}><BrowserRouter><AuthContext.Provider value={{session:data.session}}>{installed?<WebsitePageEditorScreen pageId={installed.firstPageId}/>:<MarketplaceWebsiteDialog open token={data.session.access_token} initialResource={data.resource} siteId={data.siteId} onOpenChange={()=>{}} onInstalled={result=>{sessionStorage.setItem('website-w3-installed',JSON.stringify(result));setInstalled(result)}}/>}</AuthContext.Provider></BrowserRouter></QueryClientProvider>}
createRoot(document.getElementById('root')).render(<Fixture/> )
