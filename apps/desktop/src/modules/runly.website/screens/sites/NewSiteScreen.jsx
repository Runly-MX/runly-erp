import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { defaultTheme, defineTheme, serializePage } from '@raulbellosom/atlas-web-builder'
import { Alert, AlertDescription, AlertTitle, Button, PageHeader, TextField } from '@runly/ui'
import { AlertTriangle, Archive, CheckCircle2, Circle, FileText, Loader2, ShoppingBag } from 'lucide-react'
import { companyFetch } from '../../../../lib/companyFetch.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useWebsiteCapabilities, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { WizardStepIdentity } from '../wizard/WizardStepIdentity.jsx'
import { WizardStepTemplate } from '../wizard/WizardStepTemplate.jsx'

const STEP_LABELS = ['Cómo construirlo', 'Nombre e identidad', 'Punto de partida']

const SCENARIOS = [
  { id: 'website', icon: FileText, title: 'Sitio informativo', description: 'Páginas, contacto y blog, sin tienda. Es lo más simple para empezar.', recommended: true },
  { id: 'ecommerce', icon: ShoppingBag, title: 'Sitio con Catálogo', description: 'Muestra los productos publicados de tu Catálogo. No los duplica.' },
  { id: 'zip', icon: Archive, title: 'Importar un sitio (ZIP)', description: 'Sube un sitio estático ya compilado. No se instala ni se ejecuta código del servidor.' },
]

const STATUS_ICON = { pending: Circle, running: Loader2, done: CheckCircle2, error: AlertTriangle, skipped: Circle }

function StepIndicator({ index }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label="Pasos para crear el sitio">
      {STEP_LABELS.map((label, i) => (
        <li key={label} aria-current={i === index ? 'step' : undefined} className={i === index ? 'font-semibold' : 'text-[hsl(var(--muted-foreground))]'}>
          <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs">{i + 1}</span>{label}
        </li>
      ))}
    </ol>
  )
}

