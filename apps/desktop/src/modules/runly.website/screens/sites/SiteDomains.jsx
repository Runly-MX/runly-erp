import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, LoadingState, PageHeader, StatusPill, TextField } from '@runly/ui'
import { Globe } from 'lucide-react'
import { describeError } from '../../lib/websiteErrors.js'
import { validateHostSlug } from '../../lib/pageRoute.js'
import { useDomains, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'

// Never claims HTTPS or "active" while `ready` is false (contracts section 4).
function domainStatus(domain) {
  if (domain.ready) return { label: 'Activa', tone: 'success' }
  if (domain.state === 'suspended') return { label: 'Suspendida', tone: 'danger' }
  if (domain.state === 'revoked') return { label: 'Revocada', tone: 'danger' }
  if (domain.state === 'quarantined') return { label: 'Liberada', tone: 'neutral' }
  if (domain.state === 'assigned') return { label: 'Activada · infraestructura en preparación', tone: 'warning' }
  if (domain.state === 'pending' || domain.state === 'reserved' || !domain.state) return { label: 'Reservada · en preparación', tone: 'warning' }
  return { label: domain.state, tone: 'neutral' }
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
      await (action === 'activate' ? api.activateHostname(siteId, domain.hostname) : api.hostnameStatus(siteId, domain.hostname))
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { setServerError(error) } finally { setRowBusy(null) }
  }
  const info = serverError ? describeError(serverError) : null
  const fieldError = slugError ?? (info ? `${info.title}. ${info.message}` : undefined)

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Dominios" description="La dirección con la que tus visitantes encuentran el sitio." />
      <section aria-labelledby="addr-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="addr-title" className="text-base font-semibold">Dirección del sitio</h2>
        {domains.isPending && <LoadingState variant="page" />}
        {domains.isError && <ErrorState title={describeError(domains.error).title} description={describeError(domains.error).message} onRetry={() => domains.refetch()} />}
        {domains.isSuccess && (domains.data ?? []).length === 0 && <EmptyState variant="compact" icon={Globe} title="Este sitio todavía no tiene una dirección." />}
        <ul className="space-y-2">
          {(domains.data ?? []).map((domain) => {
            const status = domainStatus(domain)
            return (
              <li key={domain.hostname} className="flex flex-wrap items-center gap-3 text-sm">
                <code className="break-all">{domain.hostname}</code>
                <StatusPill tone={status.tone} size="sm">{status.label}</StatusPill>
                {!domain.ready && domain.state === 'pending' && <span className="text-xs text-[hsl(var(--muted-foreground))]">Tu dirección ya es tuya. Actívala cuando la infraestructura esté lista.</span>}
                {domain.registryManaged && !domain.ready && ['pending', 'assigned'].includes(domain.state) && (
                  <>
                    {domain.state === 'pending' && <CapabilityButton capability={caps.reserveHostname} size="sm" onClick={() => act(domain, 'activate')} disabled={rowBusy === domain.hostname}>Activar</CapabilityButton>}
                    <Button size="sm" variant="outline" onClick={() => act(domain, 'status')} disabled={rowBusy === domain.hostname}>Actualizar estado</Button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-labelledby="reserve-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="reserve-title" className="text-base font-semibold">Elegir una dirección</h2>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[14rem] flex-1">
            <TextField label="Nombre de la dirección" value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setServerError(null); setAvailability(null) }} placeholder="mi-negocio" error={fieldError} hint="3 a 50 caracteres: letras minúsculas, números y guiones." />
          </div>
          <div className="flex gap-2 pt-6">
            <Button variant="outline" onClick={checkAvailability} disabled={busy || !slug || Boolean(slugError)}>Comprobar disponibilidad</Button>
            <CapabilityButton capability={caps.reserveHostname} onClick={reserve} disabled={busy || !slug || Boolean(slugError)}>{busy ? 'Reservando…' : 'Reservar'}</CapabilityButton>
          </div>
        </div>
        {availability && <p role="status" className={availability.available ? 'text-sm text-emerald-600 dark:text-emerald-400' : 'text-sm text-[hsl(var(--destructive))]'}>{availability.available ? 'Ese nombre está disponible.' : (AVAILABILITY[availability.reason] ?? 'Ese nombre no está disponible.')}</p>}
      </section>
      <section aria-labelledby="custom-title" className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4">
        <h2 id="custom-title" className="flex items-center gap-2 text-base font-semibold">Dominio propio <StatusPill size="sm">Próximamente</StatusPill></h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Podrás usar tu propio dominio cuando esté disponible. Por ahora no hay nada que configurar.</p>
        <Button className="mt-3" variant="outline" disabled>Conectar dominio propio</Button>
      </section>
    </div>
  )
}
