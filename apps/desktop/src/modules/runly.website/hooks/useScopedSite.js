import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { companyFetch } from '../../../lib/companyFetch.js'
import { getApiUrl } from '../../../lib/runtimeConfig.js'

// The screens that predate multisite read `{ data: site }` from a query. With a
// siteId they read that site (GET /website/sites/:id); without one they keep the
// historical behaviour (the company's default site), so old routes still work.
export function useScopedSite(siteId = null) {
  const { session } = useAuth()
  const token = session?.access_token
  return useQuery({
    queryKey: siteId ? ['website-site', siteId, token] : ['website-site', token],
    queryFn: async () => {
      const res = await companyFetch(`${getApiUrl()}${siteId ? `/website/sites/${siteId}` : '/website/site'}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    enabled: Boolean(token),
    staleTime: 60_000,
  })
}
