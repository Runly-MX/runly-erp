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
import { Button, ConfirmDialog } from '@runly/ui'
import { ArrowLeft } from 'lucide-react'
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
      const body={expectedRevision:site.draftRevision,pageIds:selectedPageIds,includeTheme:Boolean(template.themeTokens&&caps.templatesApplyTheme?.allowed)}
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
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Plantilla no encontrada.</p>
        <Button variant="outline" onClick={() => navigate(templatesPath)}>
          Volver a plantillas
        </Button>
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
    <div className="flex h-full overflow-hidden">

      {/* Left panel: selection + apply */}
      <div className="w-72 shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--background))] h-full">

        {/* Header */}
        <div className="p-4 border-b border-[hsl(var(--border))]">
          <button
            onClick={() => navigate(templatesPath)}
            className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors mb-3 cursor-pointer"
          >
            <ArrowLeft size={13} />
            Plantillas
          </button>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: template.color }} />
            <h2 className="font-semibold text-[hsl(var(--foreground))] truncate">{template.label}</h2>
          </div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
            {template.description}
          </p>
        </div>

        {/* Page selection */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
            Paginas a crear
          </p>
          {template.pages.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors ${
                p.required ? 'opacity-60' : 'cursor-pointer hover:bg-[hsl(var(--muted)/0.5)]'
              } ${selectedPageIds.includes(p.id) ? 'bg-[hsl(var(--muted)/0.3)]' : ''}`}
            >
              <input
                type="checkbox"
                className="rounded shrink-0"
                checked={selectedPageIds.includes(p.id)}
                disabled={applyMutation.isPending}
                onChange={() => togglePage(p.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[hsl(var(--foreground))] truncate">{p.label}</p>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] font-mono">{p.routePath}</p>
              </div>
              {p.required && (
                <span className="text-[10px] text-white dark:text-amber-300 bg-amber-500 dark:bg-amber-950/40 border border-transparent dark:border-amber-800 rounded px-1.5 py-0.5 shrink-0">
                  base
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Apply footer */}
        <div className="p-4 border-t border-[hsl(var(--border))] space-y-2">
          {!site && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Configura tu sitio primero para aplicar plantillas.
            </p>
          )}
          <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
            Si una ruta ya existe, no se aplica ninguna página. Desmárcala o revisa el sitio antes de reintentar.
          </p>
          <Button
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            disabled={applyMutation.isPending || selectedPageIds.length === 0 || !site || !caps.templatesApply?.allowed}
          >
            {applyMutation.isPending
              ? 'Creando paginas...'
              : `Aplicar — ${selectedPageIds.length} pagina${selectedPageIds.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>

      {/* Right panel: page switcher + sandboxed preview */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] overflow-x-auto shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mr-2 shrink-0">
            Vista previa
          </span>
          {template.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => showPreviewPage(p.id)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                previewEntry?.id === p.id
                  ? 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] font-medium'
                  : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div
          ref={previewScrollRef}
          className="flex-1 overflow-y-auto bg-white"
          onClickCapture={handlePreviewClick}
          onSubmitCapture={(e) => e.preventDefault()}
        >
          {previewEntry && <TemplatePagePreview key={previewEntry.id} page={previewEntry.page} theme={previewTheme} />}
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
