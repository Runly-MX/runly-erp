import { useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusPill } from '@runly/ui'
import { AlertCircle, Ban, CheckCircle2, Clock, Eye, History, Info, Loader2, PauseCircle, Radio, Rocket, ShieldAlert, ShieldCheck, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError, describeFailure } from '../../lib/websiteErrors.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { ROW_CARD, SiteIconChip, SitePanel, TOUCH } from '../../components/SitePanel.jsx'

function formatDate(value) {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return '' }
}

const STATE = {
  preparing: { label: 'Preparando…', tone: 'brand', icon: Loader2 },
  ready: { label: 'Lista', tone: 'neutral', icon: CheckCircle2 },
  failed: { label: 'No se pudo preparar', tone: 'danger', icon: AlertCircle },
  revoked: { label: 'Revocada', tone: 'neutral', icon: Ban },
}

function integrityInfo(mode, long = false) {
  if (mode === 'sealed') return { label: 'Sellada', tone: 'success', icon: ShieldCheck }
  if (mode === 'legacy-reference') return { label: long ? 'Referencias históricas sin verificar' : 'Referencias históricas', tone: 'neutral', icon: ShieldAlert }
  return { label: long ? 'Sin verificar' : 'Integridad sin verificar', tone: 'neutral', icon: ShieldAlert }
}

