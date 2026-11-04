import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, LoadingState, StatusPill, TextField } from '@runly/ui'
import { Ban, CheckCircle2, CircleSlash, Clock, Globe, Link2, Loader2, PauseCircle, RefreshCw, Search, Sparkles, XCircle } from 'lucide-react'
import { describeError } from '../../lib/websiteErrors.js'
import { validateHostSlug } from '../../lib/pageRoute.js'
import { useDomains, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
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
const AVAILABILITY = {
  NAME_UNAVAILABLE: 'Ese nombre ya está en uso.', NAME_RESERVED: 'Ese nombre está reservado.', SLUG_INVALID: 'Usa de 3 a 50 letras minúsculas, números o guiones, sin guiones dobles.',
}

export default function SiteDomains({ siteId, caps }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const domains = useDomains(siteId)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [rowBusy, setRowBusy] = useState(null)
  const slugError = slug ? validateHostSlug(slug) : null

  async function reserve() {
    setBusy(true); setServerError(null)
    try {
      await api.reserveHostname(siteId, slug)
      setSlug('')
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { setServerError(error) } finally { setBusy(false) }
  }
  async function checkAvailability() {
    setBusy(true); setServerError(null); setAvailability(null)
    try { setAvailability((await api.hostnameAvailability(siteId, slug)).data) } catch (error) { setServerError(error) } finally { setBusy(false) }
  }
  async function act(domain, action) {
    setRowBusy(domain.hostname); setServerError(null)
    try {
      await (action === 'activate' ? api.activateHostname(siteId, domain.hostname) : action === 'release' ? api.releaseHostname(siteId, domain.hostname) : api.hostnameStatus(siteId, domain.hostname))
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { setServerError(error) } finally { setRowBusy(null) }
  }
  const info = serverError ? describeError(serverError) : null
  const fieldError = slugError ?? (info ? `${info.title}. ${info.message}` : undefined)
  const list = domains.data ?? []

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader icon={Globe} tone="emerald" title="Dominios" description="La dirección con la que tus visitantes encuentran el sitio." />

      <SitePanel id="addr-title" icon={Link2} tone="emerald" title="Dirección del sitio" description={list.length ? 'Copia la dirección o ábrela cuando esté activa.' : undefined}>
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
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {domain.registryManaged && !domain.ready && ['pending', 'assigned'].includes(domain.state) && (
                        <>
                          {domain.state === 'pending' && <CapabilityButton capability={caps.reserveHostname} size="sm" className={TOUCH} onClick={() => act(domain, 'activate')} disabled={rowIsBusy}>Activar</CapabilityButton>}
                          <Button size="sm" variant="outline" className={TOUCH} onClick={() => act(domain, 'status')} disabled={rowIsBusy}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Actualizar estado</Button>
                        </>
                      )}
                      {!domain.registryManaged && <CapabilityButton capability={caps.reserveHostname} size="sm" variant="ghost" className={TOUCH} onClick={() => act(domain, 'release')} disabled={rowIsBusy}>Liberar</CapabilityButton>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SitePanel>

      <SitePanel id="reserve-title" icon={Search} tone="blue" title="Elegir una dirección" description="Comprueba si el nombre está libre y resérvalo para este sitio.">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="min-w-0 flex-1">
            <TextField label="Nombre de la dirección" value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setServerError(null); setAvailability(null) }} placeholder="mi-negocio" error={fieldError} hint="3 a 50 caracteres: letras minúsculas, números y guiones." />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:pt-6">
            <Button variant="outline" onClick={checkAvailability} disabled={busy || !slug || Boolean(slugError)}><Search className="h-4 w-4" aria-hidden />Comprobar disponibilidad</Button>
            <CapabilityButton capability={caps.reserveHostname} onClick={reserve} disabled={busy || !slug || Boolean(slugError)}>{busy ? 'Reservando…' : 'Reservar'}</CapabilityButton>
          </div>
        </div>
        {availability && (
          <p role="status" className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${availability.available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]'}`}>
            {availability.available ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0" aria-hidden />}
            {availability.available ? 'Ese nombre está disponible.' : (AVAILABILITY[availability.reason] ?? 'Ese nombre no está disponible.')}
          </p>
        )}
      </SitePanel>

      <SitePanel
        id="custom-title"
        dashed
        icon={Sparkles}
        tone="violet"
        title={<>Dominio propio <StatusPill size="sm" icon={Clock}>Próximamente</StatusPill></>}
        description="Podrás usar tu propio dominio cuando esté disponible. Por ahora no hay nada que configurar."
      >
        <Button variant="outline" disabled>Conectar dominio propio</Button>
      </SitePanel>
    </div>
  )
}
