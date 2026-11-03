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
} from '@runly/ui'
import { AlertTriangle, CheckCircle2, Loader2, Rocket } from 'lucide-react'
import { newIdempotencyKey } from '../lib/websiteApi.js'
import { describeError, describeFailure, describeCode } from '../lib/websiteErrors.js'

import { editorPath } from '../lib/pageRoute.js'
import { useBlogPosts, useDomains, useWebsiteScope, websiteKeys } from '../hooks/useWebsite.js'
import { ErrorNotice } from './ErrorNotice.jsx'

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

  const reset = useCallback(() => {
    keys.current = { prepare: null, activate: null }
    setPhase('review'); setRelease(null); setError(null); setExcluded(new Set()); setPostIds(new Set()); setIncludeThemeAndMenus(true); setShowPages(false)
  }, [])

  useEffect(() => {
    if (open) { cancelled.current = false; reset() } else { cancelled.current = true }
  }, [open, reset])

  useEffect(()=>{
    if(!open||!api||!site?.id)return undefined;
    let alive=true;setChecking(true);setPreflight(null);
    api.preflight(site.id,{kind:'builder',changes:{publishPageIds:selectedIds,publishPostIds:selectedPostIds,includeThemeAndMenus:firstPublication?true:includeThemeAndMenus}}).then(response=>{
      if(!alive)return;const report=response.data;setPreflight(report);const grouped={};for(const issue of report.issues??[]){const id=issue.pageId??'global';(grouped[id]??=[]).push(issue)}setLocalIssues(grouped);
    }).catch(error=>{if(alive){setError(error);setPreflight(null)}}).finally(()=>{if(alive)setChecking(false)});
    return()=>{alive=false};
  },[open,api,site?.id,selectedIds,selectedPostIds,includeThemeAndMenus,firstPublication]);

  const issuePages = publicPages.filter((page) => (localIssues[page.id] ?? []).length > 0)


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
        changes: { publishPageIds: selectedIds, publishPostIds: selectedPostIds, includeThemeAndMenus: firstPublication ? true : includeThemeAndMenus },
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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy || !next) onOpenChange(next) }}>
      <DialogContent size="xl" className="flex max-h-[88dvh] flex-col">
        <DialogHeader icon={Rocket}>
          <DialogTitle>{phase === 'done' ? 'Tu sitio está publicado' : `Publicar "${site?.name ?? ''}"`}</DialogTitle>
          <DialogDescription>
            {phase === 'review' && 'Se publicará lo que tienes guardado. Los cambios sin guardar del editor no se incluyen.'}
            {phase === 'preparing' && 'Estamos preparando una versión. Tu sitio público no cambia hasta que la actives.'}
            {(phase === 'ready' || phase === 'activating') && 'Al activar, tu sitio público cambiará a esta versión. Puedes volver a la anterior cuando quieras.'}
            {phase === 'done' && 'La nueva versión ya está activa.'}
            {phase === 'failed' && 'No se pudo preparar la versión. Tu sitio público no cambió.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-live="polite">
          {error && <ErrorNotice error={error} />}
          {error?.code === 'draft_changed' && (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Vuelve a preparar la versión para incluir lo último que guardaste.</p>
          )}

          {phase==='review'&&checking&&<p role="status">Validando publicación…</p>}
          {phase==='review'&&localIssues.global?.map((issue)=><ErrorNotice key={JSON.stringify([issue.code,issue.resource])} error={{code:issue.code}}/>)}
          {phase === 'review' && (
            <>
              {issuePages.length > 0 && (
                <Alert variant="warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <div>
                    <AlertTitle>El servidor detectó bloqueos de publicación · {issuePages.length} {issuePages.length === 1 ? 'página' : 'páginas'}</AlertTitle>
                    <AlertDescription>
                      Preflight de solo lectura. Nada se quita ni se oculta automáticamente.
                    </AlertDescription>
                    <ul className="mt-3 space-y-3 text-sm">
                      {issuePages.map((page) => (
                        <li key={page.id} className="rounded-lg border border-amber-400/40 p-3">
                          <p className="font-medium">Página “{page.title}”</p>
                          {(localIssues[page.id] ?? []).map((issue) => (
                            <p key={`${issue.blockId ?? 'page'}:${issue.code}`} className="mt-1 text-xs">
                              {issue.blockType ?? 'Página'} {issue.blockId ?? ''} · {describeCode(issue.code)?.message ?? issue.code}
                              {' '}{(issue.remediation ?? []).map((item) => ({ replace_resource: 'Elige otro recurso.', exclude_page: 'Puedes excluir esta página.', resolve_owner: 'Resuelve el propietario del formulario.', wait: 'Espera y vuelve a comprobar.' }[item.action] ?? item.action)).join(' ')}
                            </p>
                          ))}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => { onOpenChange(false); navigate(editorPath(site.id, page.id)) }}>Ir a la página</Button>
                            <Button size="sm" variant="outline" onClick={() => setExcluded((prev) => { const next = new Set(prev); if (next.has(page.id)) next.delete(page.id); else next.add(page.id); return next })}>
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
              <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox checked={selectedIds.length === publicPages.length} onCheckedChange={(value) => setExcluded(value ? new Set() : new Set(publicPages.map((page) => page.id)))} aria-label="Todas las páginas guardadas" />
                  Todas las páginas guardadas ({publicPages.length})
                  <button type="button" className="ml-auto text-xs underline" onClick={() => setShowPages((prev) => !prev)}>{showPages ? 'Ocultar' : 'Elegir páginas'}</button>
                </label>
                {showPages && (
                  <ul className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
                    {publicPages.map((page) => (
                      <li key={page.id}>
                        <label className="flex items-center gap-3 text-sm">
                          <Checkbox checked={!excluded.has(page.id)} onCheckedChange={(value) => setExcluded((prev) => { const next = new Set(prev); if (value) next.delete(page.id); else next.add(page.id); return next })} aria-label={`Publicar ${page.title}`} />
                          <span>{page.title}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{page.routePath}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {posts.length > 0 && (
                  <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
                    <p className="text-sm font-medium">Entradas del blog</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Las entradas ya publicadas conservan su última versión pública. Marca una para publicar su borrador guardado.</p>
                    <ul className="space-y-2">
                      {posts.map((post) => (
                        <li key={post.id}>
                          <label className="flex items-center gap-3 text-sm">
                            <Checkbox checked={postIds.has(post.id)} onCheckedChange={(value) => setPostIds((prev) => { const next = new Set(prev); if (value) next.add(post.id); else next.delete(post.id); return next })} aria-label={`Publicar la entrada ${post.title}`} />
                            <span>{post.title}</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{post.status === 'published' ? 'Publicada' : 'Borrador'}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox checked={firstPublication ? true : includeThemeAndMenus} disabled={firstPublication} onCheckedChange={setIncludeThemeAndMenus} aria-label="Incluir tema y menús" />
                  Incluir tema y menús
                  {firstPublication && <span className="text-xs text-[hsl(var(--muted-foreground))]">La primera publicación siempre los incluye.</span>}
                </label>
              </div>
              {activeRelease && <p className="text-xs text-[hsl(var(--muted-foreground))]">Versión actual: {formatDate(activeRelease.createdAt)}</p>}
              {publicPages.length === 0 && <p className="text-sm text-[hsl(var(--muted-foreground))]">Este sitio no tiene páginas públicas guardadas todavía.</p>}
            </>
          )}

          {(phase === 'preparing' || (phase === 'activating')) && (
            <div className="space-y-3" role="status">
              <ProgressBar value={null} />
              <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {phase === 'preparing' ? 'Comprobando páginas, verificando imágenes y sellando la versión…' : 'Activando la versión…'}</p>
            </div>
          )}

          {phase === 'ready' && release && (
            <div className="rounded-xl border border-[hsl(var(--border))] p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> La versión está lista</p>
              <p className="mt-1 text-[hsl(var(--muted-foreground))]">Verificada · huella {String(release.manifestHash ?? '').slice(0, 8)}</p>
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
            <div className="rounded-xl border border-[hsl(var(--border))] p-4 text-sm">
              {readyDomain
                ? <p>Dirección activa: <a className="underline" href={`https://${readyDomain.hostname}`} target="_blank" rel="noreferrer">{readyDomain.hostname}</a></p>
                : <p>Publicado. Todavía no tiene una dirección pública activa; elígela en Dominios.</p>}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          {phase === 'review' && (<>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={prepare} disabled={checking||!preflight?.canPublish}>
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
