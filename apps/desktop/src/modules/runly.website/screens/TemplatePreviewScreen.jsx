import { companyFetch } from '../../../lib/companyFetch.js'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AtlasWebBuilderProvider,
  AtlasWebRenderer,
  baseBlocks,
  serializePage,
  parsePage,
  defaultTheme,
  defineTheme,
} from '@raulbellosom/atlas-web-builder'
import '@raulbellosom/atlas-web-builder/styles'
import { Button, ConfirmDialog, EmptyState } from '@runly/ui'
import { AlertTriangle, ArrowLeft, Eye, Info, LayoutTemplate, Wand2 } from 'lucide-react'
import { TemplatesPageSelector } from '../components/TemplatesPageSelector.jsx'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import {useWebsiteCapabilities} from '../hooks/useWebsite.js'
import {newIdempotencyKey} from '../lib/websiteApi.js'
import {describeError} from '../lib/websiteErrors.js'
import { allTemplates } from '../../../website/runlyTemplates/index.js'
import { RunlySiteFrame } from '../../../website/RunlySiteFrame.jsx'
import {
  universalRunlyBlocks,
  ecommerceRunlyBlocks,
  bookingsRunlyBlocks,
  restaurantRunlyBlocks,
} from '../../../website/runlyBlocks/index.js'

const ALL_BLOCKS = [
  ...baseBlocks,
  ...universalRunlyBlocks,
  ...ecommerceRunlyBlocks,
  ...bookingsRunlyBlocks,
  ...restaurantRunlyBlocks,
]

async function apiFetch(path, token, options = {}) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error || `HTTP ${res.status}`),{code:err.code,status:res.status})
  }
  return res.json()
}

