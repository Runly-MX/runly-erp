import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, SelectField, StatusPill } from '@runly/ui'
import { Ban, CheckCircle2, CircleSlash, Clock, Globe, Link2, Loader2, PauseCircle, RefreshCw, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../../lib/websiteErrors.js'
import { useDomains, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { CustomDomainPanel } from '../../components/CustomDomainPanel.jsx'
import { HostnamePicker } from '../../components/HostnamePicker.jsx'
import { SiteAddress } from '../../components/SiteAddress.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { ROW_CARD, SiteIconChip, SitePanel, TOUCH } from '../../components/SitePanel.jsx'

// Never claims HTTPS or "active" while `ready` is false (contracts section 4).
function domainStatus(domain) {
  if (domain.ready) return { label: 'Activa', tone: 'success', icon: CheckCircle2 }
  if (domain.state === 'suspended') return { label: 'Suspendida', tone: 'danger', icon: PauseCircle }
  if (domain.state === 'revoked') return { label: 'Revocada', tone: 'danger', icon: Ban }
  if (domain.state === 'quarantined') return { label: 'Liberada', tone: 'neutral', icon: CircleSlash }
  if (domain.state === 'assigned') return { label: 'Activada · infraestructura en preparación', tone: 'warning', icon: Clock }
  if (domain.state === 'pending' || domain.state === 'reserved' || !domain.state) return { label: 'Reservada · en preparación', tone: 'warning', icon: Clock }
  return { label: domain.state, tone: 'neutral', icon: Globe }
}
const NO_PRIMARY = '__none__'
const formatDate = (value) => { try { return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date(value)) } catch { return '' } }
// The server owns the window (freeAt); this only words it.
function releaseText(domain) {
  if (!domain.freeAt) return 'Ya no muestra el sitio. Puedes recuperarla cuando quieras.'
  if (new Date(domain.freeAt) > new Date()) return `Ya no muestra el sitio. Puedes recuperarla hasta el ${formatDate(domain.freeAt)}; después quedará libre para cualquier sitio.`
  return 'Liberada por completo: cualquier sitio puede reservarla. Mientras nadie la tome, todavía puedes recuperarla.'
}

export default function SiteDomains({ siteId, caps }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const domains = useDomains(siteId)
  const [serverError, setServerError] = useState(null)
  const [rowBusy, setRowBusy] = useState(null)
  const [releasing, setReleasing] = useState(null)

  async function act(domain, action) {
    setRowBusy(domain.hostname); setServerError(null)
    try {
      // Reclaim: a released local name stays bound to its site, and reserving its slug again re-enables it.
      await (action === 'activate' ? api.activateHostname(siteId, domain.hostname) : action === 'release' ? api.releaseHostname(siteId, domain.hostname) : action === 'reclaim' ? api.reserveHostname(siteId, domain.hostname.split('.')[0]) : api.hostnameStatus(siteId, domain.hostname))
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { setServerError(error) } finally { setRowBusy(null) }
  }
  const info = serverError ? describeError(serverError) : null
  // Customer-owned domains have their own panel and lifecycle; only platform addresses are listed here.
  const list = (domains.data ?? []).filter((domain) => domain.kind !== 'custom')
  // Primary applies to every active address of the site, platform or custom.
  const active = (domains.data ?? []).filter((domain) => domain.ready)
  const primary = active.find((domain) => domain.isPrimary)?.hostname ?? ''
  async function choosePrimary(hostname) {
    setRowBusy('primary'); setServerError(null)
    try {
      await api.setPrimaryHostname(siteId, hostname)
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
      toast.success(hostname ? `Las demás direcciones ahora redirigen a ${hostname}.` : 'Todas las direcciones muestran el sitio sin redirigir.')
    } catch (error) { setServerError(error) } finally { setRowBusy(null) }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader icon={Globe} tone="emerald" title="Dominios" description="La dirección con la que tus visitantes encuentran el sitio." />

      {active.length > 1 && (
        <SitePanel id="primary-title" icon={Star} tone="amber" title="Dirección principal" description="Todas las direcciones activas muestran el mismo sitio. Elige una como principal y las demás redirigirán a ella, así visitantes y buscadores ven una sola dirección.">
          <SelectField
            label="Principal"
            value={primary || NO_PRIMARY}
            onChange={(value) => choosePrimary(value === NO_PRIMARY ? null : value)}
            disabled={!caps.reserveHostname.allowed || rowBusy === 'primary'}
            options={[{ value: NO_PRIMARY, label: 'Ninguna (cada dirección muestra el sitio)' }, ...active.map((domain) => ({ value: domain.hostname, label: domain.hostname }))]}
          />
        </SitePanel>
      )}

      <SitePanel id="addr-title" icon={Link2} tone="emerald" title="Dirección del sitio" description={list.length ? 'Todas las direcciones activas muestran la misma versión publicada del sitio. Normalmente basta con una.' : undefined}>
        {domains.isPending && <LoadingState variant="page" />}
        {domains.isError && <ErrorState title={describeError(domains.error).title} description={describeError(domains.error).message} onRetry={() => domains.refetch()} />}
        {domains.isSuccess && list.length === 0 && (
          <EmptyState icon={Globe} title="Este sitio todavía no tiene una dirección" description="Elige un nombre abajo para reservar la dirección de tu sitio." />
        )}
        {list.length > 0 && (
          <ul className="space-y-2">
            {list.map((domain) => {
              const status = domainStatus(domain)
              const rowIsBusy = rowBusy === domain.hostname
              return (
                <li key={domain.hostname} className={ROW_CARD}>
                  <div className="flex flex-wrap items-center gap-3">
                    <SiteIconChip icon={domain.ready ? Globe : Clock} tone={domain.ready ? 'emerald' : 'amber'} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <SiteAddress hostname={domain.hostname} ready={domain.ready} />
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={status.tone} size="sm" icon={rowIsBusy ? Loader2 : status.icon}>{status.label}</StatusPill>
                        {!domain.ready && domain.state === 'pending' && <span className="text-xs text-[hsl(var(--muted-foreground))]">Tu dirección ya es tuya. Actívala cuando la infraestructura esté lista.</span>}
                        {domain.state === 'quarantined' && <span className="text-xs text-[hsl(var(--muted-foreground))]">{releaseText(domain)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {domain.registryManaged && !domain.ready && ['pending', 'assigned'].includes(domain.state) && (
                        <>
                          {domain.state === 'pending' && <CapabilityButton capability={caps.reserveHostname} size="sm" className={TOUCH} onClick={() => act(domain, 'activate')} disabled={rowIsBusy}>Activar</CapabilityButton>}
                          <Button size="sm" variant="outline" className={TOUCH} onClick={() => act(domain, 'status')} disabled={rowIsBusy}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Actualizar estado</Button>
                        </>
                      )}
                      {!domain.registryManaged && domain.state === 'quarantined' && <CapabilityButton capability={caps.reserveHostname} size="sm" variant="outline" className={TOUCH} onClick={() => act(domain, 'reclaim')} disabled={rowIsBusy}>Recuperar</CapabilityButton>}
                      {!domain.registryManaged && !['quarantined', 'revoked'].includes(domain.state) && <CapabilityButton capability={caps.reserveHostname} size="sm" variant="ghost" className={TOUCH} onClick={() => setReleasing(domain)} disabled={rowIsBusy}>Liberar</CapabilityButton>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SitePanel>

      <SitePanel id="reserve-title" icon={Search} tone="blue" title="Elegir una dirección" description="Escribe un nombre: comprobamos al momento si está libre y lo reservas para este sitio.">
        <HostnamePicker siteId={siteId} caps={caps} />
      </SitePanel>
      {info && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{info.title}. {info.message}</p>}

      <CustomDomainPanel siteId={siteId} caps={caps} />
      <ConfirmDialog
        open={Boolean(releasing)}
        onOpenChange={(open) => { if (!open) setReleasing(null) }}
        title="Liberar la dirección"
        description={`${releasing?.hostname ?? ''} dejará de mostrar el sitio de inmediato. Podrás recuperarla durante 15 días; después quedará libre y cualquier otro sitio podrá reservarla.`}
        confirmLabel="Liberar"
        onConfirm={async () => { const domain = releasing; setReleasing(null); await act(domain, 'release') }}
      />
    </div>
  )
}
