import { companyFetch } from '../../../lib/companyFetch.js'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  PasswordField,
  StatusPill,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  Skeleton,
  TextareaField,
  TextField,
} from '@runly/ui'
import { CircleCheck, CircleDashed, CreditCard, Info, KeyRound, Lock, MessageSquareText, Settings2, ShieldCheck } from 'lucide-react'
import { SiteSectionHeader } from '../components/SiteSectionHeader.jsx'
import { useScopedSite } from '../hooks/useScopedSite.js'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'

async function apiPatch(path, token, body) {
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export default function WebsitePaymentsScreen({ siteId: siteIdProp = null }) {
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [publishableKey, setPublishableKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const siteQuery = useScopedSite(siteIdProp)

  const site = siteQuery.data?.data ?? null
  const siteId = site?.id ?? null

  useEffect(() => {
    if (!site) return
    setPublishableKey(site.stripePublishableKey ?? '')
    setSecretKey('')
    setSuccessMessage(site.stripeSuccessMessage ?? '')
  }, [siteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: (payload) => apiPatch(`/website/site/${siteId}`, token, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website-site'] })
      toast.success('Configuración de pagos guardada')
      setSheetOpen(false)
    },
    onError: (err) => toast.error(err.message ?? 'Error al guardar'),
  })

  function handleSave(e) {
    e.preventDefault()
    if (!siteId) return
    const payload = {
      stripePublishableKey: publishableKey || null,
      stripeSuccessMessage: successMessage || null,
    }
    if (secretKey.trim()) payload.stripeSecretKey = secretKey.trim()
    saveMutation.mutate(payload)
  }

  const keysConfigured = Boolean(site?.stripePublishableKey && site?.stripeSecretKeySet)

  const details = site ? [
    { icon: KeyRound, label: 'Clave publicable', value: site.stripePublishableKey ? `${site.stripePublishableKey.slice(0, 8)}…` : 'Sin capturar', ok: Boolean(site.stripePublishableKey), mono: Boolean(site.stripePublishableKey) },
    { icon: Lock, label: 'Clave secreta', value: site.stripeSecretKeySet ? 'Guardada y cifrada' : 'Sin capturar', ok: Boolean(site.stripeSecretKeySet) },
    { icon: MessageSquareText, label: 'Mensaje de éxito', value: site.stripeSuccessMessage ? 'Personalizado' : 'Predeterminado', ok: true },
  ] : []

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader
        icon={CreditCard}
        tone="amber"
        title="Pagos"
        description="Conecta una pasarela de pago para cobrar en tu tienda en línea."
      />

      {siteQuery.isPending ? (
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      ) : !site ? (
        <EmptyState
          icon={CreditCard}
          title="Sin sitio web"
          description="Crea un sitio web antes de configurar los pagos."
        />
      ) : (
        <>
          {site.siteType !== 'ecommerce' && (
            <Alert role="status">
              <Info className="h-4 w-4" aria-hidden="true" />
              <div>
                <AlertTitle>El checkout solo aplica a tiendas</AlertTitle>
                <AlertDescription>
                  Este sitio es de tipo <strong>{site.siteType}</strong>. El checkout de Stripe solo aplica a sitios de tipo <strong>ecommerce</strong>.
                </AlertDescription>
              </div>
            </Alert>
          )}

          <section aria-label="Stripe" className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="flex flex-wrap items-center gap-4 p-4 md:p-5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#635BFF]/12" aria-hidden>
                <span className="font-mono text-xl font-bold text-[#635BFF] dark:text-[#8B85FF]">S</span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">Stripe</h2>
                  {keysConfigured
                    ? <StatusPill tone="success" icon={CircleCheck} size="sm">Conectado</StatusPill>
                    : <StatusPill tone="neutral" icon={CircleDashed} size="sm">Sin configurar</StatusPill>}
                </div>
                <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Pagos con tarjeta y transferencias</p>
              </div>
              <Button className="w-full sm:w-auto" variant={keysConfigured ? 'outline' : 'default'} onClick={() => setSheetOpen(true)}>
                <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
                {keysConfigured ? 'Editar' : 'Configurar'}
              </Button>
            </div>
            <dl className="grid border-t border-[hsl(var(--border))] sm:grid-cols-3 sm:divide-x sm:divide-[hsl(var(--border))]">
              {details.map((item) => (
                <div key={item.label} className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-3 last:border-b-0 sm:border-b-0 md:px-5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.ok ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs text-[hsl(var(--muted-foreground))]">{item.label}</dt>
                    <dd className={`truncate text-sm font-medium ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Configurar Stripe</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSave} className="flex flex-col gap-6 pt-4">
            <div className="space-y-4">
              <TextField
                label="Clave publicable (Publishable Key)"
                icon={CreditCard}
                placeholder="pk_live_... o pk_test_..."
                value={publishableKey}
                onChange={(e) => setPublishableKey(e.target.value)}
              />
              <PasswordField
                label={site?.stripeSecretKeySet ? 'Clave secreta (dejar en blanco para mantener)' : 'Clave secreta (Secret Key)'}
                placeholder={site?.stripeSecretKeySet ? '••••••••••••••••' : 'sk_live_... o sk_test_...'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
              />
              <p className="flex items-start gap-2 rounded-lg bg-[hsl(var(--muted))]/50 p-3 text-xs text-[hsl(var(--muted-foreground))]">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                La clave secreta se almacena cifrada con AES-256-GCM y nunca se expone en respuestas de la API.
              </p>
            </div>

            <div className="space-y-4">
              <TextareaField
                label="Mensaje de éxito (opcional)"
                placeholder="Gracias por tu compra. Te enviaremos un correo con los detalles."
                value={successMessage}
                onChange={(e) => setSuccessMessage(e.target.value)}
                rows={3}
              />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !siteId}>
                {saveMutation.isPending ? 'Guardando...' : 'Guardar configuración'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
