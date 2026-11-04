import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ProgressBar,
  StatusPill,
} from '@runly/ui'
import { AlertTriangle, Check, CheckCircle2, CircleDashed, ExternalLink, FileText, Globe, Loader2, Newspaper, Palette, PartyPopper, Radio, Rocket, ShieldCheck } from 'lucide-react'
import { newIdempotencyKey } from '../lib/websiteApi.js'
import { describeError, describeFailure, describeCode } from '../lib/websiteErrors.js'

import { editorPath,sitePath } from '../lib/pageRoute.js'
import { useBlogPosts, useDomains, useWebsiteScope, websiteKeys } from '../hooks/useWebsite.js'
import { ErrorNotice } from './ErrorNotice.jsx'
import { ROW_CARD, SiteIconChip, SitePanel } from './SitePanel.jsx'

const POLL_MS = 1500
const POLL_MAX = 60

function formatDate(value) {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return '' }
}

// Publishing = prepare (private candidate) -> activate (atomic pointer swap).
// All authority is server-side; this component only sequences the calls,
// keeps one idempotency key per user intent and explains every outcome.
export function PublishSheet({ open, onOpenChange, site, pages = [], activeRelease, beforePrepare }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const domains = useDomains(open ? site?.id : null)
  const blog = useBlogPosts(open ? site?.id : null)
  const [postIds, setPostIds] = useState(() => new Set())
  const [removedPostIds,setRemovedPostIds]=useState(()=>new Set())
  const [phase, setPhase] = useState('review') // review | preparing | ready | activating | done | failed
  const [excluded, setExcluded] = useState(() => new Set())
  const [includeThemeAndMenus, setIncludeThemeAndMenus] = useState(true)
  const [showPages, setShowPages] = useState(false)
  const [release, setRelease] = useState(null)
  const [error, setError] = useState(null)
  const [localIssues,setLocalIssues]=useState({}),[preflight,setPreflight]=useState(null),[checking,setChecking]=useState(false)
  const keys = useRef({ prepare: null, activate: null })
  const cancelled = useRef(false)

  const publicPages = useMemo(() => pages.filter((page) => page.visibility === 'public' || page.visibility === undefined), [pages])
  const firstPublication = !site?.activeReleaseId
  const posts = useMemo(() => (blog.data ?? []).filter((post) => post.status !== 'archived'), [blog.data])
  const selectedPostIds = useMemo(() => posts.filter((post) => postIds.has(post.id)).map((post) => post.id), [posts, postIds])
  const selectedIds = useMemo(() => publicPages.filter((page) => !excluded.has(page.id)).map((page) => page.id), [publicPages, excluded])
  // Live pages whose draft is no longer public leave the site with this version.
  const unpublishPageIds = useMemo(() => {
    const live = new Set((site?.pages ?? []).filter((p) => p.publicState !== 'unpublished').map((p) => p.id))
    return pages.filter((page) => live.has(page.id) && page.visibility && page.visibility !== 'public').map((page) => page.id)
  }, [pages, site?.pages])

  const reset = useCallback(() => {
    keys.current = { prepare: null, activate: null }
    setPhase('review'); setRelease(null); setError(null); setExcluded(new Set()); setPostIds(new Set()); setRemovedPostIds(new Set()); setIncludeThemeAndMenus(true); setShowPages(false)
  }, [])

  useEffect(() => {
    if (open) { cancelled.current = false; reset() } else { cancelled.current = true }
  }, [open, reset])

  useEffect(()=>{
    if(!open||!api||!site?.id)return undefined;
    let alive=true;setChecking(true);setPreflight(null);
    api.preflight(site.id,{kind:'builder',changes:{publishPageIds:selectedIds,publishPostIds:selectedPostIds,unpublishPageIds,unpublishPostIds:[...removedPostIds],includeThemeAndMenus:firstPublication?true:includeThemeAndMenus}}).then(response=>{
      if(!alive)return;const report=response.data;setPreflight(report);const grouped={};for(const issue of report.issues??[]){const id=issue.pageId??'global';(grouped[id]??=[]).push(issue)}setLocalIssues(grouped);
    }).catch(error=>{if(alive){setError(error);setPreflight(null)}}).finally(()=>{if(alive)setChecking(false)});
    return()=>{alive=false};
  },[open,api,site?.id,selectedIds,selectedPostIds,unpublishPageIds,removedPostIds,includeThemeAndMenus,firstPublication]);

  const issuePages = [...publicPages,...posts.map(post=>({...post,isPost:true}))].filter((page) => (localIssues[page.id] ?? []).length > 0)


  async function pollRelease(releaseId) {
    for (let attempt = 0; attempt < POLL_MAX; attempt += 1) {
      if (cancelled.current) return null
      const current = (await api.getRelease(site.id, releaseId)).data
      setRelease(current)
      if (current.state === 'ready' || current.state === 'failed' || current.state === 'revoked') return current
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    return null
  }

  async function prepare() {
    setError(null); setPhase('preparing')
    try {
      if (beforePrepare) await beforePrepare()
      keys.current.prepare ??= newIdempotencyKey()
      const fresh = (await api.getSite(site.id)).data
      const body = {
        kind: 'builder',
        baseReleaseId: fresh.activeReleaseId ?? null,
        expectedDraftRevision: String(fresh.draftRevision),
        expectedPublicationRevision: String(fresh.publicationRevision),
        changes: { publishPageIds: selectedIds, publishPostIds: selectedPostIds, unpublishPageIds, unpublishPostIds:[...removedPostIds], includeThemeAndMenus: firstPublication ? true : includeThemeAndMenus },
      }
      const checked=(await api.preflight(site.id,body)).data;if(!checked.canPublish){setPreflight(checked);setError({code:checked.issues?.[0]?.code??'validation_failed'});setPhase('review');return}
      const created = (await api.prepareRelease(site.id, body, keys.current.prepare)).data
      setRelease(created)
      const finished = created.state === 'preparing' ? await pollRelease(created.id) : created
      if (!finished) { setPhase('review'); setError({ code: 'preparation_failed', status: 0 }); return }
      if (finished.state === 'ready') setPhase('ready')
      else { setPhase('failed'); keys.current.prepare = null }
    } catch (e) {
      keys.current.prepare = null
      setError(e); setPhase('review')
    }
  }

  async function activate() {
    setError(null); setPhase('activating')
    try {
      keys.current.activate ??= newIdempotencyKey()
      await api.activateRelease(site.id, {
        releaseId: release.id,
        manifestHash: release.manifestHash,
        expectedDraftRevision: String(release.draftRevision),
        expectedPublicationRevision: String(release.publicationRevision),
      }, keys.current.activate)
      await queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId), predicate: (query) => query.queryKey[4] !== 'draft' })
      setPhase('done')
    } catch (e) {
      keys.current.activate = null
      setError(e); setPhase('ready')
    }
  }

  const readyDomain = (domains.data ?? []).find((domain) => domain.ready)
  const errInfo = error ? describeError(error) : null
  const busy = phase === 'preparing' || phase === 'activating'


  const stepIndex = { review: 0, preparing: 1, failed: 1, ready: 2, activating: 2, done: 3 }[phase] ?? 0
  const pageTotal = publicPages.length
  const newPostCount = selectedPostIds.length

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy || !next) onOpenChange(next) }}>
      <DialogContent size="xl" className="flex max-h-[88dvh] flex-col">
        <DialogHeader icon={phase === 'done' ? PartyPopper : Rocket}>
          <DialogTitle>{phase === 'done' ? 'Tu sitio está publicado' : `Publicar "${site?.name ?? ''}"`}</DialogTitle>
          <DialogDescription>
            {phase === 'review' && 'Se publicará lo que tienes guardado. Los cambios sin guardar del editor no se incluyen.'}
            {phase === 'preparing' && 'Estamos preparando una versión. Tu sitio público no cambia hasta que la actives.'}
            {(phase === 'ready' || phase === 'activating') && 'Al activar, tu sitio público cambiará a esta versión. Puedes volver a la anterior cuando quieras.'}
            {phase === 'done' && 'La nueva versión ya está activa.'}
            {phase === 'failed' && 'No se pudo preparar la versión. Tu sitio público no cambió.'}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2 px-1 text-xs" aria-label="Pasos de la publicación">
          {STEPS.map((step, index) => {
            const complete = stepIndex > index
            const current = stepIndex === index
            return (
              <li key={step.key} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors ${complete ? 'bg-emerald-500 text-white' : current ? (phase === 'failed' ? 'bg-rose-500 text-white' : 'bg-orange-500 text-white') : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                  {complete ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
                </span>
                <span className={`truncate ${current ? 'font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{step.label}</span>
                {index < STEPS.length - 1 && <span className={`h-px flex-1 ${complete ? 'bg-emerald-500/60' : 'bg-[hsl(var(--border))]'}`} aria-hidden />}
              </li>
            )
          })}
        </ol>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {error && <ErrorNotice error={error} />}
          {error?.code === 'draft_changed' && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Vuelve a preparar la versión para incluir lo último que guardaste.</p>
          )}

          {phase === 'review' && checking && <p role="status" className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Validando publicación…</p>}
          {phase === 'review' && localIssues.global?.map((issue) => <ErrorNotice key={JSON.stringify([issue.code, issue.resource])} error={{ code: issue.code }} />)}
          {phase === 'review' && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Tile icon={FileText} tone="blue" value={`${selectedIds.length}/${pageTotal}`} label={pageTotal === 1 ? 'Página' : 'Páginas'} />
                <Tile icon={Newspaper} tone="orange" value={newPostCount + removedPostIds.size} label="Entradas" />
                <Tile icon={Palette} tone="emerald" value={firstPublication || includeThemeAndMenus ? 'Sí' : 'No'} label="Tema y menús" />
              </div>

              {issuePages.length > 0 && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <div>
                    <AlertTitle>El servidor detectó bloqueos de publicación · {issuePages.length} {issuePages.length === 1 ? 'página' : 'páginas'}</AlertTitle>
                    <AlertDescription>
                      Revisión de solo lectura: tu borrador no se modifica.
                    </AlertDescription>
                    <ul className="mt-3 space-y-3 text-sm">
                      {issuePages.map((page) => (
                        <li key={page.id} className="rounded-xl border border-amber-400/40 bg-[hsl(var(--card))] p-3">
                          <p className="font-medium">Página “{page.title}”</p>
                          {(localIssues[page.id] ?? []).map((issue) => (
                            <p key={`${issue.blockId ?? 'page'}:${issue.code}`} className="mt-1 text-xs">
                              {issue.blockType ?? 'Página'} {issue.blockId ?? ''} · {describeCode(issue.code)?.message ?? issue.code}
                              {' '}{(issue.remediation ?? []).map((item) => ({ replace_resource: 'Elige otro recurso.', exclude_page: 'Puedes excluir esta página.', resolve_owner: 'Resuelve el propietario del formulario.', wait: 'Espera y vuelve a comprobar.' }[item.action] ?? item.action)).join(' ')}
                            </p>
                          ))}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate(page.isPost ? sitePath(site.id, `blog/${page.id}`) : editorPath(site.id, page.id)) }}>Ir al contenido</Button>
                            <Button size="sm" variant="outline" onClick={() => { if (page.isPost) { setPostIds((prev) => { const next = new Set(prev); next.delete(page.id); return next }); return } setExcluded((prev) => { const next = new Set(prev); if (next.has(page.id)) next.delete(page.id); else next.add(page.id); return next }) }}>
                              {excluded.has(page.id) ? 'Incluir esta página' : 'No publicar esta página por ahora'}
                            </Button>
                          </div>
                          {excluded.has(page.id) && (
                            <p className="mt-2 text-xs">Seguirá visible la versión publicada anterior de esta página, si existe.</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Alert>
              )}

              <SitePanel id="publish-pages" icon={FileText} tone="blue" title="Páginas" description="Elige qué páginas guardadas entran en esta versión."
                action={pageTotal > 1 && <button type="button" className="text-xs font-medium text-orange-600 underline-offset-2 hover:underline dark:text-orange-400" onClick={() => setShowPages((prev) => !prev)}>{showPages ? 'Ocultar' : 'Elegir páginas'}</button>}>
                <label className={`${ROW_CARD} flex items-center gap-3 text-sm`}>
                  <Checkbox checked={selectedIds.length === pageTotal} onCheckedChange={(value) => setExcluded(value ? new Set() : new Set(publicPages.map((page) => page.id)))} aria-label="Todas las páginas guardadas" />
                  <span className="font-medium">Todas las páginas guardadas</span>
                  <StatusPill tone="neutral" size="sm">{pageTotal}</StatusPill>
                </label>
                {showPages && (
                  <ul className="mt-2 space-y-2">
                    {publicPages.map((page) => (
                      <li key={page.id}>
                        <label className={`${ROW_CARD} flex items-center gap-3 text-sm`}>
                          <Checkbox checked={!excluded.has(page.id)} onCheckedChange={(value) => setExcluded((prev) => { const next = new Set(prev); if (value) next.delete(page.id); else next.add(page.id); return next })} aria-label={`Publicar ${page.title}`} />
                          <span className="min-w-0 flex-1 truncate font-medium">{page.title}</span>
                          <code className="rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{page.routePath}</code>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {pageTotal === 0 && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Este sitio no tiene páginas públicas guardadas todavía.</p>}
              </SitePanel>

              {posts.length > 0 && (
                <SitePanel id="publish-posts" icon={Newspaper} tone="orange" title="Entradas del blog" description="Las ya publicadas conservan su última versión pública. Marca una para publicar su borrador guardado.">
                  <ul className="space-y-2">
                    {posts.map((post) => (
                      <li key={post.id} className={`${ROW_CARD} space-y-2`}>
                        <label className="flex items-center gap-3 text-sm">
                          <Checkbox checked={postIds.has(post.id)} disabled={removedPostIds.has(post.id)} onCheckedChange={(value) => setPostIds((prev) => { const next = new Set(prev); if (value) next.add(post.id); else next.delete(post.id); return next })} aria-label={`Publicar la entrada ${post.title}`} />
                          <span className="min-w-0 flex-1 truncate font-medium">{post.title}</span>
                          {post.status === 'published'
                            ? <StatusPill tone="success" size="sm" icon={CheckCircle2}>Publicada</StatusPill>
                            : <StatusPill tone="neutral" size="sm" icon={CircleDashed}>Borrador</StatusPill>}
                        </label>
                        {post.status === 'published' && (
                          <label className="flex items-center gap-3 border-t border-[hsl(var(--border))] pt-2 text-xs text-[hsl(var(--muted-foreground))]">
                            <Checkbox checked={removedPostIds.has(post.id)} disabled={postIds.has(post.id)} onCheckedChange={(value) => setRemovedPostIds((prev) => { const next = new Set(prev); if (value) next.add(post.id); else next.delete(post.id); return next })} aria-label={`Retirar la entrada ${post.title}`} />
                            Retirar de la versión pública
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                </SitePanel>
              )}

              <label className={`${ROW_CARD} flex items-center gap-3 text-sm`}>
                <Checkbox checked={firstPublication ? true : includeThemeAndMenus} disabled={firstPublication} onCheckedChange={setIncludeThemeAndMenus} aria-label="Incluir tema y menús" />
                <SiteIconChip icon={Palette} tone="emerald" size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Incluir tema y menús</span>
                  {firstPublication && <span className="block text-xs text-[hsl(var(--muted-foreground))]">La primera publicación siempre los incluye.</span>}
                </span>
              </label>
              {activeRelease && <p className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]"><Radio className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Versión actual: {formatDate(activeRelease.createdAt)}</p>}
            </>
          )}

          {(phase === 'preparing' || phase === 'activating') && (
            <div className="space-y-4 rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-[hsl(var(--card))] to-[hsl(var(--card))] p-5" role="status">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>
                <div>
                  <p className="font-semibold">{phase === 'preparing' ? 'Preparando tu versión' : 'Activando la versión'}</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{phase === 'preparing' ? 'Comprobando páginas, verificando imágenes y sellando la versión…' : 'Cambiando tu sitio público a la nueva versión…'}</p>
                </div>
              </div>
              <ProgressBar value={null} />
            </div>
          )}

          {phase === 'ready' && release && (
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-[hsl(var(--card))] to-[hsl(var(--card))] p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-6 w-6" aria-hidden /></span>
              <div className="min-w-0">
                <p className="font-semibold">La versión está lista</p>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Verificada y sellada · huella <code className="rounded-md bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs">{String(release.manifestHash ?? '').slice(0, 8)}</code></p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Tu sitio público sigue igual hasta que actives.</p>
              </div>
            </div>
          )}

          {phase === 'failed' && release && (() => {
            const info = describeFailure(release.failureCode)
            return (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <div>
                  <AlertTitle>{info.title}</AlertTitle>
                  <AlertDescription>{info.message}</AlertDescription>
                  {info.blocker && <p className="mt-2 text-xs">Esta página no se puede publicar todavía. Puedes excluirla de esta publicación o quitar el bloque en el editor.</p>}
                  {release.failureCode && <p className="mt-2 text-xs opacity-80">Código: {release.failureCode}</p>}
                </div>
              </Alert>
            )
          })()}

          {phase === 'done' && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-[hsl(var(--card))] to-[hsl(var(--card))] p-5">
              <div className="flex items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white"><CheckCircle2 className="h-6 w-6" aria-hidden /></span>
                <div className="min-w-0">
                  <p className="font-semibold">Todo en línea</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{selectedIds.length} {selectedIds.length === 1 ? 'página publicada' : 'páginas publicadas'}{newPostCount > 0 ? ` y ${newPostCount} ${newPostCount === 1 ? 'entrada' : 'entradas'}` : ''}.</p>
                </div>
              </div>
              {readyDomain
                ? <a className="flex items-center gap-2 rounded-xl bg-[hsl(var(--card))] p-3 text-sm font-medium hover:underline" href={`https://${readyDomain.hostname}`} target="_blank" rel="noreferrer"><Globe className="h-4 w-4 text-emerald-600" aria-hidden /> {readyDomain.hostname} <ExternalLink className="ml-auto h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden /></a>
                : <p className="flex items-center gap-2 rounded-xl bg-[hsl(var(--card))] p-3 text-sm text-[hsl(var(--muted-foreground))]"><Globe className="h-4 w-4" aria-hidden /> Todavía no tiene una dirección pública activa; elígela en Dominios.</p>}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {phase === 'review' && (<>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={prepare} disabled={checking || !preflight?.canPublish}>
              {errInfo?.reload ? 'Preparar de nuevo' : 'Preparar publicación'}
            </Button>
          </>)}
          {(phase === 'ready' || phase === 'activating') && (<>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={activate} disabled={busy}>Activar versión</Button>
          </>)}
          {phase === 'failed' && (<>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={reset}>Volver a revisar</Button>
          </>)}
          {phase === 'done' && <Button onClick={() => onOpenChange(false)}>Listo</Button>}
          {phase === 'preparing' && <Button variant="outline" onClick={() => { cancelled.current = true; onOpenChange(false) }}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STEPS = [
  { key: 'review', label: 'Revisar' },
  { key: 'prepare', label: 'Preparar' },
  { key: 'activate', label: 'Activar' },
]

function Tile({ icon: Icon, tone, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <SiteIconChip icon={Icon} tone={tone} size="sm" />
      <div className="min-w-0">
        <p className="text-base font-semibold tabular-nums leading-tight">{value}</p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      </div>
    </div>
  )
}
