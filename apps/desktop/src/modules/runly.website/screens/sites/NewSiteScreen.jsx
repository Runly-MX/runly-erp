import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { defaultTheme, defineTheme } from '@raulbellosom/atlas-web-builder'
import { Alert, AlertDescription, AlertTitle, Button, ProgressBar, StatusPill, TextField } from '@runly/ui'
import { AlertTriangle, Archive, ArrowLeft, Check, CheckCircle2, Circle, FileText, Loader2, LayoutTemplate, PanelsTopLeft, Palette, ShoppingBag, Sparkles } from 'lucide-react'
import { companyFetch } from '../../../../lib/companyFetch.js'
import { getApiUrl } from '../../../../lib/runtimeConfig.js'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useWebsiteCapabilities, useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { WizardStepIdentity } from '../wizard/WizardStepIdentity.jsx'
import { WizardStepTemplate } from '../wizard/WizardStepTemplate.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { typographyFromFonts } from '../../lib/siteFonts.js'

const STEPS = [
  { label: 'Cómo construirlo', icon: LayoutTemplate, title: '¿Cómo quieres construirlo?', hint: 'Elige el tipo de sitio. Siempre puedes cambiarlo después.' },
  { label: 'Nombre e identidad', icon: Palette, title: 'Nombre e identidad', hint: 'Dale nombre, color y letra a tu marca. Verás el resultado al instante.' },
  { label: 'Punto de partida', icon: Sparkles, title: 'Punto de partida', hint: 'Elige una plantilla o empieza en blanco. Todo se puede cambiar después.' },
]

const SCENARIOS = [
  { id: 'website', icon: FileText, art: 'from-orange-500 to-amber-400', title: 'Sitio informativo', description: 'Páginas, contacto y blog, sin tienda. Es lo más simple para empezar.', recommended: true },
  { id: 'ecommerce', icon: ShoppingBag, art: 'from-sky-500 to-cyan-400', title: 'Sitio con Catálogo', description: 'Muestra los productos publicados de tu Catálogo. No los duplica.' },
  { id: 'zip', icon: Archive, art: 'from-slate-600 to-slate-400', title: 'Importar un sitio (ZIP)', description: 'Sube un sitio estático ya compilado. No se instala ni se ejecuta código del servidor.' },
]

const STATUS_ICON = { pending: Circle, running: Loader2, done: CheckCircle2, error: AlertTriangle, skipped: Circle }

