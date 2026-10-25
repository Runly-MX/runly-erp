import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import StudioScreen from '../../../apps/desktop/src/modules/runly.studio/screens/StudioScreen.jsx'

createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <BrowserRouter><StudioScreen /></BrowserRouter>
</QueryClientProvider>)
