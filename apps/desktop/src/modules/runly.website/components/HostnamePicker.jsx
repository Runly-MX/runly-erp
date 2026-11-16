import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TextField } from '@runly/ui'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { describeError } from '../lib/websiteErrors.js'
import { validateHostSlug } from '../lib/pageRoute.js'
import { useWebsiteScope, websiteKeys } from '../hooks/useWebsite.js'
import { CapabilityButton } from './CapabilityButton.jsx'

const AVAILABILITY = {
  NAME_UNAVAILABLE: 'Ese nombre ya está en uso.', NAME_RESERVED: 'Ese nombre está reservado.', SLUG_INVALID: 'Usa de 3 a 50 letras minúsculas, números o guiones, sin guiones dobles.',
}
const DEBOUNCE_MS = 400

// Platform subdomain picker: availability is asked to the server (local DB + global registry) as the user
// types; reserve is only enabled once the server says the exact slug is free. Registry names that come back
// `pending` are activated right away so the site does not stay without an address.
export function HostnamePicker({ siteId, caps, onReserved }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const [slug, setSlug] = useState('')
  const [check, setCheck] = useState({ slug: '', state: 'idle' }) // idle | checking | done | error
  const [busy, setBusy] = useState(false)
  const slugError = slug ? validateHostSlug(slug) : null

  useEffect(() => {
    if (!slug || slugError) { setCheck({ slug, state: 'idle' }); return undefined }
    let alive = true
    setCheck({ slug, state: 'checking' })
    const timer = setTimeout(async () => {
      try {
        const result = (await api.hostnameAvailability(siteId, slug)).data
        if (alive) setCheck({ slug, state: 'done', ...result })
      } catch (error) { if (alive) setCheck({ slug, state: 'error', error }) }
    }, DEBOUNCE_MS)
    return () => { alive = false; clearTimeout(timer) }
  }, [api, siteId, slug, slugError])

  const current = check.slug === slug ? check : { state: 'checking' }
  const available = current.state === 'done' && current.available

  async function reserve() {
    setBusy(true)
    try {
      let domain = (await api.reserveHostname(siteId, slug)).data
      if (domain?.registryManaged && domain.state === 'pending') domain = (await api.activateHostname(siteId, domain.hostname)).data
      setSlug('')
      await queryClient.invalidateQueries({ queryKey: websiteKeys.domains(companyId, siteId) })
      toast.success(domain?.ready ? `Dirección ${domain.hostname} activa.` : `Dirección ${domain?.hostname ?? ''} reservada; la infraestructura se está preparando.`)
      onReserved?.(domain)
    } catch (error) {
      const info = describeError(error)
      toast.error(`${info.title}. ${info.message}`)
      setCheck({ slug, state: 'error', error })
    } finally { setBusy(false) }
  }

  const errorInfo = current.state === 'error' ? describeError(current.error) : null
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <TextField label="Nombre de la dirección" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().trim())} placeholder="mi-negocio" error={slugError ?? (errorInfo ? `${errorInfo.title}. ${errorInfo.message}` : undefined)} hint="3 a 50 caracteres: letras minúsculas, números y guiones." />
        </div>
        <div className="md:pt-6">
          <CapabilityButton capability={caps.reserveHostname} onClick={reserve} disabled={busy || !available}>{busy ? 'Reservando…' : 'Reservar dirección'}</CapabilityButton>
        </div>
      </div>
      {slug && !slugError && current.state !== 'error' && (
        <p role="status" aria-live="polite" className={`flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${current.state === 'checking' ? 'bg-[hsl(var(--muted))]/50 text-[hsl(var(--muted-foreground))]' : available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]'}`}>
          {current.state === 'checking' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : available ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0" aria-hidden />}
          {current.state === 'checking' ? 'Comprobando disponibilidad…' : available ? 'Ese nombre está disponible.' : (AVAILABILITY[current.reason] ?? 'Ese nombre no está disponible.')}
        </p>
      )}
    </div>
  )
}
