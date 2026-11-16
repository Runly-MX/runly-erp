import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { ArrowRight, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/websiteErrors.js'
import { sitePath } from '../lib/pageRoute.js'
import { isDomainPreparing, useWebsiteScope, websiteKeys } from '../hooks/useWebsite.js'
import { CapabilityButton } from './CapabilityButton.jsx'
import { HostnamePicker } from './HostnamePicker.jsx'

// Explains whether the site has a public address and what to do next: pick one, wait for one that is
// being prepared (useDomains polls it), or activate one left pending. Renders nothing once an address is ready.
export function AddressRequirement({ siteId, caps, domains, required = false, onNavigate }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const [activating, setActivating] = useState(null)
  const list = (domains.data ?? []).filter((domain) => domain.kind !== 'custom' || domain.ready)
  const ready = list.find((domain) => domain.ready)
  const preparing = list.find(isDomainPreparing)
  const wasPreparing = useRef(false)

  useEffect(() => {
    if (ready && wasPreparing.current) toast.success(`La dirección ${ready.hostname} ya está activa.`)
    wasPreparing.current = Boolean(preparing) && !ready
  }, [ready, preparing])

  if (!domains.isSuccess || ready) return null

  async function activate(domain) {
    setActivating(domain.hostname)
    try {
      await api.activateHostname(siteId, domain.hostname)
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
    } catch (error) { const info = describeError(error); toast.error(`${info.title}. ${info.message}`) } finally { setActivating(null) }
  }
  const goToDomains = () => { onNavigate?.(); navigate(sitePath(siteId, 'domains')) }

  return (
    <Alert variant={required ? 'warning' : 'default'} role="status">
      {preparing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Globe className="h-4 w-4" aria-hidden="true" />}
      <div className="min-w-0 space-y-3">
        <div>
          <AlertTitle>
            {preparing ? `Tu dirección ${preparing.hostname} se está preparando` : required ? 'Necesitas una dirección para publicar este sitio' : 'Tu sitio todavía no tiene una dirección pública'}
          </AlertTitle>
          <AlertDescription>
            {preparing
              ? preparing.state === 'pending'
                ? 'La dirección está reservada pero falta activarla.'
                : `Estamos configurando la infraestructura. Revisamos el estado automáticamente cada pocos segundos; ${required ? 'podrás activar la versión en cuanto esté lista.' : 'el sitio se verá en esa dirección en cuanto esté lista.'}`
              : required
                ? 'Un sitio importado desde ZIP solo se puede activar cuando tiene su propia dirección lista. Elige un nombre aquí o ve a Dominios.'
                : 'Elige un nombre para que tus visitantes puedan encontrar el sitio.'}
          </AlertDescription>
        </div>
        {!preparing && <HostnamePicker siteId={siteId} caps={caps} />}
        <div className="flex flex-wrap gap-2">
          {preparing?.state === 'pending' && preparing.registryManaged && (
            <CapabilityButton capability={caps.reserveHostname} size="sm" onClick={() => activate(preparing)} disabled={activating === preparing.hostname}>
              {activating === preparing.hostname ? 'Activando…' : 'Activar dirección'}
            </CapabilityButton>
          )}
          {preparing && <Button size="sm" variant="outline" onClick={() => domains.refetch()} disabled={domains.isFetching}>{domains.isFetching ? 'Comprobando…' : 'Comprobar ahora'}</Button>}
          <Button size="sm" variant="ghost" onClick={goToDomains}>Ir a Dominios <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
        </div>
      </div>
    </Alert>
  )
}
