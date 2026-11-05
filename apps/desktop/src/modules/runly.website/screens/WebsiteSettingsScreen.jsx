import { companyFetch } from '../../../lib/companyFetch.js'
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, ChipTabs, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { BarChart3, Globe, Mail, Users } from 'lucide-react'
import { SiteSectionHeader } from '../components/SiteSectionHeader.jsx'
import { SettingsCard } from '../components/SettingsCard.jsx'
import { SettingsSmtpCard } from '../components/SettingsSmtpCard.jsx'
import { SettingsAnalyticsCard } from '../components/SettingsAnalyticsCard.jsx'
import { SettingsAccountsCard } from '../components/SettingsAccountsCard.jsx'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly, getActiveCompanyId } from '../../../lib/runly.js'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider.jsx'
import { WebsiteSourceSelector } from '../components/WebsiteSourceSelector.jsx'
import { useScopedSite } from '../hooks/useScopedSite.js'
import { DistUploadPanel } from '../components/DistUploadPanel.jsx'

async function apiFetch(path, token, options = {}) {
  const companyId = getActiveCompanyId()
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
      ...(companyId ? { 'X-Runly-Company-Id': companyId } : {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

async function apiFetchForm(path, token, options = {}) {
  const companyId = getActiveCompanyId()
  const res = await companyFetch(`${getApiUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
      ...(companyId ? { 'X-Runly-Company-Id': companyId } : {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

const SMTP_EMPTY = { host: '', port: 587, user: '', pass: '', from_name: '', from_email: '', tls: false }
const CAPTURE_EMPTY = {
  analyticsMode: 'off',
  turnstileSiteKey: '',
  turnstileSecretKey: '',
}
const ANALYTICS_MODE_OPTIONS = [
  { value: 'off', label: 'Desactivada' },
  { value: 'anonymous', label: 'Anónima' },
  { value: 'consent_required', label: 'Requiere consentimiento' },
]

export default function WebsiteSettingsScreen({ siteId: siteIdProp = null }) {
  const { activeCompanyId } = useActiveCompany()
  const smtpDirtyRef = useRef(false)
  const { session } = useAuth()
  const token = session?.access_token
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [smtpForm, setSmtpForm] = useState(SMTP_EMPTY)
  const [passChanged, setPassChanged] = useState(false)
  const [captureForm, setCaptureForm] = useState(CAPTURE_EMPTY)
  const [turnstileSecretChanged, setTurnstileSecretChanged] = useState(false)

  // --- Site query (same pattern as WebsiteOverviewScreen) ---
  const siteQuery = useScopedSite(siteIdProp)
  const siteId = siteQuery.data?.data?.id
  // Inside a site workspace the file source is managed by "Importar ZIP"; the
  // historical source switch only exists on the legacy route.
  const scoped = Boolean(siteIdProp)
  const [tab, setTab] = useState(scoped ? 'smtp' : 'source')

  useEffect(() => {
    const site = siteQuery.data?.data
    if (!site) return
    setCaptureForm({
      analyticsMode: site.analyticsMode ?? 'off',
      turnstileSiteKey: site.turnstileSiteKey ?? '',
      turnstileSecretKey: '',
    })
    setTurnstileSecretChanged(false)
  }, [siteQuery.data])

  // --- Source query ---
  const sourceQuery = useQuery({
    queryKey: ['website-site-source', siteId],
    queryFn: () => apiFetch(`/website/sites/${siteId}`, token),
    enabled: Boolean(token) && Boolean(siteId) && !scoped,
  })

  // --- SMTP config query ---
  const configQuery = useQuery({
    queryKey: ['website-smtp-settings', activeCompanyId],
    queryFn: () => runly.settings.getWebsiteSmtp(token),
    enabled: Boolean(token && activeCompanyId),
  })

  useEffect(() => {
    const data = configQuery.data?.data
    if (!data || smtpDirtyRef.current) return
    setSmtpForm({
      host:       data.host,
      port:       data.port,
      user:       data.user,
      pass:       '',
      from_name:  data.from_name,
      from_email: data.from_email,
      tls:        data.tls,
    })
  }, [configQuery.data])

  const smtpSaveMutation = useMutation({
    mutationFn: (data) =>
      runly.settings.saveWebsiteSmtp(data, token),
    onSuccess: () => {
      smtpDirtyRef.current = false
      toast.success('Configuracion SMTP del website guardada')
      setPassChanged(false)
      setSmtpForm((current) => ({ ...current, pass: '' }))
      configQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const smtpTestMutation = useMutation({
    mutationFn: () => runly.settings.testWebsiteSmtp(token),
    onSuccess: (res) => {
      const label = res.source === 'website' ? 'SMTP propio del sitio' : 'SMTP de la empresa'
      toast.success(`Email de prueba enviado via ${label}`)
    },
    onError: (err) => toast.error(`Error: ${err.message}`),
  })

  const sourceChangeMutation = useMutation({
    mutationFn: (newSource) =>
      apiFetch(`/website/sites/${siteId}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ sourceType: newSource }),
      }),
    onSuccess: () => {
      toast.success('Fuente del sitio actualizada')
      sourceQuery.refetch()
    },
    onError: (err) => toast.error(err.message ?? 'Error al cambiar la fuente'),
  })

  const captureSaveMutation = useMutation({
    mutationFn: (data) =>
      apiFetch(`/website/site/${siteId}`, token, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Configuracion de analitica guardada')
      setTurnstileSecretChanged(false)
      queryClient.invalidateQueries({ queryKey: ['website-site'] })
      siteQuery.refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const uploadDistMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetchForm(`/website/sites/${siteId}/dist/upload`, token, {
        method: 'POST',
        body: formData,
      })
    },
    onMutate: () => ({ toastId: toast.loading('Subiendo build...') }),
    onSuccess: (res, _vars, ctx) => {
      toast.success(`Build subido: ${res.data.fileCount} archivos`, { id: ctx.toastId })
      sourceQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['website-builds', siteId] })
    },
    onError: (err, _vars, ctx) => toast.error(err.message ?? 'Error al subir el build', { id: ctx.toastId }),
  })

  const deleteDistMutation = useMutation({
    mutationFn: () =>
      apiFetchForm(`/website/sites/${siteId}/dist`, token, { method: 'DELETE' }),
    onMutate: () => ({ toastId: toast.loading('Eliminando build...') }),
    onSuccess: (_res, _vars, ctx) => {
      toast.success('Build eliminado. El sitio volvera al constructor de paginas.', { id: ctx.toastId })
      sourceQuery.refetch()
    },
    onError: (err, _vars, ctx) => toast.error(err.message ?? 'Error al eliminar el build', { id: ctx.toastId }),
  })

  function handleSmtpSubmit(e) {
    e.preventDefault()
    const payload = {
      host:       smtpForm.host,
      port:       Number(smtpForm.port),
      user:       smtpForm.user,
      from_name:  smtpForm.from_name  || undefined,
      from_email: smtpForm.from_email || undefined,
      tls:        smtpForm.tls,
    }
    if (passChanged && smtpForm.pass) payload.pass = smtpForm.pass
    smtpSaveMutation.mutate(payload)
  }

  function handleCaptureSubmit(e) {
    e.preventDefault()
    const payload = {
      analyticsMode: captureForm.analyticsMode,
      turnstileSiteKey: captureForm.turnstileSiteKey.trim() || null,
    }
    if (turnstileSecretChanged) {
      payload.turnstileSecretKey =
        captureForm.turnstileSecretKey.trim() || null
    }
    captureSaveMutation.mutate(payload)
  }

  const smtpConfigured = configQuery.data?.data?.configured ?? false
  const turnstileSecretSet =
    siteQuery.data?.data?.turnstileSecretKeySet ?? false

  const header = (
    <SiteSectionHeader
      icon={Mail}
      tone="emerald"
      title="Correo y analítica"
      description="Ajusta el envío de correos, la medición de visitas y la protección de formularios."
    />
  )

  if (siteQuery.isError) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState
          title="No se pudo cargar la configuración"
          message={siteQuery.error?.message}
          onRetry={() => siteQuery.refetch()}
        />
      </div>
    )
  }

  // No site configured yet — show empty state
  if (!siteQuery.isPending && !siteId) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        {header}
        <EmptyState
          icon={Globe}
          title="No hay sitio configurado"
          description="Completa el asistente de configuración para activar estas opciones."
          action={
            <Button onClick={() => navigate('/app/m/runly.website')}>
              Ir al asistente
            </Button>
          }
        />
      </div>
    )
  }

  const tabs = [
    ...(!scoped ? [{ value: 'source', label: 'Fuente del sitio', icon: Globe }] : []),
    { value: 'smtp', label: 'Correo', icon: Mail },
    { value: 'analytics', label: 'Analítica', icon: BarChart3 },
    { value: 'accounts', label: 'Cuentas de clientes', icon: Users },
  ]

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-4xl mx-auto w-full">
        {header}

        <ChipTabs ariaLabel="Secciones de configuración" showDescription={false} tabs={tabs} value={tab} onChange={setTab} />

        {!scoped && tab === 'source' && (
          <SettingsCard icon={Globe} tone="blue" title="Fuente del sitio" description="Elige qué se sirve en la ruta raíz de tu dominio.">
            {sourceQuery.isPending || siteQuery.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
                <Skeleton className="h-16 rounded-lg" />
              </div>
            ) : (
              <div className="space-y-4">
                <WebsiteSourceSelector
                  currentSource={sourceQuery.data?.data?.sourceType ?? 'builder'}
                  onSelect={(value) => sourceChangeMutation.mutate(value)}
                  isLoading={sourceChangeMutation.isPending}
                />
                {sourceQuery.data?.data?.sourceType === 'dist' && (
                  <div className="pt-4 border-t border-[hsl(var(--border))]">
                    <p className="text-sm font-medium mb-3">Archivos del build</p>
                    <DistUploadPanel
                      site={sourceQuery.data?.data}
                      token={token}
                      siteId={siteId}
                      onUpload={(file) => uploadDistMutation.mutate(file)}
                      onDelete={() => deleteDistMutation.mutate()}
                      isUploading={uploadDistMutation.isPending || deleteDistMutation.isPending}
                      uploadError={uploadDistMutation.isError ? uploadDistMutation.error?.message : null}
                    />
                  </div>
                )}
              </div>
            )}
          </SettingsCard>
        )}

        {tab === 'smtp' && (
          <SettingsSmtpCard
            form={smtpForm}
            setForm={setSmtpForm}
            configured={smtpConfigured}
            loading={configQuery.isPending}
            passChanged={passChanged}
            onPassChange={(value) => {
              setSmtpForm((f) => ({ ...f, pass: value }))
              setPassChanged(true)
            }}
            onTlsChange={(checked) => { smtpDirtyRef.current = true; setSmtpForm((f) => ({ ...f, tls: checked })) }}
            onDirty={() => { smtpDirtyRef.current = true }}
            onSubmit={handleSmtpSubmit}
            saving={smtpSaveMutation.isPending}
            onTest={() => smtpTestMutation.mutate()}
            testing={smtpTestMutation.isPending}
          />
        )}

        {tab === 'analytics' && (
          <SettingsAnalyticsCard
            form={captureForm}
            setForm={setCaptureForm}
            modeOptions={ANALYTICS_MODE_OPTIONS}
            secretSet={turnstileSecretSet}
            secretChanged={turnstileSecretChanged}
            onSecretChange={(value) => {
              setCaptureForm((current) => ({ ...current, turnstileSecretKey: value }))
              setTurnstileSecretChanged(true)
            }}
            onSubmit={handleCaptureSubmit}
            saving={captureSaveMutation.isPending}
          />
        )}

        {tab === 'accounts' && siteId && <SettingsAccountsCard siteId={siteId} token={token} />}
      </div>
    </div>
  )
}
