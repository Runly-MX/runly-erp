import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusPill } from '@runly/ui'
import { Clock, Globe, Link2, Plus, Sparkles } from 'lucide-react'
import { describeError } from '../lib/websiteErrors.js'
import { useCustomDomains, useWebsiteScope, websiteKeys } from '../hooks/useWebsite.js'
import { CapabilityButton } from './CapabilityButton.jsx'
import { AddCustomDomainDialog, HTTPS_STATUS } from './AddCustomDomainDialog.jsx'
import { ROW_CARD, SiteIconChip, SitePanel, TOUCH } from './SitePanel.jsx'

// Own-domain section of the Dominios screen. Without RUNLY_WEBSITE_CUSTOM_DOMAIN_TARGET the instance reports
// `available: false` and the section stays an explained placeholder.
export function CustomDomainPanel({ siteId, caps }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const query = useCustomDomains(siteId)
  const [dialog, setDialog] = useState({ open: false, initial: null })
  const [releasing, setReleasing] = useState(null)
  const [releaseError, setReleaseError] = useState(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: websiteKeys.customDomains(companyId, siteId) })
  const items = (query.data?.items ?? []).filter((item) => item.state !== 'released')

  async function release() {
    setReleaseError(null)
    try {
      await api.releaseCustomDomain(siteId, releasing.hostname)
      setReleasing(null)
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })])
    } catch (error) { setReleaseError(error); setReleasing(null) }
  }

  if (query.isSuccess && !query.data.available) {
    return (
      <SitePanel id="custom-title" dashed icon={Sparkles} tone="violet" title={<>Dominio propio <StatusPill size="sm" icon={Clock}>No habilitado</StatusPill></>}
        description="Esta instalación todavía no tiene dominios propios habilitados. Pídele a quien la administra que los active.">
        <Button variant="outline" disabled>Conectar dominio propio</Button>
      </SitePanel>
    )
  }

  return (
    <SitePanel id="custom-title" icon={Link2} tone="violet" title="Dominio propio" description="Usa un dominio que ya es tuyo, como www.mitienda.mx, para tu sitio.">
      {query.isPending && <LoadingState variant="page" />}
      {query.isError && <ErrorState title={describeError(query.error).title} description={describeError(query.error).message} onRetry={() => query.refetch()} />}
      {releaseError && <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">{describeError(releaseError).title}. {describeError(releaseError).message}</p>}
      {query.isSuccess && items.length === 0 && (
        <EmptyState icon={Globe} title="Aún no conectas un dominio propio" description="Conecta uno y te diremos exactamente qué registros crear en tu DNS." />
      )}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => {
            const https = HTTPS_STATUS[item.httpsState] ?? HTTPS_STATUS.unknown
            return (
              <li key={item.hostname} className={ROW_CARD}>
                <div className="flex flex-wrap items-center gap-3">
                  <SiteIconChip icon={item.verified ? Globe : Clock} tone={item.verified ? 'emerald' : 'amber'} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="break-all text-sm font-medium">{item.hostname}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.verified
                        ? <><StatusPill size="sm" tone="success">Verificado</StatusPill><StatusPill size="sm" tone={https.tone} icon={https.icon}>{https.label}</StatusPill></>
                        : <StatusPill size="sm" tone="warning" icon={Clock}>Pendiente de DNS</StatusPill>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className={TOUCH} onClick={() => setDialog({ open: true, initial: item })}>{item.verified ? 'Ver detalles' : 'Instrucciones y verificar'}</Button>
                    <CapabilityButton capability={caps.customDomain} size="sm" variant="ghost" className={TOUCH} onClick={() => setReleasing(item)}>Liberar</CapabilityButton>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {query.isSuccess && (
        <div className="mt-3">
          <CapabilityButton capability={caps.customDomain} onClick={() => setDialog({ open: true, initial: null })}><Plus className="h-4 w-4" aria-hidden />Conectar dominio propio</CapabilityButton>
        </div>
      )}

      <AddCustomDomainDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} api={api} siteId={siteId} initial={dialog.initial} onChanged={() => { refresh(); queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) }) }} />
      <ConfirmDialog
        open={Boolean(releasing)}
        onOpenChange={(open) => { if (!open) setReleasing(null) }}
        title="Liberar dominio"
        description={`${releasing?.hostname ?? ''} dejará de mostrar este sitio de inmediato. Podrás volver a conectarlo cuando quieras.`}
        confirmLabel="Liberar"
        onConfirm={release}
      />
    </SitePanel>
  )
}
