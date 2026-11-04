import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ActionMenu,
  Alert,
  AlertDescription,
  AlertTitle,
  ConfirmDialog,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  StatusPill,
  TextField,
  Button,
  useIsMobile,
} from '@runly/ui'
import { AlertTriangle, CircleDashed, EyeOff, FilePlus2, FileText, Globe, Lock, PauseCircle, Pencil, PencilLine, Plus, Settings2, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { editorPath, routeFromSlug, slugify, validateRoute } from '../../lib/pageRoute.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { useUnpublishPages } from '../../hooks/useUnpublishPages.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { ROW_CARD, SiteIconChip, TOUCH } from '../../components/SitePanel.jsx'

const VISIBILITY = [
  { value: 'public', label: 'Pública' },
  { value: 'authenticated', label: 'Solo con sesión' },
  { value: 'private', label: 'Privada' },
]
const VISIBILITY_ICON = { public: Globe, authenticated: Users, private: Lock }

function formatDay(value) {
  try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value)) } catch { return '' }
}

// Public state is icon + text: live, live with unpublished edits, or draft only.
function PublicState({ state, retired }) {
  if (retired) return <StatusPill tone="neutral" size="sm" icon={PauseCircle} title="El sitio está retirado: nadie ve esta página.">Sitio retirado</StatusPill>
  if (state === 'changed') return <StatusPill tone="warning" size="sm" icon={PencilLine}>Publicada · con cambios</StatusPill>
  if (state === 'published') return <StatusPill tone="success" size="sm" icon={Globe}>Publicada</StatusPill>
  return <StatusPill tone="neutral" size="sm" icon={CircleDashed}>Solo borrador</StatusPill>
}

