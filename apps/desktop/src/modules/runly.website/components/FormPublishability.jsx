import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, StatusPill } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Link2, ShieldQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/websiteErrors.js'
import { describePublishability } from '../lib/formPublishability.js'
import { editorPath, sitePath } from '../lib/pageRoute.js'
import { usePages, useWebsiteCapabilities, useWebsiteScope } from '../hooks/useWebsite.js'
import { CapabilityButton } from './CapabilityButton.jsx'

// Plain-language explanation of C-4 publishability. Nothing is hidden or removed
// automatically: blocked forms stay listed with the cause and the way out.
export function FormPublishability({ form, siteId }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const pages = usePages(siteId)
  const caps=useWebsiteCapabilities(siteId)
  const canResolve = caps.formsManage
  const canResolveAmbiguous = caps.formsResolveAmbiguous
  const [ambiguousOpen, setAmbiguousOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const info = describePublishability(form.publishability)
  const usedBy = form.publishability?.usedBy ?? []
  const titleOf = (pageId) => (pages.data ?? []).find((page) => page.id === pageId)?.title ?? 'Página'

  async function resolve(resolveAmbiguous) {
    setBusy(true)
    try {
      await api.resolveFormScope(siteId, form.id, { expectedLegacySiteId: siteId, resolveAmbiguous })
      toast.success('Propiedad confirmada para este sitio.')
      await queryClient.invalidateQueries({ queryKey: ['website-forms'] })
      await queryClient.invalidateQueries({ queryKey: ['website', companyId] })
      setAmbiguousOpen(false)
    } catch (error) {
      toast.error(describeError(error).message)
    } finally { setBusy(false) }
  }

  const Icon = info.tone === 'success' ? CheckCircle2 : info.tone === 'danger' ? AlertTriangle : ShieldQuestion
  return (
    <section aria-label="Publicación del formulario" className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4" data-publishability={form.publishability?.state}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={info.tone} icon={Icon} size="sm">{info.title}</StatusPill>
        {form.owner?.kind && <span className="text-xs text-[hsl(var(--muted-foreground))]">Propietario: {form.owner.kind === 'website' ? 'este sitio' : 'Growth'}</span>}
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{info.text}</p>

      {form.publishability?.state === 'owner_unresolved' && (
        <CapabilityButton capability={canResolve} size="sm" disabled={busy} onClick={() => resolve(false)}>
          <Link2 className="h-4 w-4" /> {busy ? 'Confirmando…' : 'Confirmar que pertenece a este sitio'}
        </CapabilityButton>
      )}
      {form.publishability?.state === 'owner_ambiguous' && (
        <>
          <Alert variant="warning" role="note">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div>
              <AlertTitle>Resolverlo requiere permisos de Website y de Growth</AlertTitle>
              <AlertDescription>Al confirmarlo, este formulario queda como propiedad de este sitio. No se puede deshacer desde aquí.</AlertDescription>
            </div>
          </Alert>
          <CapabilityButton capability={canResolve.allowed ? canResolveAmbiguous : canResolve} size="sm" variant="outline" disabled={busy} onClick={() => setAmbiguousOpen(true)}>
            Resolver propiedad…
          </CapabilityButton>
        </>
      )}

      {usedBy.length > 0 ? (
        <div>
          <p className="text-sm font-medium">Dónde se usa en este sitio</p>
          <ul className="mt-1 space-y-1 text-sm">
            {usedBy.map((ref) => (
              <li key={`${ref.pageId ?? ref.blogPostId}:${ref.blockId}`} className="flex items-center gap-2">
                {ref.pageId
                  ? <><span>Página “{titleOf(ref.pageId)}”</span><Button size="sm" variant="ghost" onClick={() => navigate(editorPath(siteId, ref.pageId))}>Abrir en el editor</Button></>
                  : <><span>Entrada del blog</span><Button size="sm" variant="ghost" onClick={() => navigate(sitePath(siteId, `blog/${ref.blogPostId}`))}>Abrir entrada</Button></>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        form.publishability?.state && <p className="text-xs text-[hsl(var(--muted-foreground))]">Todavía no se usa en ninguna página de este sitio.</p>
      )}

      <ConfirmDialog
        open={ambiguousOpen}
        onOpenChange={(open) => { if (!open && !busy) setAmbiguousOpen(false) }}
        title="Resolver propiedad ambigua"
        description="Este formulario podría pertenecer a otro sitio o a Growth. Si continúas, quedará asignado a este sitio. Sus respuestas y datos históricos se conservan."
        confirmLabel="Asignar a este sitio"
        loading={busy}
        onConfirm={() => resolve(true)}
      />
    </section>
  )
}
