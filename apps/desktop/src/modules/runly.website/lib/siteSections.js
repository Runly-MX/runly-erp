import { useMemo } from 'react'
import { PUBLIC_ROUTE_ROOT } from './pageRoute.js'
import { useSite, useWebsiteCapabilities } from '../hooks/useWebsite.js'

// Sections of one site. `icon` is a lucide name resolved by the shell sidebar.
export const SECTIONS = [
  { id: 'overview', label: 'Resumen', icon: 'LayoutDashboard' },
  { id: 'pages', label: 'Páginas', icon: 'FileText' },
  { id: 'blog', label: 'Blog', icon: 'BookOpen' },
  { id: 'catalog', label: 'Catálogo', icon: 'ShoppingBag' },
  { id: 'forms', label: 'Formularios', icon: 'FormInput' },
  { id: 'appearance', label: 'Apariencia', icon: 'Palette' },
  { id: 'publishing', label: 'Publicaciones', icon: 'History' },
  { id: 'domains', label: 'Dominios', icon: 'Globe' },
  { id: 'import', label: 'Importar ZIP', icon: 'UploadCloud' },
  { id: 'settings', label: 'Configuración', icon: 'Settings' },
  { id: 'advanced', label: 'Correo y analítica', icon: 'SlidersHorizontal' },
  { id: 'payments', label: 'Pagos', icon: 'CreditCard' },
]

const SITE_PATH = new RegExp(`^${PUBLIC_ROUTE_ROOT}/sites/([^/]+)`)

// While a site is open the shell sidebar belongs to that site: its name on top, a way back to the list and only its
// own sections. Outside a site (or any other module) the module is returned untouched.
export function useSiteSidebarModule(activeModule, pathname) {
  const siteId = activeModule?.key === 'runly.website' ? SITE_PATH.exec(pathname)?.[1] ?? null : null
  const id = siteId ? decodeURIComponent(siteId) : null
  const site = useSite(id)
  const caps = useWebsiteCapabilities(id)
  return useMemo(() => {
    if (!id) return activeModule
    const allowed = SECTIONS.filter((item) => caps.sections?.[item.id]?.allowed)
    return {
      ...activeModule,
      name: site.data?.name ?? 'Sitio web',
      subtitle: 'Sitio web',
      icon: 'Globe',
      navigation: [
        { label: 'Todos mis sitios', path: '/', icon: 'ArrowLeft' },
        ...(allowed.length ? allowed : SECTIONS.slice(0, 1)).map((item) => ({ label: item.label, path: `/sites/${siteId}${item.id === 'overview' ? '' : `/${item.id}`}`, icon: item.icon })),
      ],
    }
  }, [activeModule, id, siteId, site.data?.name, caps.sections])
}