export default function SitePublishing({ site, siteId, release, caps, onPublish }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const [rollbackTarget, setRollbackTarget] = useState(null)
  const [rollbackError, setRollbackError] = useState(null)
  const [unpublishOpen, setUnpublishOpen] = useState(false)
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [previewRelease, setPreviewRelease] = useState(null)
  const keyRef = useRef({})

  const releases = useInfiniteQuery({
    queryKey: websiteKeys.releases(companyId, siteId),
    queryFn: async ({ pageParam, signal }) => api.listReleases(siteId, { cursor: pageParam }, { signal }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last?.meta?.nextCursor ?? undefined,
    enabled: Boolean(api && companyId),
  })
  const rows = (releases.data?.pages ?? []).flatMap((page) => page.data ?? [])
  const activeId = site.activeReleaseId
  const integrity = useQuery({
    queryKey: ['website', companyId, 'site', siteId, 'integrity', activeId],
    queryFn: async ({ signal }) => (await api.getIntegrity(siteId, { signal })).data,
    enabled: Boolean(api && companyId),
  })

  async function command(name, run, success) {
    setBusy(true)
    try {
      keyRef.current[name] ??= newIdempotencyKey()
      await run(keyRef.current[name])
      keyRef.current[name] = null
      await queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      toast.success(success)
      return true
    } catch (error) {
      keyRef.current[name] = null
      if (name === 'rollback') setRollbackError(error); else toast.error(describeError(error).message)
      if (error?.status === 409) queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      return false
    } finally { setBusy(false) }
  }

  const rollback = async () => {
    const target = rollbackTarget
    setRollbackError(null)
    const ok = await command('rollback', (key) => api.rollbackRelease(siteId, { releaseId: target.id, expectedPublicationRevision: String(site.publicationRevision) }, key), 'Volviste a la versión seleccionada')
    if (ok) setRollbackTarget(null)
  }
  const unpublish = async () => {
    const ok = await command('unpublish', (key) => api.unpublishSite(siteId, { expectedPublicationRevision: String(site.publicationRevision) }, key), 'Tu sitio se retiró de la publicación')
    if (ok) { setUnpublishOpen(false); setUnderstood(false) }
  }

  const integ = integrity.data ? integrityInfo(integrity.data.integrityMode, true) : null
  const live = Boolean(activeId && release)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader
        icon={History}
        tone="violet"
        title="Publicaciones"
        description="La versión que ven tus visitantes y el historial para volver atrás. Tus borradores no se pierden."
        actions={<CapabilityButton capability={caps.publish} onClick={onPublish}><Rocket className="h-4 w-4" aria-hidden /> Publicar</CapabilityButton>}
      />
      <SitePanel
        id="current-title"
        icon={Radio}
        tone={live ? 'emerald' : 'neutral'}
        title="Versión publicada ahora"
        description={live ? 'Esto es lo que ven tus visitantes en este momento.' : undefined}
      >
        {live ? (
          <div className="flex flex-col gap-4 rounded-xl bg-emerald-500/5 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="success" icon={CheckCircle2}>En línea</StatusPill>
                {integ && <StatusPill tone={integ.tone} icon={integ.icon}>Integridad: {integ.label}</StatusPill>}
              </div>
              <p className="flex items-center gap-1.5 text-sm tabular-nums"><Clock className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />Publicada el {formatDate(release.createdAt)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CapabilityButton capability={caps.previewSite} size="sm" variant="outline" className={TOUCH} onClick={() => setPreviewRelease(release)}><Eye className="h-4 w-4" aria-hidden /> Ver esta versión</CapabilityButton>
              <CapabilityButton capability={caps.publish} size="sm" variant="outline" className={TOUCH} onClick={() => setUnpublishOpen(true)}><PauseCircle className="h-4 w-4" aria-hidden /> Retirar el sitio</CapabilityButton>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {integ && <StatusPill tone={integ.tone} icon={integ.icon}>Integridad: {integ.label}</StatusPill>}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] p-3">
              <SiteIconChip icon={site.lifecycle === 'unpublished' ? PauseCircle : Rocket} size="sm" />
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {site.lifecycle === 'unpublished' ? 'El sitio está retirado: nadie puede verlo. El historial y los borradores se conservan.' : 'Este sitio todavía no tiene una versión publicada.'}
              </p>
            </div>
          </div>
        )}
        {integrity.isError && <div className="mt-3"><ErrorNotice error={integrity.error} /></div>}
      </SitePanel>

      <SitePanel id="history-title" icon={History} tone="violet" title="Historial de versiones" description="Cada publicación queda guardada. Puedes verla o volver a ella.">
        {releases.isPending && <LoadingState variant="page" />}
        {releases.isError && <ErrorState title={describeError(releases.error).title} description={describeError(releases.error).message} onRetry={() => releases.refetch()} />}
        {releases.isSuccess && rows.length === 0 && (
          <EmptyState icon={History} title="Aún no hay versiones" description="Cuando publiques por primera vez aparecerá aquí." action={<CapabilityButton capability={caps.publish} onClick={onPublish}><Rocket className="h-4 w-4" aria-hidden /> Publicar ahora</CapabilityButton>} />
        )}
        {rows.length > 0 && (
          <ol className="relative space-y-2 before:absolute before:bottom-6 before:left-[1.125rem] before:top-6 before:w-px before:bg-[hsl(var(--border))]">
            {rows.map((row) => {
              const isActive = row.id === activeId
              const meta = STATE[row.state] ?? STATE.ready
              const rowInteg = integrityInfo(row.integrityMode)
              return (
                <li key={row.id} className="relative flex gap-3">
                  <span className={`relative z-10 mt-3 grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--card))] ${isActive ? 'bg-emerald-500 text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                    {isActive ? <Radio className="h-4 w-4" aria-hidden /> : <History className="h-4 w-4" aria-hidden />}
                  </span>
                  <div className={`min-w-0 flex-1 ${ROW_CARD} ${isActive ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold tabular-nums">{formatDate(row.createdAt)}</p>
                      {isActive ? <StatusPill tone="success" size="sm" icon={CheckCircle2}>Activa</StatusPill> : <StatusPill tone={meta.tone} size="sm" icon={meta.icon}>{meta.label}</StatusPill>}
                      <StatusPill tone={rowInteg.tone} size="sm" icon={rowInteg.icon}>{rowInteg.label}</StatusPill>
                    </div>
                    {row.state === 'failed' && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{describeFailure(row.failureCode).message}</p>}
                    {row.state === 'ready' && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <CapabilityButton capability={caps.previewSite} size="sm" variant="ghost" className={TOUCH} onClick={() => setPreviewRelease(row)}><Eye className="h-4 w-4" aria-hidden /> Ver</CapabilityButton>
                        {!row.manifest?.previewOnly && !isActive && (
                          <CapabilityButton capability={caps.publish} size="sm" variant="outline" className={TOUCH} onClick={() => setRollbackTarget(row)}><Undo2 className="h-4 w-4" aria-hidden /> Volver a esta versión</CapabilityButton>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
        {releases.hasNextPage && <div className="mt-3 flex justify-center"><Button variant="outline" onClick={() => releases.fetchNextPage()} disabled={releases.isFetchingNextPage}>{releases.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}</Button></div>}
        <p role="note" className="mt-4 flex gap-2 rounded-xl bg-[hsl(var(--muted))]/50 p-3 text-xs text-[hsl(var(--muted-foreground))]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong className="font-semibold text-[hsl(var(--foreground))]">Sobre “Volver a esta versión”.</strong> Solo se puede volver a versiones que estuvieron publicadas. Si el servidor rechaza una, te lo diremos sin cambiar nada.</span>
        </p>
      </SitePanel>

      <ConfirmDialog
        open={Boolean(rollbackTarget)}
        onOpenChange={(open) => { if (!open && !busy) { setRollbackTarget(null); setRollbackError(null) } }}
        tone="warning"
        title="Volver a una versión anterior"
        description={`Tu sitio público volverá a la versión del ${formatDate(rollbackTarget?.createdAt)}. Tus borradores no se pierden.`}
        confirmLabel="Volver a esta versión"
        loading={busy}
        onConfirm={rollback}
      >
        {rollbackError && <div className="mt-3"><ErrorNotice error={rollbackError} /></div>}
      </ConfirmDialog>
      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={(open) => { if (!open && !busy) { setUnpublishOpen(false); setUnderstood(false) } }}
        title="Retirar el sitio"
        description="Tu sitio dejará de ser visible. No se borra nada: podrás publicarlo de nuevo."
        confirmLabel="Retirar el sitio"
        loading={busy}
        confirmDisabled={!understood}
        onConfirm={unpublish}
      >
        <label className="mt-3 flex items-center gap-3 text-sm">
          <Checkbox checked={understood} onCheckedChange={setUnderstood} aria-label="Entiendo que mis visitantes dejarán de ver el sitio" />
          Entiendo que mis visitantes dejarán de ver el sitio.
        </label>
      </ConfirmDialog>
      <PreviewDialog open={Boolean(previewRelease)} onOpenChange={(open) => { if (!open) setPreviewRelease(null) }} siteId={siteId} releaseId={previewRelease?.id ?? null} title={`Versión del ${formatDate(previewRelease?.createdAt)}`} />
    </div>
  )
}