// Creation is a sequence of idempotent calls (backend has no atomic "site +
// template" endpoint yet, contract D-6). The site exists as a private draft
// after the first step, so a failure never leaves unusable state: each failed
// step can be retried on its own, or skipped when it is optional.
export default function NewSiteScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const token = session?.access_token
  const { api, companyId } = useWebsiteScope()
  const caps = useWebsiteCapabilities()
  const [step, setStep] = useState(0)
  const [scenario, setScenario] = useState(null)
  const [name, setName] = useState('')
  const [giro, setGiro] = useState('')
  const [nameError, setNameError] = useState('')
  const [identity, setIdentity] = useState(null)
  const [steps, setSteps] = useState(null)
  const [fatal, setFatal] = useState(null)
  const ctx = useRef({ keys: {}, siteId: null, revision: 0, logoFileId: null, pagesDone: new Set() })
  const brandingQuery = useQuery({
    queryKey: ['website', companyId, 'branding'],
    queryFn: async () => (await api.companyBranding()).data,
    enabled: Boolean(api && companyId),
    staleTime: 60_000,
  })

  const canCreate = caps.siteEdit.allowed
  const zipAllowed = caps.importZip.allowed

  const key = (name_) => (ctx.current.keys[name_] ??= newIdempotencyKey())
  const mark = (id, status, detail) => setSteps((prev) => prev?.map((item) => (item.id === id ? { ...item, status, detail } : item)) ?? prev)

  async function run(template, selectedPages, currentIdentity, startFrom = 0) {
    const siteType = scenario === 'ecommerce' ? 'ecommerce' : 'website'
    const plan = [
      { id: 'site', label: 'Crear el sitio (borrador privado)', optional: false },
      { id: 'logo', label: 'Subir el logo', optional: true, skip: !currentIdentity?.logoFile },
      { id: 'identity', label: 'Guardar la identidad', optional: true },
      { id: 'theme', label: 'Crear el tema (colores y tipografía)', optional: true },
      { id: 'pages', label: 'Crear las páginas de la plantilla', optional: true, skip: !template },
    ].filter((item) => !item.skip)
    if (startFrom === 0) setSteps(plan.map((item) => ({ ...item, status: 'pending' })))
    setFatal(null)
    const order = plan.map((item) => item.id)
    for (const id of order.slice(startFrom)) {
      mark(id, 'running')
      try {
        if (id === 'site' && !ctx.current.siteId) {
          const created = (await api.createSite({ name: name.trim(), siteType }, key('site'))).data
          ctx.current.siteId = created.id; ctx.current.revision = created.draftRevision ?? 0
          queryClient.invalidateQueries({ queryKey: websiteKeys.sites(companyId) })
        }
        if (id === 'logo' && currentIdentity?.logoFile && !ctx.current.logoFileId) {
          const form = new FormData()
          form.append('file', currentIdentity.logoFile); form.append('moduleKey', 'runly.website'); form.append('entityType', 'WebsiteSite')
          const res = await companyFetch(`${getApiUrl()}/files/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
          if (!res.ok) throw Object.assign(new Error('logo'), { status: res.status })
          ctx.current.logoFileId = (await res.json()).data?.id ?? null
        }
        if (id === 'identity') {
          const settings = { giro: giro.trim() || null, buildMode: 'web_builder', logoFileId: ctx.current.logoFileId, useCompanyLogo: Boolean(currentIdentity?.useCompanyLogo && !ctx.current.logoFileId) }
          const saved = (await api.saveIdentity(ctx.current.siteId, { settings }, ctx.current.revision, key('identity'))).data
          ctx.current.revision = saved?.draftRevision ?? ctx.current.revision
        }
        if (id === 'theme') {
          const tokens = { ...defaultTheme.tokens, color: { ...defaultTheme.tokens?.color, primary: currentIdentity.primaryColor, bg: currentIdentity.bgColor } }
          const built = defineTheme({ ...defaultTheme, id: 'site-theme', name: 'Tema del sitio', tokens })
          await api.createTheme({ siteId: ctx.current.siteId, name: 'Tema del sitio', tokens: built.tokens, typography: currentIdentity.font })
        }
        if (id === 'pages') {
          const list = template.pages.filter((page) => selectedPages.includes(page.id))
          for (const page of list) {
            if (ctx.current.pagesDone.has(page.id)) continue
            const slug = page.routePath.replace(/^\//, '').replace(/[^a-z0-9-]/g, '-') || 'inicio'
            const created = (await api.createPage(ctx.current.siteId, { title: page.label, slug, routePath: page.routePath, pageType: 'page', visibility: 'public' }, key(`page:${page.id}`))).data
            if (page.page) {
              await api.saveDraft(ctx.current.siteId, created.id, { document: JSON.parse(serializePage(page.page)), expectedRevision: created.revision ?? 0 }, key(`draft:${page.id}`))
            }
            ctx.current.pagesDone.add(page.id)
          }
        }
        mark(id, 'done')
      } catch (error) {
        mark(id, 'error', describeError(error).message)
        setFatal({ id, error, optional: plan.find((item) => item.id === id)?.optional })
        ctx.current.retry = { template, selectedPages, currentIdentity, from: order.indexOf(id) }
        return
      }
    }
    queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
    navigate(sitePath(ctx.current.siteId, 'overview'))
  }

  function finishIdentity(value) {
    if (!name.trim()) { setNameError('Escribe un nombre para el sitio.'); return }
    setNameError(''); setIdentity(value)
    if (scenario === 'zip') {
      setSteps([]); createZipSite()
    } else setStep(2)
  }

  async function createZipSite() {
    setSteps([{ id: 'site', label: 'Crear el sitio (borrador privado)', status: 'running' }])
    try {
      const created = (await api.createSite({ name: name.trim(), siteType: 'website' }, key('site'))).data
      queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      navigate(sitePath(created.id, 'import'))
    } catch (error) {
      setSteps([{ id: 'site', label: 'Crear el sitio (borrador privado)', status: 'error', detail: describeError(error).message }])
      setFatal({ id: 'site', error, optional: false, zip: true })
    }
  }

  const retry = () => {
    const r = ctx.current.retry
    if (fatal?.zip) { createZipSite(); return }
    if (r) run(r.template, r.selectedPages, r.currentIdentity, r.from)
  }
  const continueWithout = () => {
    if (ctx.current.siteId) navigate(sitePath(ctx.current.siteId, 'overview'))
  }

  if (steps) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
        <PageHeader title="Creando tu sitio" description="Cada paso se puede reintentar sin duplicar nada." />
        <ol className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-4" aria-live="polite">
          {steps.map((item) => {
            const Icon = STATUS_ICON[item.status] ?? Circle
            return (
              <li key={item.id} className="flex items-start gap-3 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 ${item.status === 'running' ? 'animate-spin' : ''} ${item.status === 'done' ? 'text-emerald-600' : item.status === 'error' ? 'text-[hsl(var(--destructive))]' : ''}`} aria-hidden="true" />
                <div><p className={item.status === 'error' ? 'font-medium' : ''}>{item.label}</p>{item.detail && <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</p>}</div>
              </li>
            )
          })}
        </ol>
        {fatal && (
          <Alert variant="warning" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <div>
              <AlertTitle>{ctx.current.siteId ? 'Tu sitio ya existe como borrador' : 'No se pudo crear el sitio'}</AlertTitle>
              <AlertDescription>{ctx.current.siteId ? 'Falló un paso. Puedes reintentarlo o continuar sin él y completarlo después.' : describeError(fatal.error).message}</AlertDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={retry}>Reintentar</Button>
                {ctx.current.siteId && <Button size="sm" variant="outline" onClick={continueWithout}>Continuar sin este paso</Button>}
                {!ctx.current.siteId && <Button size="sm" variant="outline" onClick={() => { setSteps(null); setFatal(null) }}>Volver</Button>}
              </div>
            </div>
          </Alert>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 pb-28 md:p-6">
      <PageHeader title="Crear sitio" description="Tres pasos. Lo demás (catálogo, formularios, dirección) es opcional y se hace después." onBack={() => navigate(PUBLIC_ROUTE_ROOT)} backLabel="Mis sitios" />
      <StepIndicator index={step} />
      {!canCreate && (
        <Alert variant="warning" className="mb-4" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>No tienes permiso para crear sitios</AlertTitle><AlertDescription>Pide a un administrador el permiso de edición del sitio web.</AlertDescription></div>
        </Alert>
      )}
      {step === 0 && (
        <section aria-labelledby="how-title" className="space-y-4">
          <h2 id="how-title" className="text-lg font-semibold">¿Cómo quieres construirlo?</h2>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-labelledby="how-title">
            {SCENARIOS.map((item) => {
              const disabled = item.id === 'zip' && !zipAllowed
              const selected = scenario === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => setScenario(item.id)}
                  className={`flex flex-col gap-2 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] hover:border-(--brand-primary)/50'}`}
                >
                  <item.icon className="h-6 w-6" aria-hidden="true" />
                  <span className="font-semibold">{item.title}{item.recommended && <span className="ml-2 text-xs font-medium text-(--brand-primary-text)">Recomendado</span>}</span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">{item.description}</span>
                  {disabled && <span className="text-xs">Necesitas permisos de importación y publicación.</span>}
                </button>
              )
            })}
          </div>
        </section>
      )}
      {step === 1 && (
        <section aria-labelledby="id-title" className="space-y-4">
          <h2 id="id-title" className="text-lg font-semibold">Nombre e identidad</h2>
          <TextField label="Nombre del sitio" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi sitio web" error={nameError || undefined} required />
          <TextField label="¿A qué se dedica? (opcional)" value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Cafetería, despacho contable…" />
          <WizardStepIdentity
            defaultValues={identity ?? undefined}
            companyLogoUrl={brandingQuery.data?.logoUrl ?? null}
            onNext={finishIdentity}
            onBack={() => setStep(0)}
          />
        </section>
      )}
      {step === 2 && (
        <section aria-labelledby="tpl-title" className="space-y-4">
          <h2 id="tpl-title" className="text-lg font-semibold">Punto de partida</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Elige una plantilla o empieza en blanco. Todo se puede cambiar después.</p>
          <WizardStepTemplate onBack={() => setStep(1)} isPending={false} onNext={({ template, selectedPages }) => run(template, selectedPages, identity)} />
        </section>
      )}
      {step === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
          <Button variant="outline" onClick={() => navigate(PUBLIC_ROUTE_ROOT)}>Cancelar</Button>
          <Button disabled={!scenario || !canCreate} onClick={() => setStep(1)}>Siguiente</Button>
        </div>
      )}
    </div>
  )
}
