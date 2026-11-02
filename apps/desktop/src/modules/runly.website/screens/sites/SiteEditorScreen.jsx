import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, ErrorState, LoadingState } from '@runly/ui'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import {
  AtlasWebBuilderEditor,
  baseBlocks,
  defaultTheme,
  defineTheme,
  parsePage,
  serializePage,
} from '@raulbellosom/atlas-web-builder'
import '@raulbellosom/atlas-web-builder/styles'
import '../../../../website/runlySite.css'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { companyFetch } from '../../../../lib/companyFetch.js'
import { buildRunlyBlocks, buildRunlyTemplates } from '../../../../website/runlyBlocks/index.js'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError, isRevisionConflict } from '../../lib/websiteErrors.js'
import { deriveEditorStatus } from '../../lib/siteState.js'
import { clearBackup, writeBackup } from '../../lib/localBackup.js'
import { editorPath, sitePath, slugify } from '../../lib/pageRoute.js'
import { analyzeDocument, blockingIssues } from '../../lib/publishability.js'
import { describeCode } from '../../lib/websiteErrors.js'
import { usePages, useSiteContext, useWebsiteCapabilities, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { ConflictDialog } from '../../components/ConflictDialog.jsx'
import { EditorTopBar } from '../../components/EditorTopBar.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'
import { PublishSheet } from '../../components/PublishSheet.jsx'

function createAssetSource(token) {
  const apiUrl = getApiUrl()
  const authed = (path, options = {}) => companyFetch(`${apiUrl}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } })
  return {
    async list() {
      try {
        // Only PUBLIC images: their URLs are permanent (signed URLs expire).
        const res = await authed('/files?pageSize=100&visibility=PUBLIC&mime=image/')
        const files = ((await res.json()).data ?? []).filter((f) => f.mimeType?.startsWith('image/'))
        if (!files.length) return []
        const urlRes = await authed('/files/batch-signed-urls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: files.map((f) => f.id) }) })
        const urlMap = (await urlRes.json()).data ?? {}
        return files.filter((f) => urlMap[f.id]).map((f) => ({ id: f.id, name: f.originalName ?? f.id, kind: 'image', url: urlMap[f.id] }))
      } catch { return [] }
    },
    async upload(file) {
      const form = new FormData()
      form.append('file', file); form.append('visibility', 'PUBLIC'); form.append('moduleKey', 'runly.website')
      const res = await authed('/files/upload', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed')
      const f = (await res.json()).data
      return { id: f.id, name: f.originalName ?? f.id, kind: 'image', url: f.url ?? '' }
    },
    async remove(id) { await authed(`/files/${id}`, { method: 'DELETE' }) },
  }
}

function blankPage(page) {
  return {
    schemaVersion: 1,
    id: `page_${page?.id ?? 'new'}`,
    slug: page?.slug ?? '/',
    title: page?.title ?? 'Nueva página',
    visibility: 'public',
    regions: { main: { id: 'region_main', children: [] } },
    blocks: {},
    seo: { title: page?.title ?? '', description: '', canonical: null, ogImageAssetId: null },
    updatedAt: new Date().toISOString(),
  }
}

function toInitialPage(document, pageMeta) {
  if (!document || typeof document !== 'object' || !document.blocks) return blankPage(pageMeta)
  try { return parsePage(JSON.stringify(document)) } catch { return blankPage(pageMeta) }
}

// Admin-only editor route (design 15.1). The builder owns its canvas, undo/redo
// and its own "Guardar borrador"/"Publicar" buttons; we only provide the
// callbacks it exposes. Saves are revisioned (PUT .../draft + expectedRevision).
export default function SiteEditorScreen({ siteId, pageId }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const token = session?.access_token
  const { api, companyId, ready } = useWebsiteScope()
  const caps = useWebsiteCapabilities()
  const { site, release, state } = useSiteContext(siteId)
  const pages = usePages(siteId)
  const pageMeta = (pages.data ?? []).find((page) => page.id === pageId) ?? null

  const draftQuery = useQuery({
    queryKey: websiteKeys.draft(companyId, siteId, pageId),
    queryFn: async ({ signal }) => (await api.getDraft(siteId, pageId, { signal })).data,
    enabled: ready,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: (count, error) => error?.status >= 500 && count < 2,
  })
  const themeQuery = useQuery({
    queryKey: ['website', companyId, 'site', siteId, 'theme'],
    queryFn: async ({ signal }) => (await api.getTheme(siteId, { signal })).data,
    enabled: ready,
    staleTime: 60_000,
  })

  const revisionRef = useRef(null)
  const pendingRef = useRef(null)
  const [saveState, setSaveState] = useState('idle')
  const [savedAt, setSavedAt] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [conflictBusy, setConflictBusy] = useState(false)
  const [conflictError, setConflictError] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  const draft = draftQuery.data
  if (draft && revisionRef.current === null) revisionRef.current = draft.revision

  const initialPage = useMemo(
    () => (draft ? toInitialPage(draft.document, pageMeta) : null),
    // editorKey remounts with fresh server content after "discard".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, editorKey],
  )
  const theme = useMemo(() => {
    const tokens = themeQuery.data?.tokens
    return tokens ? defineTheme({ ...defaultTheme, id: 'site-theme', name: 'Tema del sitio', tokens: { ...defaultTheme.tokens, ...tokens } }) : defaultTheme
  }, [themeQuery.data])
  const blocks = useMemo(() => [...baseBlocks, ...buildRunlyBlocks(site.data?.siteType ?? 'website')], [site.data?.siteType])
  const templates = useMemo(() => buildRunlyTemplates(site.data?.siteType ?? 'website'), [site.data?.siteType])
  const assets = useMemo(() => createAssetSource(token), [token])

  const status = deriveEditorStatus({ saveState, savedAt, siteState: state })

  const refreshSiteQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: websiteKeys.site(companyId, siteId) })
    queryClient.invalidateQueries({ queryKey: websiteKeys.sites(companyId) })
    queryClient.invalidateQueries({ queryKey: websiteKeys.pages(companyId, siteId) })
  }, [queryClient, companyId, siteId])

  const persist = useCallback(async (page, expectedRevision) => {
    const document = JSON.parse(serializePage(page))
    const saved = (await api.saveDraft(siteId, pageId, { document, expectedRevision }, newIdempotencyKey())).data
    revisionRef.current = saved.revision
    return { saved, document }
  }, [api, siteId, pageId])

  // Builder callback. The page object is the only source of the user's edits,
  // so it is kept in memory + a per-tab backup until the save is confirmed.
  const handleSave = useCallback(async (page) => {
    if (!caps.pagesUpdate.allowed || !ready) return false
    setSaveState('saving'); setSaveError(null)
    pendingRef.current = page
    try {
      writeBackup(companyId, siteId, pageId, { page })
      await persist(page, revisionRef.current)
      pendingRef.current = null
      clearBackup(companyId, siteId, pageId)
      setSaveState('saved'); setSavedAt(Date.now())
      refreshSiteQueries()
      return true
    } catch (error) {
      if (isRevisionConflict(error)) { setSaveState('conflict'); setConflict(true) }
      else { setSaveState(error?.code === 'network' ? 'offline' : 'error'); setSaveError(error) }
      return false
    }
  }, [caps.pagesUpdate.allowed, ready, companyId, siteId, pageId, persist, refreshSiteQueries])

  const handleBuilderPublish = useCallback(async (page) => {
    const ok = await handleSave(page)
    if (ok) setPublishOpen(true)
  }, [handleSave])

  async function resolveConflict(kind) {
    setConflictBusy(true); setConflictError('')
    try {
      const page = pendingRef.current
      if (kind === 'copy') {
        const document = JSON.parse(serializePage(page))
        const baseSlug = slugify(pageMeta?.slug ?? 'pagina') || 'pagina'
        const suffix = Math.random().toString(36).slice(2, 6)
        const slug = `${baseSlug}-copia-${suffix}`
        const created = (await api.createPage(siteId, { title: `${pageMeta?.title ?? 'Página'} (mi versión)`, slug, routePath: `/${slug}`, pageType: 'page', visibility: 'private' }, newIdempotencyKey())).data
        await api.saveDraft(siteId, created.id, { document, expectedRevision: created.revision ?? 0 }, newIdempotencyKey())
        clearBackup(companyId, siteId, pageId)
        refreshSiteQueries()
        toast.success('Tu versión se guardó como una página nueva (privada).')
        navigate(editorPath(siteId, created.id))
        return
      }
      if (kind === 'discard') {
        clearBackup(companyId, siteId, pageId); pendingRef.current = null
        revisionRef.current = null
        await queryClient.invalidateQueries({ queryKey: websiteKeys.draft(companyId, siteId, pageId) })
        await draftQuery.refetch()
        setEditorKey((value) => value + 1); setConflict(false); setSaveState('idle')
        return
      }
      if (kind === 'overwrite') {
        const latest = (await api.getDraft(siteId, pageId)).data
        await persist(page, latest.revision)
        clearBackup(companyId, siteId, pageId); pendingRef.current = null
        setConflict(false); setSaveState('saved'); setSavedAt(Date.now()); refreshSiteQueries()
      }
    } catch (error) {
      setConflictError(describeError(error).message)
    } finally {
      setConflictBusy(false)
    }
  }

  const back = () => navigate(sitePath(siteId, 'pages'))
  const loadError = draftQuery.error ?? site.error
  const draftIssues = draft?.issues ?? []
  const schemaBlocked = draftIssues.includes('schema_unsupported')
  const localIssues = useMemo(() => blockingIssues(analyzeDocument(draft?.document)), [draft])
  const canEdit = caps.pagesUpdate.allowed

  let body
  if (loadError) {
    body = <div className="p-6"><ErrorState title={describeError(loadError).title} description={describeError(loadError).message} onRetry={() => draftQuery.refetch()} /></div>
  } else if (!draft || !initialPage || site.isPending) {
    body = <LoadingState variant="page" message="Cargando editor…" />
  } else if (schemaBlocked) {
    body = <div className="p-6"><ErrorNotice error={{ code: 'schema_unsupported', status: 422 }} /></div>
  } else {
    body = (
      <>
        {!canEdit && (
          <Alert variant="warning" className="m-3 w-auto" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div><AlertTitle>Solo lectura</AlertTitle><AlertDescription>No tienes permiso para guardar cambios en esta página. Puedes mirarla, pero el editor no guardará.</AlertDescription></div>
          </Alert>
        )}
        {draftIssues.includes('unknown_block_type') && (
          <Alert variant="warning" className="m-3 w-auto" role="status">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div><AlertTitle>{describeCode('unknown_block_type').title}</AlertTitle><AlertDescription>{describeCode('unknown_block_type').message}</AlertDescription></div>
          </Alert>
        )}
        {localIssues.length > 0 && (
          <Alert variant="warning" className="m-3 w-auto" role="status">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div>
              <AlertTitle>Esta página probablemente no se pueda publicar todavía</AlertTitle>
              <AlertDescription>
                {localIssues.map((issue) => describeCode(issue.code)?.message).filter((text, index, all) => all.indexOf(text) === index).join(' ')}
                {' '}Puedes seguir editándola; el borrador es privado. Revisión local informativa.
              </AlertDescription>
            </div>
          </Alert>
        )}
        {saveError && <div className="m-3"><ErrorNotice error={saveError} /></div>}
        <div className="relative min-h-0 flex-1">
          <AtlasWebBuilderEditor
            key={editorKey}
            blocks={blocks}
            templates={templates}
            initialPage={initialPage}
            theme={theme}
            assets={assets}
            brandName={site.data?.name ?? 'Sitio'}
            onSaveDraft={handleSave}
            onPublish={handleBuilderPublish}
            resources={site.data?.siteType === 'ecommerce' ? {
              // Only products marked visible on the web (published) can render publicly.
              products: async ({ categoryId, limit }) => {
                try {
                  const url = `${getApiUrl()}/catalog/products?published=true&limit=${limit ?? 20}${categoryId ? `&categoryId=${categoryId}` : ''}`
                  const res = await companyFetch(url, { headers: { Authorization: `Bearer ${token}` } })
                  return (await res.json()).data ?? []
                } catch { return [] }
              },
            } : undefined}
          />
        </div>
      </>
    )
  }

  const publicPageIds = (pages.data ?? []).filter((page) => page.visibility === 'public').map((page) => page.id)
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[hsl(var(--background))]" data-testid="website-editor">
      <EditorTopBar
        title={pageMeta?.title ?? 'Página'}
        siteName={site.data?.name ?? ''}
        status={status}
        caps={caps}
        saveState={saveState}
        onBack={back}
        onPreview={() => setPreviewOpen(true)}
        onPublish={() => setPublishOpen(true)}
        readOnlyReason={canEdit ? '' : 'Solo lectura'}
      />
      {saveState === 'idle' && draft && canEdit && (
        <p className="px-4 py-1 text-xs text-[hsl(var(--muted-foreground))]">
          Guarda con “Guardar borrador” del editor antes de salir. El editor no avisa de cambios sin guardar.
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      <ConflictDialog
        open={conflict}
        busy={conflictBusy}
        error={conflictError}
        onKeepEditing={() => { setConflict(false); setSaveState('idle') }}
        onSaveAsCopy={() => resolveConflict('copy')}
        onDiscard={() => resolveConflict('discard')}
        onOverwrite={() => resolveConflict('overwrite')}
      />
      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} siteId={siteId} draftPageIds={publicPageIds} title="Vista previa del borrador guardado" />
      <PublishSheet
        open={publishOpen}
        onOpenChange={setPublishOpen}
        site={site.data}
        pages={pages.data ?? []}
        activeRelease={release.data ?? null}
      />
    </div>
  )
}
