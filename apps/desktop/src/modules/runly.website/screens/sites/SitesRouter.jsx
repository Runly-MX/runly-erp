import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ErrorState, LoadingState } from '@runly/ui'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { describeError } from '../../lib/websiteErrors.js'
import { parseSitesPath } from '../../lib/sitesPath.js'
import { useSites, useWebsiteScope } from '../../hooks/useWebsite.js'
import SiteEditorScreen from './SiteEditorScreen.jsx'
import SitesListScreen from './SitesListScreen.jsx'
import NewSiteScreen from './NewSiteScreen.jsx'
import WebsiteBlogPostEditorScreen from '../WebsiteBlogPostEditorScreen.jsx'
import SiteWorkspace from './SiteWorkspace.jsx'

// One screen for every /sites/... route. The module resolver maps all of them
// here; the site id always comes from the URL, never from an implicit default.
export default function SitesRouter() {
  const { pathname } = useLocation()
  const route = parseSitesPath(pathname)
  if (route.view === 'new') return <NewSiteScreen />
  if (route.view === 'editor') return <SiteEditorScreen key={`${route.siteId}:${route.pageId}`} siteId={route.siteId} pageId={route.pageId} />
  if (route.view === 'blogEditor') return <WebsiteBlogPostEditorScreen key={route.postId} siteId={route.siteId} postId={route.postId} />
  if (route.view === 'workspace') return <SiteWorkspace key={route.siteId} siteId={route.siteId} section={route.section} />
  return <SitesListScreen />
}

// Legacy entry points (/pages, /settings) land on the company's default site.
export function LegacySectionRedirect({ section }) {
  const sites = useSites()
  if (sites.isPending) return <LoadingState variant="page" />
  if (sites.isError) return <ErrorState title={describeError(sites.error).title} description={describeError(sites.error).message} onRetry={() => sites.refetch()} />
  const active = (sites.data ?? []).filter((site) => site.lifecycle !== 'archived')
  const target = active.find((site) => site.defaultForCompany) ?? active[0]
  return <Navigate replace to={target ? sitePath(target.id, section) : PUBLIC_ROUTE_ROOT} />
}

// /pages/:id/editor (old links, bookmarks) -> /sites/:siteId/pages/:id/editor.
export function LegacyEditorRedirect() {
  const { '*': wildcard } = useParams()
  const pageId = wildcard?.match(/^pages\/([^/]+)\/editor$/)?.[1] ?? null
  const { api, ready } = useWebsiteScope()
  const page = useQuery({
    queryKey: ['website', 'legacy-page', pageId],
    queryFn: async () => (await api.getLegacyPage(pageId)).data,
    enabled: ready && Boolean(pageId),
    retry: false,
  })
  if (!pageId) return <Navigate replace to={PUBLIC_ROUTE_ROOT} />
  if (page.isPending) return <LoadingState variant="page" message="Abriendo el editor…" />
  if (page.isError || !page.data?.siteId) return <Navigate replace to={PUBLIC_ROUTE_ROOT} />
  return <Navigate replace to={`${sitePath(page.data.siteId, `pages/${pageId}/editor`)}`} />
}

export const LegacyPagesRedirect = () => <LegacySectionRedirect section="pages" />
export const LegacySettingsRedirect = () => <LegacySectionRedirect section="settings" />
