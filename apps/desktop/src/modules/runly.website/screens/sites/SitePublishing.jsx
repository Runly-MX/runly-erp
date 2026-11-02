import { useRef, useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, Checkbox, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader, StatusPill } from '@runly/ui'
import { Eye, History, PauseCircle, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError, describeFailure } from '../../lib/websiteErrors.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'

function formatDate(value) {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return '' }
}

const STATE = {
  preparing: { label: 'Preparando…', tone: 'brand' },
  ready: { label: 'Lista', tone: 'neutral' },
  failed: { label: 'No se pudo preparar', tone: 'danger' },
  revoked: { label: 'Revocada', tone: 'neutral' },
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

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Publicaciones"
        description="La versión que ven tus visitantes y el historial para volver atrás. Tus borradores no se pierden."
        actions={<CapabilityButton capability={caps.publish} onClick={onPublish}>Publicar</CapabilityButton>}
      />
      <section aria-labelledby="current-title" className="rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="current-title" className="text-base font-semibold">Versión publicada ahora</h2>
        {activeId && release ? (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            <span>{formatDate(release.createdAt)}</span>
            <CapabilityButton capability={caps.previewSite} size="sm" variant="outline" onClick={() => setPreviewRelease(release)}><Eye className="h-4 w-4" /> Ver esta versión</CapabilityButton>
            <CapabilityButton capability={caps.publish} size="sm" variant="outline" onClick={() => setUnpublishOpen(true)}><PauseCircle className="h-4 w-4" /> Retirar el sitio</CapabilityButton>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {site.lifecycle === 'unpublished' ? 'El sitio está retirado: nadie puede verlo. El historial y los borradores se conservan.' : 'Este sitio todavía no tiene una versión publicada.'}
          </p>
        )}
      </section>

      <section aria-labelledby="history-title" className="space-y-3">
        <h2 id="history-title" className="text-base font-semibold">Historial de versiones</h2>
        {releases.isPending && <LoadingState variant="page" />}
        {releases.isError && <ErrorState title={describeError(releases.error).title} description={describeError(releases.error).message} onRetry={() => releases.refetch()} />}
        {releases.isSuccess && rows.length === 0 && <EmptyState icon={History} title="Aún no hay versiones" description="Cuando publiques por primera vez aparecerá aquí." />}
        {rows.length > 0 && (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-2xl border border-[hsl(var(--border))]">
            {rows.map((row) => {
              const isActive = row.id === activeId
              const meta = STATE[row.state] ?? STATE.ready
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{formatDate(row.createdAt)}</p>
                    {row.state === 'failed' && <p className="text-xs text-[hsl(var(--muted-foreground))]">{describeFailure(row.failureCode).message}</p>}
                  </div>
                  {isActive ? <StatusPill tone="success" size="sm">Activa</StatusPill> : <StatusPill tone={meta.tone} size="sm">{meta.label}</StatusPill>}
                  <span className="ml-auto flex gap-2">
                    {row.state === 'ready' && (
                      <CapabilityButton capability={caps.previewSite} size="sm" variant="ghost" onClick={() => setPreviewRelease(row)}><Eye className="h-4 w-4" /> Ver</CapabilityButton>
                    )}
                    {row.state === 'ready' && !isActive && (
                      <CapabilityButton capability={caps.publish} size="sm" variant="outline" onClick={() => setRollbackTarget(row)}><Undo2 className="h-4 w-4" /> Volver a esta versión</CapabilityButton>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {releases.hasNextPage && <Button variant="outline" onClick={() => releases.fetchNextPage()} disabled={releases.isFetchingNextPage}>{releases.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}</Button>}
        <Alert role="note"><div><AlertTitle>Sobre “Volver a esta versión”</AlertTitle><AlertDescription>Solo se puede volver a versiones que estuvieron publicadas. Si el servidor rechaza una, te lo diremos sin cambiar nada.</AlertDescription></div></Alert>
      </section>

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
