import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ActionMenu,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  TextField,
} from '@runly/ui'
import { Archive, Globe, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { describeError } from '../../lib/websiteErrors.js'
import { deriveSiteState } from '../../lib/siteState.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useSites, useWebsiteCapabilities, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { SiteStatusChip } from '../../components/SiteStatusChip.jsx'

const TYPE_LABEL = { website: 'Sitio informativo', ecommerce: 'Sitio con Catálogo', blog: 'Blog', landing: 'Landing' }

// Entry point of the module: every company site, never an implicit "first" one.
export default function SitesListScreen() {
  const navigate = useNavigate()
  const sites = useSites()
  const caps = useWebsiteCapabilities()
  const [query, setQuery] = useState('')
  const { api, companyId } = useWebsiteScope()
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(null)
  const [removeText, setRemoveText] = useState('')
  const [busy, setBusy] = useState(false)
  const archived = (sites.data ?? []).filter((site) => site.lifecycle === 'archived')
  const refresh = () => queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
  async function restore(site) {
    try { await api.restoreSite(site.id); await refresh(); toast.success(`“${site.name}” restaurado como borrador. Publícalo cuando quieras.`) } catch (e) { toast.error(describeError(e).message) }
  }
  async function remove() {
    setBusy(true)
    try { await api.deleteSite(removing.id, removeText); await refresh(); toast.success('Sitio eliminado.'); setRemoving(null); setRemoveText('') } catch (e) { toast.error(describeError(e).message) } finally { setBusy(false) }
  }
  const visible = useMemo(() => {
    const rows = (sites.data ?? []).filter((site) => site.lifecycle !== 'archived')
    const term = query.trim().toLowerCase()
    return term ? rows.filter((site) => (site.name ?? '').toLowerCase().includes(term)) : rows
  }, [sites.data, query])

  const create = (
    <CapabilityButton capability={caps.siteEdit} onClick={() => navigate(`${PUBLIC_ROUTE_ROOT}/sites/new`)}>
      <Plus className="h-4 w-4" /> Crear sitio
    </CapabilityButton>
  )

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader eyebrow="Sitio web" title="Sitios web" description="Crea y administra los sitios de tu empresa." actions={create} />
      {sites.isPending && <LoadingState variant="page" />}
      {sites.isError && (
        <ErrorState title={describeError(sites.error).title} description={describeError(sites.error).message} onRetry={() => sites.refetch()} />
      )}
      {sites.isSuccess && (sites.data ?? []).filter((site) => site.lifecycle !== 'archived').length === 0 && (
        <EmptyState
          icon={Globe}
          title="Aún no tienes sitios"
          description="Crea tu primer sitio en tres pasos. Puedes empezar en blanco o con una plantilla."
          action={create}
        />
      )}
      {sites.isSuccess && (sites.data ?? []).some((site) => site.lifecycle !== 'archived') && (
        <>
          <div className="max-w-sm">
            <TextField label="Buscar sitio" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre del sitio" />
          </div>
          {visible.length === 0 && <EmptyState variant="compact" title="Ningún sitio coincide con la búsqueda." />}
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Sitios">
            {visible.map((site) => {
              const state = deriveSiteState(site, null)
              return (
                <li key={site.id} className="flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">{site.name}</h2>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{TYPE_LABEL[site.siteType] ?? 'Sitio'}</p>
                    </div>
                    {site.defaultForCompany && <Badge variant="secondary">Predeterminado</Badge>}
                  </div>
                  <SiteStatusChip state={state} size="sm" />
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <Button size="sm" onClick={() => navigate(sitePath(site.id, 'overview'))}>Abrir</Button>
                    <ActionMenu
                      label={`Más acciones de ${site.name}`}
                      items={[
                        { label: 'Páginas', onClick: () => navigate(sitePath(site.id, 'pages')) },
                        { label: 'Publicaciones', onClick: () => navigate(sitePath(site.id, 'publishing')) },
                        { label: 'Configuración', onClick: () => navigate(sitePath(site.id, 'settings')) },
                      ]}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {archived.length > 0 && (
        <section aria-labelledby="archived-sites" className="space-y-3">
          <h2 id="archived-sites" className="flex items-center gap-2 text-sm font-semibold"><Archive className="h-4 w-4" aria-hidden="true" /> Archivados</h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Sitios archivados">
            {archived.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-[hsl(var(--border))] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{site.name}</p>
                  <Badge variant="secondary">Archivado</Badge>
                </div>
                <div className="flex shrink-0 gap-2">
                  <CapabilityButton capability={caps.archive} size="sm" variant="outline" onClick={() => restore(site)}>Restaurar</CapabilityButton>
                  <CapabilityButton capability={caps.archive} size="sm" variant="destructive" onClick={() => { setRemoveText(''); setRemoving(site) }}>Eliminar</CapabilityButton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => { if (!open && !busy) { setRemoving(null); setRemoveText('') } }}
        title="Eliminar sitio"
        description={`“${removing?.name ?? ''}” se eliminará de forma definitiva: sus direcciones dejan de responder y ya no se puede restaurar. El historial de auditoría se conserva.`}
        confirmLabel="Eliminar definitivamente"
        loading={busy}
        confirmDisabled={removeText !== removing?.name}
        onConfirm={remove}
      >
        <div className="mt-3"><TextField label={`Escribe el nombre del sitio para confirmar: ${removing?.name ?? ''}`} value={removeText} onChange={(e) => setRemoveText(e.target.value)} /></div>
      </ConfirmDialog>
    </div>
  )
}