function routeToSlug(routePath) {
  const clean = routePath
    .replace(/^\//, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
  return clean || 'inicio'
}

function buildTemplateTheme(themeTokens) {
  if (!themeTokens) return defaultTheme
  return defineTheme({
    ...defaultTheme,
    id: 'atlas-site',
    name: 'Site Theme',
    tokens: {
      ...defaultTheme.tokens,
      color: { ...defaultTheme.tokens?.color, ...themeTokens.color },
    },
  })
}

function TemplatePagePreview({ page, theme }) {
  const parsedPage = useMemo(() => {
    try {
      return parsePage(serializePage(page))
    } catch {
      return null
    }
  }, [page])

  if (!parsedPage) {
    return (
      <div className="flex items-center justify-center py-32 text-sm text-[hsl(var(--muted-foreground))]">
        Vista previa no disponible.
      </div>
    )
  }

  return (
    <AtlasWebBuilderProvider blocks={ALL_BLOCKS} theme={theme}>
      <RunlySiteFrame>
        <AtlasWebRenderer page={parsedPage} mode="public" />
      </RunlySiteFrame>
    </AtlasWebBuilderProvider>
  )
}

export default function TemplatePreviewScreen() {
  const { '*': wildcard } = useParams()
  const navigate = useNavigate()
  const [searchParams]=useSearchParams()
  const contextSiteId=searchParams.get('siteId')
  const commandRef=useRef(null)
  const templatesPath=contextSiteId?`/app/m/runly.website/sites/${encodeURIComponent(contextSiteId)}/appearance`:'/app/m/runly.website/templates'
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()

  const templateId = wildcard?.match(/^templates\/([^/]+)\/preview$/)?.[1] ?? null
  const template = useMemo(
    () => allTemplates.find((t) => t.id === templateId) ?? null,
    [templateId],
  )

  const previewTheme = useMemo(() => buildTemplateTheme(template?.themeTokens), [template])

  const [selectedPageIds, setSelectedPageIds] = useState([])
  const [previewPageId, setPreviewPageId] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const previewScrollRef = useRef(null)

  useEffect(() => {
    if (template) {
      setSelectedPageIds(template.pages.map((p) => p.id))
      setPreviewPageId(template.pages[0]?.id ?? null)
    }
  }, [template])

  const siteQuery = useQuery({
    queryKey: ['website-site',contextSiteId, token],
    queryFn:  () => apiFetch(contextSiteId?`/website/sites/${contextSiteId}`:'/website/site', token),
    enabled:  Boolean(token),
    staleTime: 60_000,
  })
  const site = siteQuery.data?.data ?? null
  const caps=useWebsiteCapabilities(site?.id)

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!template || !site) throw new Error('Sin plantilla o sitio seleccionado')
      // Every page write bumps the site revision, so read the current one instead of the cached site.
      const fresh=await apiFetch(`/website/sites/${site.id}`,token)
      const body={expectedRevision:fresh.data.draftRevision,pageIds:selectedPageIds,includeTheme:Boolean(template.themeTokens&&caps.templatesApplyTheme?.allowed)}
      const hash=JSON.stringify({...body,expectedRevision:undefined})
      if(commandRef.current?.hash!==hash)commandRef.current={hash,body,key:newIdempotencyKey()}
      const result=await apiFetch(`/website/sites/${site.id}/templates/${template.id}/apply`,token,{method:'POST',headers:{'Idempotency-Key':commandRef.current.key},body:JSON.stringify(commandRef.current.body)})
      return {firstPageId:result.data.firstPageId,created:result.data.pages.length,skipped:0}
    },
    onSuccess: ({ firstPageId, created, skipped }) => {
      queryClient.invalidateQueries({queryKey:['website']})
      if (created === 0) {
        const skip = skipped > 0
          ? `${skipped} pagina${skipped !== 1 ? 's' : ''} omitida${skipped !== 1 ? 's' : ''} (ruta ya existe)`
          : 'Ninguna pagina fue creada.'
        toast.info(skip + ' Edítalas directamente desde Páginas.')
        return
      }
      const msg = `${created} pagina${created !== 1 ? 's' : ''} creada${created !== 1 ? 's' : ''}`
      const skip = skipped > 0 ? ` · ${skipped} omitida${skipped !== 1 ? 's' : ''} (ruta ya existe)` : ''
      toast.success(msg + skip)
      if (firstPageId) navigate(`/app/m/runly.website/sites/${site.id}/pages/${firstPageId}/editor`)
      else navigate(`/app/m/runly.website/sites/${site.id}/pages`)
    },
    onError: (err) => {toast.error(describeError(err).message);if(err.code==='revision_conflict'){commandRef.current=null;siteQuery.refetch()}},
  })

  if (!template) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={LayoutTemplate}
          title="Plantilla no encontrada"
          description="Puede que se haya retirado o que el enlace esté incompleto."
          action={{ label: 'Volver a plantillas', onClick: () => navigate(templatesPath) }}
        />
      </div>
    )
  }

  const previewEntry = template.pages.find((p) => p.id === previewPageId) ?? template.pages[0] ?? null

  // The preview is a sandbox: template links must never reach the app router or
  // the browser. Internal routes switch the previewed template page; anything else is inert.
  function handlePreviewClick(event) {
    const anchor = event.target.closest?.('a[href]')
    if (!anchor) return
    event.preventDefault()
    event.stopPropagation()
    const href = anchor.getAttribute('href') || ''
    if (!href.startsWith('/')) return
    const path = href.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
    const target = template.pages.find((p) => p.routePath === path)
    if (target) showPreviewPage(target.id)
  }

  function showPreviewPage(pageId) {
    setPreviewPageId(pageId)
    previewScrollRef.current?.scrollTo({ top: 0 })
  }

  function togglePage(pageId) {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId]
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">

      {/* Selection + apply */}
      <aside className="flex max-h-[50vh] shrink-0 flex-col border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] md:h-full md:max-h-none md:w-80 md:border-b-0 md:border-r">
        <div className="border-b border-[hsl(var(--border))] p-4">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate(templatesPath)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            Plantillas
          </Button>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm" style={{ background: template.themeTokens?.color?.primary ?? template.color }}>
              <LayoutTemplate className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-[hsl(var(--foreground))]">{template.label}</h2>
              <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{template.description}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Páginas a crear</p>
            <span className="text-xs font-medium tabular-nums text-[hsl(var(--muted-foreground))]">{selectedPageIds.length} de {template.pages.length}</span>
          </div>
          <TemplatesPageSelector pages={template.pages} selectedIds={selectedPageIds} disabled={applyMutation.isPending} onToggle={togglePage} />
        </div>

        <div className="space-y-2 border-t border-[hsl(var(--border))] p-4">
          {!site && (
            <p className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Configura tu sitio primero para aplicar plantillas.
            </p>
          )}
          <p className="flex gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Si una ruta ya existe, no se aplica ninguna página. Desmárcala o revisa el sitio antes de reintentar.
          </p>
          <Button
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            disabled={applyMutation.isPending || selectedPageIds.length === 0 || !site || !caps.templatesApply?.allowed}
          >
            <Wand2 className="mr-1.5 h-4 w-4" aria-hidden />
            {applyMutation.isPending
              ? 'Creando páginas...'
              : `Aplicar — ${selectedPageIds.length} página${selectedPageIds.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </aside>

      {/* Page switcher + sandboxed preview */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2">
          <span className="mr-1 inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            <Eye className="h-3.5 w-3.5" aria-hidden />Vista previa
          </span>
          {template.pages.map((p) => {
            const active = previewEntry?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => showPreviewPage(p.id)}
                className={`min-h-9 shrink-0 cursor-pointer rounded-full px-3 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${
                  active
                    ? 'bg-[hsl(var(--foreground))] font-medium text-[hsl(var(--background))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="min-h-0 flex-1 bg-[hsl(var(--muted))]/50 p-2 md:p-4">
          <div
            ref={previewScrollRef}
            className="h-full overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-white shadow-sm"
            onClickCapture={handlePreviewClick}
            onSubmitCapture={(e) => e.preventDefault()}
          >
            {previewEntry && <TemplatePagePreview key={previewEntry.id} page={previewEntry.page} theme={previewTheme} />}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="warning"
        title={`Aplicar «${template.label}»`}
        description={`Se crearán ${selectedPageIds.length} página(s) como borrador en ${site?.name ?? 'este sitio'}.`}
        detail={`No se modifican páginas existentes ni lo que ya está publicado${template.themeTokens && caps.templatesApplyTheme?.allowed ? '; el tema del borrador se reemplazará por el de la plantilla' : ''}. Nada se publica hasta que uses Publicar.`}
        confirmLabel="Aplicar plantilla"
        loading={applyMutation.isPending}
        onConfirm={() => { setConfirmOpen(false); applyMutation.mutate() }}
      />
    </div>
  )
}
