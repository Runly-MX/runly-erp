import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, ErrorState, LoadingState, SelectField, Tabs, TabsContent, TabsList, TabsTrigger } from '@runly/ui'
import { Archive, BookOpen, CreditCard, FileText, FormInput, Globe, History, LayoutDashboard, Palette, Settings, ShoppingBag, SlidersHorizontal, UploadCloud } from 'lucide-react'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
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

export const SECTIONS = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'pages', label: 'Páginas', icon: FileText },
  { id: 'blog', label: 'Blog', icon: BookOpen },
  { id: 'catalog', label: 'Catálogo', icon: ShoppingBag },
  { id: 'forms', label: 'Formularios', icon: FormInput },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'publishing', label: 'Publicaciones', icon: History },
  { id: 'domains', label: 'Dominios', icon: Globe },
  { id: 'import', label: 'Importar ZIP', icon: UploadCloud },
  { id: 'settings', label: 'Configuración', icon: Settings },
  { id: 'advanced', label: 'Correo y analítica', icon: SlidersHorizontal },
  { id: 'payments', label: 'Pagos', icon: CreditCard },
]

const Lazy = ({ children }) => <Suspense fallback={<LoadingState variant="page" />}>{children}</Suspense>

// Template application still writes through the historical default-site flow
// (non-atomic, no revisioned drafts), so it is only offered for that site.
function TemplatesScope({ site }) {
  if (site?.defaultForCompany) return <TemplatesScreen />
  return (
    <div className="p-4 md:p-6">
      <Alert variant="warning" role="status">
        <Archive className="h-4 w-4" aria-hidden="true" />
        <div>
          <AlertTitle>Las plantillas todavía no admiten este sitio</AlertTitle>
          <AlertDescription>Aplicar una plantilla crea páginas en el sitio predeterminado de tu empresa. Para evitar cambios en el sitio equivocado, no se ofrece aquí; crea las páginas desde Páginas.</AlertDescription>
        </div>
      </Alert>
    </div>
  )
}

function Appearance({ site, siteId }) {
  return (
    <Lazy>
      <Tabs defaultValue="theme" className="p-2">
        <TabsList>
          <TabsTrigger value="theme">Tema</TabsTrigger>
          <TabsTrigger value="menus">Menús</TabsTrigger>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
        </TabsList>
        <TabsContent value="theme"><ThemeScreen siteId={siteId} /></TabsContent>
        <TabsContent value="menus"><MenusScreen siteId={siteId} /></TabsContent>
        <TabsContent value="templates"><TemplatesScope site={site} /></TabsContent>
      </Tabs>
    </Lazy>
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
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Secciones del sitio" className="hidden w-56 shrink-0 border-r border-[hsl(var(--border))] p-3 md:block">
          <ul className="space-y-0.5">
            {SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === current ? 'page' : undefined}
                  onClick={() => navigate(sitePath(siteId, item.id))}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${item.id === current ? 'bg-[hsl(var(--muted))] font-semibold' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]'}`}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" /> {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-b border-[hsl(var(--border))] p-3 md:hidden">
          <SelectField label="Sección" value={current} onChange={(value) => navigate(sitePath(siteId, value))} options={SECTIONS.map((item) => ({ value: item.id, label: item.label }))} />
        </div>
        <main className="min-w-0 flex-1" aria-label={SECTIONS.find((item) => item.id === current)?.label}>{body}</main>
      </div>
      <PublishSheet open={publishOpen} onOpenChange={setPublishOpen} site={data} pages={pages.data ?? []} activeRelease={release.data ?? null} />
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} siteId={siteId} draftPageIds={(pages.data ?? []).filter((page) => page.visibility === 'public').map((page) => page.id)} title="Vista previa del borrador guardado" />
    </div>
  )
}
