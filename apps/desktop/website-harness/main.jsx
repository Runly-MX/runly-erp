import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import '../src/styles.css'
import { setApiUrl } from '../src/lib/runtimeConfig.js'
import { setActiveCompanyId } from '../src/lib/runly.js'
import SitesRouter, { LegacyEditorRedirect, LegacyPagesRedirect, LegacySettingsRedirect } from '../src/modules/runly.website/screens/sites/SitesRouter.jsx'

setApiUrl(location.origin)
setActiveCompanyId('company-a')
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.classList.add('dark')

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={client}>
    <BrowserRouter>
      <Routes>
        <Route path="/app/m/runly.website/pages/*" element={<LegacyEditorRedirect />} />
        <Route path="/app/m/runly.website/pages" element={<LegacyPagesRedirect />} />
        <Route path="/app/m/runly.website/settings" element={<LegacySettingsRedirect />} />
        <Route path="/app/m/runly.website/*" element={<SitesRouter />} />
        <Route path="*" element={<p>harness: ruta no registrada</p>} />
      </Routes>
    </BrowserRouter>
    <Toaster richColors position="bottom-right" />
  </QueryClientProvider>,
)
