import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, Badge, Button, Card, CardContent, EmptyState, ErrorState, PageHeader, SegmentedControl, Skeleton, TextField } from '@runly/ui'
import { PackageSearch, Settings2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useRuntimeModules } from './useRuntimeModules.js'
import { runly } from '../lib/runly.js'
import { catalogState, compatibilityLabel, marketplaceError, publisherLabel, resourceBlock } from '../lib/marketplace-import.js'
import { MarketplaceState } from '../components/marketplace/MarketplaceResourcePicker.jsx'
import { MarketplacePanel } from '../modules/runly.core/components/MarketplacePanel.jsx'
import { MarketplaceSourceDialog } from '../modules/runly.core/components/MarketplaceSourceDialog.jsx'
import { StudioImportDialog } from '../modules/runly.studio/components/import/StudioImportDialog.jsx'
import { MarketplaceAutomationDialog } from '../modules/runly.automations/components/MarketplaceAutomationDialog.jsx'

const TYPES = [
  { value: 'module', label: 'Módulos', permission: 'core.modules.read' },
  { value: 'studio_template', label: 'Plantillas Studio', permission: 'studio.view' },
  { value: 'automation', label: 'Automatizaciones', permission: 'automations.manage' },
  { value: 'website_template', label: 'Website', permission: 'website.site.read' },
  { value: 'solution', label: 'Solutions', permission: 'core.modules.read' },
]

function ResourceCatalog({ type, token, can, moduleAvailable }) {
  const [search, setSearch] = useState(''), [selected, setSelected] = useState(null)
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['marketplace-resources', type, false, token], queryFn: async () => (await runly.moduleCatalog.resources(type, token)).data, enabled: Boolean(token), retry: false, staleTime: 30000 })
  if (query.isPending) return <Skeleton className="h-48 rounded-xl" />
  if (query.isError) { const error = marketplaceError(query.error); return <MarketplaceState state={{ ...error, title: `Recursos: ${error.title}` }} onRetry={() => query.refetch()} /> }
  const catalog = catalogState(query.data.catalog), items = query.data.items ?? []
  const visible = items.filter(item => `${item.title} ${item.description} ${publisherLabel(item)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()))
  const canImport = type === 'studio_template' ? moduleAvailable('studio') && can('studio.view') && ['studio.create', 'studio.templates.manage', 'studio.templates.publish'].some(can) : type === 'automation' && moduleAvailable('automations') && can('automations.manage')
  return <div className="space-y-4">
    <p className="text-sm text-[hsl(var(--muted-foreground))]">Recursos: {query.data.catalog.verified ? 'copia verificada' : 'sin copia verificada'} · {query.data.catalog.freshness ?? 'sin sincronización'}. Este feed es independiente del catálogo de módulos.</p>
    {query.data.catalog.alert || query.data.catalog.offline ? <Alert variant="warning"><AlertDescription>No se pudo verificar una actualización del feed de recursos ({query.data.catalog.alert ?? 'sin conexión'}). Se muestra la última copia verificada; confirmar una importación requiere verificar de nuevo.</AlertDescription></Alert> : null}
    {catalog.blocking || catalog.stale ? <MarketplaceState state={catalog} onRetry={() => query.refetch()} /> : null}
    <TextField label="Buscar recursos" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o publicador" />
    {!visible.length ? <EmptyState icon={PackageSearch} title={items.length ? 'Sin coincidencias' : 'Sin publicaciones de este tipo'} description="Sólo aparecen recursos del feed firmado y verificado de esta instancia. La disponibilidad de otros tipos se consulta por separado." /> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(item => {
      const block = resourceBlock(item)
      return <Card key={item.releaseId}><CardContent className="flex h-full flex-col gap-3 p-4">
        <div><h2 className="font-semibold">{item.title}</h2><p className="text-xs text-[hsl(var(--muted-foreground))]">{publisherLabel(item)} · v{item.version}</p></div>
        <div className="flex flex-wrap gap-1"><Badge variant="outline">{item.official ? 'Oficial Runly' : item.publisher?.verified ? 'Comunidad verificada' : 'Comunidad'}</Badge><Badge variant="outline">{item.license}</Badge><Badge variant="outline">{compatibilityLabel(item)}</Badge></div>
        <p className="flex-1 text-sm text-[hsl(var(--muted-foreground))]">{item.description}</p>
        {block ? <p role="status" className="text-sm text-amber-700">{block.message}</p> : null}
        {canImport ? <Button disabled={Boolean(block) || catalog.blocking} onClick={() => setSelected(item)}>{type === 'studio_template' ? 'Importar copia editable' : 'Revisar importación'}</Button> : <p className="text-sm text-[hsl(var(--muted-foreground))]">{['website_template', 'solution'].includes(type) ? 'Descubrimiento disponible. Este tipo todavía no tiene un importador integrado habilitado.' : 'Necesitas el módulo disponible y permiso para importar en esta empresa.'}</p>}
      </CardContent></Card>
    })}</div>}
    {selected && type === 'studio_template' ? <StudioImportDialog open onOpenChange={open => !open && setSelected(null)} initialResource={selected} token={token} onImported={result => { setSelected(null); navigate(`/app/m/runly.studio?${result.kind === 'design' ? `design=${encodeURIComponent(result.id)}` : 'view=templates'}`) }} /> : null}
    {selected && type === 'automation' ? <MarketplaceAutomationDialog open onOpenChange={open => !open && setSelected(null)} initialResource={selected} token={token} onOpenAutomation={result => { setSelected(null); navigate(`/app/m/runly.automations/${encodeURIComponent(result.key)}`) }} /> : null}
  </div>
}

function MarketplaceContent({ token, userProfile }) {
  const [params, setParams] = useSearchParams(), [settings, setSettings] = useState(false)
  const { availableModules } = useRuntimeModules()
  const admin = Boolean(userProfile?.isAdmin || userProfile?.isSystemAdmin)
  const can = permission => admin || (userProfile?.permissions ?? []).includes(permission)
  const types = TYPES.filter(type => can(type.permission)), selected = types.find(type => type.value === params.get('type')) ?? types[0]
  const moduleAvailable = name => availableModules.some(module => [ `runly.${name}`, `atlas.${name}` ].includes(module.key))
  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <PageHeader title="Marketplace" description="Descubre módulos y recursos. Cada importación se revisa y se confirma antes de crear o instalar algo." actions={admin && can('core.modules.manage') && can('core.modules.read') ? <Button variant="outline" onClick={() => setSettings(true)}><Settings2 className="mr-2 h-4 w-4" />Configurar Marketplace</Button> : null} />
    {!selected ? <EmptyState icon={PackageSearch} title="Sin acceso al catálogo" description="Solicita permisos para consultar los módulos o recursos que necesitas." /> : <>
      <SegmentedControl ariaLabel="Tipos de Marketplace" options={types} value={selected.value} onChange={type => setParams({ type })} />
      {selected.value === 'module' ? <MarketplacePanel token={token} canManage={admin && can('core.modules.manage')} /> : <ResourceCatalog key={selected.value} type={selected.value} token={token} can={can} moduleAvailable={moduleAvailable} />}
    </>}
    {settings ? <MarketplaceSourceDialog token={token} onOpenChange={setSettings} /> : null}
  </div>
}

export default function MarketplaceScreen() {
  const { session, userProfile, profileCompanyId } = useAuth()
  if (!session?.access_token) return <ErrorState title="Inicia sesión" description="Necesitas una sesión y una empresa activa para consultar el Marketplace." />
  return <MarketplaceContent key={`${profileCompanyId}:${userProfile?.id}`} token={session.access_token} userProfile={userProfile} />
}
