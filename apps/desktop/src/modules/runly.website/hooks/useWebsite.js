import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { createWebsiteApi } from '../lib/websiteApi.js'
import { buildCapabilities } from '../lib/capabilities.js'
import { deriveSiteState } from '../lib/siteState.js'

// Every key carries the company and the site: switching either never reuses
// another tenant's cache (design §7.4). No key depends on the token.
export const websiteKeys = {
  sites: (companyId) => ['website', companyId, 'sites'],
  site: (companyId, siteId) => ['website', companyId, 'site', siteId],
  pages: (companyId, siteId) => ['website', companyId, 'site', siteId, 'pages'],
  draft: (companyId, siteId, pageId) => ['website', companyId, 'site', siteId, 'draft', pageId],
  releases: (companyId, siteId) => ['website', companyId, 'site', siteId, 'releases'],
  release: (companyId, siteId, releaseId) => ['website', companyId, 'site', siteId, 'release', releaseId],
  domains: (companyId, siteId) => ['website', companyId, 'site', siteId, 'domains'],
  all: (companyId) => ['website', companyId],
}

export function useWebsiteApi() {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  return useMemo(() => (token ? createWebsiteApi(token) : null), [token])
}

export function useWebsiteScope() {
  const { activeCompanyId } = useActiveCompany()
  const api = useWebsiteApi()
  return { api, companyId: activeCompanyId, ready: Boolean(api && activeCompanyId) }
}

export function useWebsiteCapabilities() {
  const { userProfile } = useAuth()
  return useMemo(() => {
    const permissions = userProfile?.permissions ?? []
    const hasPermission = (key) => Boolean(userProfile?.isAdmin || permissions.includes(key))
    return buildCapabilities(hasPermission)
  }, [userProfile])
}

export function useSites() {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.sites(companyId),
    queryFn: async ({ signal }) => (await api.listSites({ signal })).data ?? [],
    enabled: ready,
    staleTime: 15_000,
  })
}

export function useSite(siteId) {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.site(companyId, siteId),
    queryFn: async ({ signal }) => (await api.getSite(siteId, { signal })).data,
    enabled: ready && Boolean(siteId),
    staleTime: 10_000,
    retry: (count, error) => error?.status >= 500 && count < 2,
  })
}

export function useRelease(siteId, releaseId) {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.release(companyId, siteId, releaseId),
    queryFn: async ({ signal }) => (await api.getRelease(siteId, releaseId, { signal })).data,
    enabled: ready && Boolean(siteId) && Boolean(releaseId),
    staleTime: 15_000,
  })
}

export function usePages(siteId) {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.pages(companyId, siteId),
    queryFn: async ({ signal }) => (await api.listPages(siteId, { signal })).data ?? [],
    enabled: ready && Boolean(siteId),
    staleTime: 10_000,
  })
}

export function useDomains(siteId) {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.domains(companyId, siteId),
    queryFn: async ({ signal }) => (await api.listDomains(siteId, { signal })).data ?? [],
    enabled: ready && Boolean(siteId),
    staleTime: 15_000,
  })
}

// Site + its active release + derived state, shared by the context bar and screens.
export function useSiteContext(siteId) {
  const site = useSite(siteId)
  const release = useRelease(siteId, site.data?.activeReleaseId ?? null)
  const state = useMemo(() => deriveSiteState(site.data, release.data), [site.data, release.data])
  return { site, release, state }
}