function StepIndicator({ index }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Pasos para crear el sitio">
      {STEPS.map((item, i) => {
        const done = i < index
        const active = i === index
        return (
          <li key={item.label} aria-current={active ? 'step' : undefined} className={`flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors ${active ? 'border-orange-500/50 bg-orange-500/5' : 'border-[hsl(var(--border))]'}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${done ? 'bg-emerald-500 text-white' : active ? 'bg-orange-500 text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
              {done ? <Check className="h-4 w-4" aria-hidden /> : <item.icon className="h-4 w-4" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Paso {i + 1}</span>
              <span className={`block truncate text-xs sm:text-sm ${active ? 'font-semibold' : 'text-[hsl(var(--muted-foreground))]'}`}>{item.label}</span>
            </span>
          </li>
        )
      })}
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
  const ctx = useRef({ keys: {}, siteId: null, revision: 0, logoFileId: null })
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
          const settings = {logoFileId:ctx.current.logoFileId}
          const saved = (await api.saveIdentity(ctx.current.siteId, { settings }, ctx.current.revision, key('identity'))).data
          ctx.current.revision = saved?.draftRevision ?? ctx.current.revision
        }
        if (id === 'theme') {
          // The template ships its own palette and type; the wizard colors only win when the person changed them.
          const brand = template?.themeTokens ?? {}
          const picked = { ...(currentIdentity.primaryColor !== '#4F46E5' && { primary: currentIdentity.primaryColor }), ...(currentIdentity.bgColor !== '#FFFFFF' && { bg: currentIdentity.bgColor }) }
          const tokens = Object.fromEntries(Object.entries(defaultTheme.tokens).map(([group, value]) => [group, brand[group] && typeof value === 'object' ? { ...value, ...brand[group] } : value]))
          tokens.color = { ...tokens.color, ...picked }
          const built = defineTheme({ ...defaultTheme, id: 'site-theme', name: 'Tema del sitio', tokens })
          await api.createTheme({ siteId: ctx.current.siteId, name: 'Tema del sitio', tokens: built.tokens, typography: typographyFromFonts({ headingFont: currentIdentity.headingFont ?? currentIdentity.font ?? 'Inter', bodyFont: currentIdentity.bodyFont ?? currentIdentity.font ?? 'Inter' }) })
        }
        if (id === 'pages') {
          // The server conforms the template to the publishable block catalog and creates every page atomically.
          // The theme step already advanced the draft revision, so read the current one.
          ctx.current.revision = (await api.getSite(ctx.current.siteId)).data?.draftRevision ?? ctx.current.revision
          const applied = (await api.applyTemplate(ctx.current.siteId, template.id, { pageIds: selectedPages, includeTheme: false, expectedRevision: ctx.current.revision }, key('template'))).data
          ctx.current.revision = applied?.draftRevision ?? ctx.current.revision
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
    const doneCount = steps.filter((item) => item.status === 'done').length
    const percent = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
        <SiteSectionHeader icon={Sparkles} tone="violet" title="Creando tu sitio" description="Cada paso se puede reintentar sin duplicar nada." />
        <div className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="flex items-center gap-3">
            <ProgressBar value={percent} />
            <span className="text-sm font-semibold tabular-nums">{percent}%</span>
          </div>
          <ol className="space-y-2" aria-live="polite">
            {steps.map((item) => {
              const Icon = STATUS_ICON[item.status] ?? Circle
              const tone = item.status === 'done' ? 'bg-emerald-500/12 text-emerald-600' : item.status === 'error' ? 'bg-rose-500/12 text-rose-600' : item.status === 'running' ? 'bg-orange-500/12 text-orange-600' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
              return (
                <li key={item.id} className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className={`h-4 w-4 ${item.status === 'running' ? 'animate-spin' : ''}`} aria-hidden="true" /></span>
                  <div className="min-w-0 pt-1"><p className={item.status === 'error' ? 'font-medium' : ''}>{item.label}</p>{item.detail && <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</p>}</div>
                </li>
              )
            })}
          </ol>
        </div>
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

  const current = STEPS[step]
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-28 md:p-6">
      <SiteSectionHeader
        icon={PanelsTopLeft}
        tone="violet"
        title="Crear sitio"
        description="Tres pasos. Lo demás (catálogo, formularios, dirección) es opcional y se hace después."
        actions={<Button variant="ghost" size="sm" onClick={() => navigate(PUBLIC_ROUTE_ROOT)}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />Mis sitios</Button>}
      />
      <StepIndicator index={step} />
      {!canCreate && (
        <Alert variant="warning" role="alert">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>No tienes permiso para crear sitios</AlertTitle><AlertDescription>Pide a un administrador el permiso de edición del sitio web.</AlertDescription></div>
        </Alert>
      )}
      <div>
        <h2 className="text-lg font-semibold">{current.title}</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{current.hint}</p>
      </div>
      {step === 0 && (
        <section aria-label={current.title} className="grid gap-3 sm:grid-cols-3" role="radiogroup">
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
                className={`group relative flex flex-col overflow-hidden rounded-2xl border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-orange-500 bg-orange-500/5' : 'border-[hsl(var(--border))] hover:border-orange-500/50'}`}
              >
                <span className={`grid h-24 place-items-center bg-gradient-to-br ${item.art}`} aria-hidden="true">
                  <item.icon className="h-10 w-10 text-white drop-shadow-sm" />
                </span>
                {selected && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-orange-500 text-white"><Check className="h-4 w-4" aria-hidden="true" /></span>}
                <span className="flex flex-1 flex-col gap-1.5 p-4">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">{item.title}{item.recommended && <StatusPill tone="success" size="sm">Recomendado</StatusPill>}</span>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">{item.description}</span>
                  {disabled && <span className="text-xs text-amber-700 dark:text-amber-300">Necesitas permisos de importación y publicación.</span>}
                </span>
              </button>
            )
          })}
        </section>
      )}
      {step === 1 && (
        <section aria-label={current.title} className="space-y-4">
          <div className="grid gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:grid-cols-2">
            <TextField label="Nombre del sitio" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi sitio web" error={nameError || undefined} required />
            <TextField label="¿A qué se dedica? (opcional)" value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Cafetería, despacho contable…" />
          </div>
          <WizardStepIdentity
            defaultValues={identity ?? undefined}
            siteName={name.trim()}
            companyLogoUrl={brandingQuery.data?.logoUrl ?? null}
            onNext={finishIdentity}
            onBack={() => setStep(0)}
          />
        </section>
      )}
      {step === 2 && (
        <section aria-label={current.title} className="space-y-4">
          <WizardStepTemplate onBack={() => setStep(1)} isPending={false} onNext={({ template, selectedPages }) => run(template, selectedPages, identity)} />
        </section>
      )}
      {step === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 md:static md:border-0 md:bg-transparent md:p-0">
          <Button variant="outline" onClick={() => navigate(PUBLIC_ROUTE_ROOT)}>Cancelar</Button>
          <Button disabled={!scenario || !canCreate} onClick={() => setStep(1)}>Siguiente</Button>
        </div>
      )}
    </div>
  )
}