function NewPageDialog({ open, onOpenChange, siteId, onCreated }) {
  const { api } = useWebsiteScope()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [touchedSlug, setTouchedSlug] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const key = useMemo(() => (open ? newIdempotencyKey() : null), [open])
  const effectiveSlug = touchedSlug ? slug : slugify(title)
  const route = routeFromSlug(effectiveSlug)
  const routeError = effectiveSlug ? validateRoute(route) : 'Escribe un título.'
  const conflict = error?.code === 'route_conflict' || (error?.status === 409 && !error?.code)

  async function submit() {
    setBusy(true); setError(null)
    try {
      const created = (await api.createPage(siteId, { title: title.trim(), slug: effectiveSlug, routePath: route, pageType: 'page', visibility: 'public' }, key)).data
      onOpenChange(false); setTitle(''); setSlug(''); setTouchedSlug(false)
      onCreated(created)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader icon={FilePlus2}>
          <DialogTitle>Nueva página</DialogTitle>
          <DialogDescription>Se crea como borrador privado. Aparecerá en tu sitio cuando publiques.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contacto" required />
          <TextField
            label="Dirección de la página"
            value={effectiveSlug}
            onChange={(e) => { setTouchedSlug(true); setSlug(slugify(e.target.value)) }}
            hint={`Se verá como ${route}`}
            error={conflict ? 'Ya existe una página con esa ruta.' : undefined}
          />
          {error && !conflict && <ErrorNotice error={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !title.trim() || Boolean(routeError)}>{busy ? 'Creando…' : 'Crear página'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Title/route/visibility live in `draftMetadata` and only reach the public
// site when published (S2). Saving needs the current document, so we read the
// draft first and send it back unchanged with the revision it came with.
function PageSettingsDialog({ page, siteId, onClose, onSaved }) {
  const { api } = useWebsiteScope()
  const [title, setTitle] = useState(page?.draftMetadata?.title ?? page?.title ?? '')
  const [routePath, setRoutePath] = useState(page?.draftMetadata?.routePath ?? page?.routePath ?? '/')
  const [visibility, setVisibility] = useState(page?.draftMetadata?.visibility ?? page?.visibility ?? 'public')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const routeError = validateRoute(routePath)
  const wasPublic = page?.status === 'published'

  async function save() {
    setBusy(true); setError(null)
    try {
      const draft = (await api.getDraft(siteId, page.id)).data
      await api.saveDraft(siteId, page.id, {
        document: draft.document && typeof draft.document === 'object' ? draft.document : {},
        metadata: { title: title.trim(), routePath, visibility },
        expectedRevision: draft.revision,
      }, newIdempotencyKey())
      toast.success('Ajustes guardados en el borrador')
      onSaved()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Dialog open={Boolean(page)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="lg">
        <DialogHeader icon={Settings2}>
          <DialogTitle>Ajustes de la página</DialogTitle>
          <DialogDescription>Estos cambios se aplican a tu sitio público cuando publiques.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label="Ruta" value={routePath} onChange={(e) => setRoutePath(e.target.value)} error={routeError || undefined} />
          {wasPublic && routePath !== page?.routePath && <p className="text-xs text-amber-700 dark:text-amber-300">La dirección anterior dejará de funcionar cuando publiques.</p>}
          <SelectField label="Visibilidad" value={visibility} onChange={setVisibility} options={VISIBILITY} />
          {error && <ErrorNotice error={error} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !title.trim() || Boolean(routeError)}>{busy ? 'Guardando…' : 'Guardar ajustes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SitePages({ siteId, site, caps, pages }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const [newOpen, setNewOpen] = useState(false)
  const [settingsPage, setSettingsPage] = useState(null)
  const [deletePage, setDeletePage] = useState(null)
  const [unpublishPage, setUnpublishPage] = useState(null)
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: websiteKeys.pages(companyId, siteId) })
    queryClient.invalidateQueries({ queryKey: websiteKeys.site(companyId, siteId) })
  }
  const remove = useMutation({
    mutationFn: (page) => api.deletePage(page.id),
    onSuccess: () => { toast.success('Página eliminada del borrador'); setDeletePage(null); refresh() },
    onError: (error) => { toast.error(describeError(error).message); setDeletePage(null) },
  })

  const unpublish = useUnpublishPages(siteId, { onDone: () => setUnpublishPage(null) })
  // Deleted from the draft but still in the live version until the next publish.
  const removedLive = (site.changes ?? []).filter((change) => change.kind === 'removedPage' && change.id)

  const isMobile = useIsMobile()
  const retired = site.lifecycle === 'unpublished'
  const publicStateOf = (id) => site.pages?.find((p) => p.id === id)?.publicState
  const isLive = (id) => ['published', 'changed'].includes(publicStateOf(id))
  const menuItems = (page) => [
    { label: 'Editar', icon: Pencil, onClick: () => navigate(editorPath(siteId, page.id)) },
    { label: 'Ajustes de la página', icon: Settings2, disabled: !caps.pagesUpdate.allowed, onClick: () => setSettingsPage(page) },
    ...(isLive(page.id) ? [{ label: 'Retirar del sitio público', icon: EyeOff, disabled: !caps.publish.allowed, onClick: () => setUnpublishPage(page) }] : []),
    { label: 'Eliminar', icon: Trash2, variant: 'destructive', disabled: !caps.pagesDelete.allowed, onClick: () => setDeletePage(page) },
  ]
  const titleButton = (page) => (
    <button type="button" onClick={() => navigate(editorPath(siteId, page.id))} className="group flex min-w-0 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
      <SiteIconChip icon={VISIBILITY_ICON[page.visibility] ?? FileText} tone="blue" size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium group-hover:underline">{page.title}</span>
        <code className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{page.routePath}</code>
      </span>
    </button>
  )

  const columns = useMemo(() => [
    { accessorKey: 'title', header: 'Página', cell: ({ row }) => titleButton(row.original) },
    { accessorKey: 'routePath', header: 'Ruta', cell: ({ row }) => <code className="rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{row.original.routePath}</code> },
    { id: 'public', header: 'En el sitio público', cell: ({ row }) => <PublicState state={publicStateOf(row.original.id)} retired={retired} /> },
    { id: 'updated', header: 'Última edición', cell: ({ row }) => <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{formatDay(row.original.updatedAt)}</span> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <ActionMenu label={`Acciones de ${row.original.title}`} items={menuItems(row.original)} /> },
  ], [navigate, siteId, site.pages, retired, caps.pagesUpdate.allowed, caps.pagesDelete.allowed, caps.publish.allowed])

  const renderCard = (page) => (
    <article className={ROW_CARD}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{titleButton(page)}</div>
        <ActionMenu label={`Acciones de ${page.title}`} items={menuItems(page)} triggerClassName="h-11 w-11 sm:h-7 sm:w-7" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border))] pt-3">
        <PublicState state={publicStateOf(page.id)} retired={retired} />
        <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">Editada {formatDay(page.updatedAt)}</span>
      </div>
      <Button className={`mt-3 w-full ${TOUCH}`} size="sm" variant="outline" onClick={() => navigate(editorPath(siteId, page.id))}><Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />Editar contenido</Button>
    </article>
  )

  const newButton = <CapabilityButton capability={caps.pagesCreate} onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Nueva página</CapabilityButton>

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader
        icon={FileText}
        tone="blue"
        title="Páginas"
        description="El contenido que editas es un borrador privado. Se publica con “Publicar”."
        actions={newButton}
      />
      {removedLive.length > 0 && !retired && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <AlertTitle>{removedLive.length === 1 ? 'Una página borrada sigue en tu sitio público' : `${removedLive.length} páginas borradas siguen en tu sitio público`}</AlertTitle>
              <AlertDescription>
                {removedLive.map((change) => `${change.title} (${change.path})`).join(', ')}. Ya no están en tu borrador, por eso no aparecen en la lista; los visitantes las siguen viendo hasta que publiques o las retires.
              </AlertDescription>
            </div>
            <CapabilityButton capability={caps.publish} size="sm" variant="outline" onClick={() => setUnpublishPage({ ids: removedLive.map((change) => change.id), title: removedLive.map((change) => change.title).join(', ') })}>
              <EyeOff className="h-4 w-4" aria-hidden /> Retirar ahora
            </CapabilityButton>
          </div>
        </Alert>
      )}
      <DataTable
        columns={columns}
        data={pages.data ?? []}
        getRowId={(page) => page.id}
        isLoading={pages.isPending}
        isError={pages.isError}
        onRetry={() => pages.refetch()}
        pageSize={20}
        searchPlaceholder="Buscar página…"
        emptyIcon={FileText}
        emptyTitle="Este sitio todavía no tiene páginas"
        emptyDescription="Crea la primera página para empezar a editar."
        emptyAction={newButton}
        stateKey={`website-pages:${siteId}`}
        viewModes={['table', 'cards']}
        defaultViewMode={isMobile ? 'cards' : 'table'}
        viewStorageKey={`website-pages-view:${isMobile ? 'm' : 'd'}`}
        renderCard={renderCard}
      />
      <NewPageDialog open={newOpen} onOpenChange={setNewOpen} siteId={siteId} onCreated={(page) => { refresh(); navigate(editorPath(siteId, page.id)) }} />
      {settingsPage && <PageSettingsDialog page={settingsPage} siteId={siteId} onClose={() => setSettingsPage(null)} onSaved={() => { setSettingsPage(null); refresh() }} />}
      <ConfirmDialog
        open={Boolean(deletePage)}
        onOpenChange={(open) => { if (!open) setDeletePage(null) }}
        title="Eliminar página"
        description={deletePage && isLive(deletePage.id)
          ? `“${deletePage?.title}” está en tu sitio público. Se quitará cuando publiques de nuevo; hasta entonces sigue visible. Para quitarla ya, usa “Retirar del sitio público”.`
          : `Se eliminará “${deletePage?.title}” del borrador del sitio.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deletePage)}
      />
      <ConfirmDialog
        open={Boolean(unpublishPage)}
        onOpenChange={(open) => { if (!open && !unpublish.isPending) setUnpublishPage(null) }}
        title="Retirar del sitio público"
        description={unpublishPage?.ids
          ? `“${unpublishPage.title}” dejará de verse en tu sitio ahora mismo. El resto del sitio no cambia.`
          : `“${unpublishPage?.title}” dejará de verse en tu sitio ahora mismo. El resto del sitio no cambia y la página queda como borrador; vuelve a publicarse la próxima vez que publiques si su visibilidad es pública.`}
        confirmLabel="Retirar"
        loading={unpublish.isPending}
        onConfirm={() => unpublish.mutate(unpublishPage.ids ?? [unpublishPage.id])}
      />
    </div>
  )
}
