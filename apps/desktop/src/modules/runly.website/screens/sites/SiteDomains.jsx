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
  if (domain.state === 'pending' || domain.state === 'reserved' || !domain.state) return { label: 'Reservada · en preparación', tone: 'warning' }
  return { label: domain.state, tone: 'neutral' }
}

export default function SiteDomains({ siteId, caps }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const domains = useDomains(siteId)
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const slugError = slug ? validateHostSlug(slug) : null

  async function reserve() {
    setBusy(true); setServerError(null)
    try {
      await api.reserveHostname(siteId, slug)
      setSlug('')
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { setServerError(error) } finally { setBusy(false) }
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
                {!domain.ready && <span className="text-xs text-[hsl(var(--muted-foreground))]">Tu dirección ya es tuya, pero aún no está activa. No tienes que hacer nada.</span>}
              </li>
            )
          })}
        </ul>
      </section>
      <section aria-labelledby="reserve-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="reserve-title" className="text-base font-semibold">Elegir una dirección</h2>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[14rem] flex-1">
            <TextField label="Nombre de la dirección" value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setServerError(null) }} placeholder="mi-negocio" error={fieldError} hint="3 a 50 caracteres: letras minúsculas, números y guiones." />
          </div>
          <div className="pt-6">
            <CapabilityButton capability={caps.reserveHostname} onClick={reserve} disabled={busy || !slug || Boolean(slugError)}>{busy ? 'Reservando…' : 'Reservar'}</CapabilityButton>
          </div>
        </div>
      </section>
      <section aria-labelledby="custom-title" className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-4">
        <h2 id="custom-title" className="flex items-center gap-2 text-base font-semibold">Dominio propio <StatusPill size="sm">Próximamente</StatusPill></h2>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Podrás usar tu propio dominio cuando esté disponible. Por ahora no hay nada que configurar.</p>
        <Button className="mt-3" variant="outline" disabled>Conectar dominio propio</Button>
      </section>
    </div>
  )
}
