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
import { Archive, Clock, FileText, FormInput, Globe, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { describeError } from '../../lib/websiteErrors.js'
import { deriveSiteState } from '../../lib/siteState.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useSites, useWebsiteCapabilities, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { SiteStatusChip } from '../../components/SiteStatusChip.jsx'

const TYPE_LABEL = { website: 'Sitio informativo', ecommerce: 'Sitio con Catálogo', blog: 'Blog', landing: 'Landing' }

// A browser-window thumbnail: the card reads as "a website" at a glance and the whole surface opens it.
function SiteCard({ site, onOpen }) {
  const state = deriveSiteState(site, null)
  const address = site.liveDomain || site.domain || null
  const pages = Array.isArray(site.pages) ? site.pages : null
  const published = pages?.filter((page) => page.publicState !== 'unpublished').length ?? 0
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] transition-colors hover:border-[hsl(var(--foreground))]/30 focus-within:ring-2 focus-within:ring-[hsl(var(--ring))]">
      <div className="flex h-28 flex-col bg-[hsl(var(--muted))]/60" aria-hidden="true">
        <div className="flex items-center gap-1.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/70 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" /><span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" /><span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" />
          <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{address ?? 'Sin dirección todavía'}</span>
        </div>
        <div className="flex flex-1 items-center justify-center text-4xl font-semibold text-[hsl(var(--muted-foreground))]/50">{(site.name ?? '?').trim().charAt(0).toUpperCase()}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              <button type="button" onClick={() => onOpen()} className="after:absolute after:inset-0 focus-visible:outline-none">{site.name}</button>
            </h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{TYPE_LABEL[site.siteType] ?? 'Sitio'}</p>
          </div>
          <div className="relative z-10">
            <ActionMenu
              label={`Más acciones de ${site.name}`}
              items={[
                { label: 'Páginas', onClick: () => onOpen('pages') },
                { label: 'Publicaciones', onClick: () => onOpen('publishing') },
                { label: 'Configuración', onClick: () => onOpen('settings') },
              ]}
            />
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
          {pages && <div className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Páginas</dt><dd>{plural(pages.length, 'página', 'páginas')}{published > 0 && published !== pages.length ? ` · ${published} publicadas` : ''}</dd></div>}
          {site.formCount != null && <div className="flex items-center gap-1"><FormInput className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Formularios</dt><dd>{site.formCount === 0 ? 'Sin formularios' : plural(site.formCount, 'formulario', 'formularios')}</dd></div>}
          {site.updatedAt && <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" /><dt className="sr-only">Actualizado</dt><dd>{new Date(site.updatedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</dd></div>}
        </dl>
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <SiteStatusChip state={state} size="sm" />
          {site.defaultForCompany && <Badge variant="secondary">Predeterminado</Badge>}
        </div>
      </div>
    </li>
  )
}

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
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Sitios">
            {visible.map((site) => <SiteCard key={site.id} site={site} onOpen={(section = 'overview') => navigate(sitePath(site.id, section))} />)}
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
