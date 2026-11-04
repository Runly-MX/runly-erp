import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, ChipTabs, ErrorState, LoadingState } from '@runly/ui'
import { Archive, LayoutTemplate, Menu, Palette } from 'lucide-react'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT } from '../../lib/pageRoute.js'
import { SECTIONS } from '../../lib/siteSections.js'
import { usePages, useSiteContext, useSites, useWebsiteCapabilities } from '../../hooks/useWebsite.js'
import { SiteContextBar } from '../../components/SiteContextBar.jsx'
import { PublishSheet } from '../../components/PublishSheet.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'
import SiteOverview from './SiteOverview.jsx'
import SitePages from './SitePages.jsx'
import SitePublishing from './SitePublishing.jsx'
import SiteDomains from './SiteDomains.jsx'
import SiteSettings from './SiteSettings.jsx'
import SiteImport from './SiteImport.jsx'
import SiteCatalog from './SiteCatalog.jsx'

const FormsScreen = lazy(() => import('../WebsiteFormsScreen.jsx'))
const BlogScreen = lazy(() => import('../WebsiteBlogScreen.jsx'))
const ThemeScreen = lazy(() => import('../WebsiteThemeScreen.jsx'))
const MenusScreen = lazy(() => import('../WebsiteMenusScreen.jsx'))
const TemplatesScreen = lazy(() => import('../WebsiteTemplatesScreen.jsx'))
const PaymentsScreen = lazy(() => import('../WebsitePaymentsScreen.jsx'))
const AdvancedSettingsScreen = lazy(() => import('../WebsiteSettingsScreen.jsx'))

const Lazy = ({ children }) => <Suspense fallback={<LoadingState variant="page" />}>{children}</Suspense>

// Template application still writes through the historical default-site flow
// (non-atomic, no revisioned drafts), so it is only offered for that site.

const APPEARANCE_TABS = [
  { value: 'theme', label: 'Tema', icon: Palette },
  { value: 'menus', label: 'Menús', icon: Menu },
  { value: 'templates', label: 'Plantillas', icon: LayoutTemplate },
]

function Appearance({ siteId }) {
  const [tab, setTab] = useState('theme')
  return (
    <div>
      <div className="px-4 pt-4 md:px-6">
        <ChipTabs ariaLabel="Secciones de apariencia" showDescription={false} tabs={APPEARANCE_TABS} value={tab} onChange={setTab} />
      </div>
      <Lazy>
        {tab === 'theme' && <ThemeScreen siteId={siteId} />}
        {tab === 'menus' && <MenusScreen siteId={siteId} />}
        {tab === 'templates' && <TemplatesScreen siteId={siteId} />}
      </Lazy>
    </div>
  )
}

export default function SiteWorkspace({ siteId, section = 'overview' }) {
  const navigate = useNavigate()
  const caps = useWebsiteCapabilities(siteId)
  const { site, release, state } = useSiteContext(siteId)
  const sites = useSites()
  const pages = usePages(siteId)
  const [publishOpen, setPublishOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const current = SECTIONS.some((item) => item.id === section) ? section : 'overview'

  if (site.isPending) return <LoadingState variant="page" />
  if (site.isError) {
    const info = describeError(site.error)
    return (
      <div className="p-6">
        <ErrorState title={info.title} description={info.message} onRetry={() => site.refetch()} />
        <p className="mt-3 text-center text-sm"><button type="button" className="underline" onClick={() => navigate(PUBLIC_ROUTE_ROOT)}>Volver a Mis sitios</button></p>
      </div>
    )
  }

  const data = site.data
  const props = { site: data, siteId, state, release: release.data ?? null, caps, pages, onPublish: () => setPublishOpen(true), onPreview: () => setPreviewOpen(true) }
  const body = {
    overview: <SiteOverview {...props} />,
    pages: <SitePages {...props} />,
    publishing: <SitePublishing {...props} />,
    domains: <SiteDomains {...props} />,
    import: <SiteImport {...props} />,
    settings: <SiteSettings {...props} />,
    catalog: <SiteCatalog {...props} />,
    forms: <Lazy><FormsScreen siteId={siteId} /></Lazy>,
    blog: <Lazy><BlogScreen siteId={siteId} /></Lazy>,
    appearance: <Appearance site={data} siteId={siteId} />,
    advanced: <Lazy><AdvancedSettingsScreen siteId={siteId} /></Lazy>,
    payments: <Lazy><PaymentsScreen siteId={siteId} /></Lazy>,
  }[current]

  return (
    <div className="flex min-h-full flex-col">
      <SiteContextBar site={data} sites={sites.data ?? []} state={state} caps={caps} onPublish={() => setPublishOpen(true)} onPreview={() => setPreviewOpen(true)} />
      {state.key === 'archived' && (
        <Alert variant="warning" className="m-4 w-auto" role="status">
          <Archive className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>Este sitio está archivado</AlertTitle><AlertDescription>Dejó de publicarse y no aparece en tu lista. Sus páginas, formularios y respuestas se conservan.</AlertDescription></div>
        </Alert>
      )}
      <section className="min-w-0 flex-1" aria-label={SECTIONS.find((item) => item.id === current)?.label}>{body}</section>
      <PublishSheet open={publishOpen} onOpenChange={setPublishOpen} site={data} pages={pages.data ?? []} activeRelease={release.data ?? null} />
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} siteId={siteId} draftPageIds={(pages.data ?? []).filter((page) => page.visibility === 'public').map((page) => page.id)} title="Vista previa del borrador guardado" />
    </div>
  )
}
