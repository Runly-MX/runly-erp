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
  blog: (companyId, siteId) => ['website', companyId, 'site', siteId, 'blog'],
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

export function useSiteState(siteId) {
  const {api,companyId,ready}=useWebsiteScope();const {session}=useAuth();
  return useQuery({queryKey:['website',companyId,'actor',session?.user?.id,'state',siteId],queryFn:async({signal})=>(await api.getState(siteId,{signal})).data,enabled:ready&&Boolean(siteId),staleTime:0,retry:false});
}
export function useWebsiteCapabilities(siteId) {
  const {userProfile}=useAuth(),state=useSiteState(siteId);
  return useMemo(()=>{
    if(!siteId)return buildCapabilities(key=>Boolean(userProfile?.isAdmin||userProfile?.permissions?.includes(key)));
    const raw=state.data,cap=raw?.capabilities??{},permissions=raw?.effectivePermissions??[];
    const unavailable={allowed:false,reason:{code:state.isError?'dependency_unavailable':'loading'}};
    const need=permission=>raw?(permissions.includes(permission)?{allowed:true}:{allowed:false,reason:{code:'permission_denied',requiredPermission:permission}}):unavailable;
    const get=key=>cap[key]??unavailable;
    return {siteRead:need('website.site.read'),siteEdit:get('site.edit'),pagesRead:need('website.pages.read'),pagesCreate:get('pages.create'),pagesUpdate:get('pages.update'),pagesDelete:get('pages.delete'),publish:get('pages.publish'),archive:get('site.archive'),reserveHostname:get('domains.reserve'),importZip:get('import.zip'),previewSite:get('preview.site'),previewDraft:get('preview.site').allowed&&permissions.includes('website.pages.update')?{allowed:true}:unavailable,formsRead:need('website.forms.read'),formsPublish:get('forms.publish'),calendarPublish:get('calendar.publish'),customDomain:get('domains.custom')};
  },[siteId,state.data,state.isError,userProfile]);
}

// One session permission as a capability ({ allowed, reason }); the server re-checks.
export function useSessionPermission(permissionKey) {
  const { userProfile } = useAuth()
  const allowed = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes(permissionKey))
  return allowed ? { allowed: true } : { allowed: false, reason: { code: 'permission_denied', requiredPermission: permissionKey } }
}

export function useSites() {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.sites(companyId),
    queryFn: async ({ signal }) => Promise.all(((await api.listSites({signal})).data??[]).map(async row=>({...row,...(await api.getState(row.id,{signal})).data}))),
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
    queryFn: async ({ signal }) => ((await api.listPages(siteId,{signal})).data??[]).map(row=>({...row,...row.draftMetadata})),
    enabled: ready && Boolean(siteId),
    staleTime: 10_000,
  })
}

export function useBlogPosts(siteId) {
  const { api, companyId, ready } = useWebsiteScope()
  return useQuery({
    queryKey: websiteKeys.blog(companyId, siteId),
    queryFn: async ({ signal }) => (await api.listBlogPosts(siteId, { signal })).data ?? [],
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
  const authoritative = useSiteState(siteId)
  const release = useRelease(siteId, site.data?.activeReleaseId ?? null)
  const state = useMemo(() => deriveSiteState({...site.data,...authoritative.data}, release.data), [site.data, release.data,authoritative.data])
  return { site:{...site,data:site.data?{...site.data,...authoritative.data}:site.data}, release, state,authoritative }
}
