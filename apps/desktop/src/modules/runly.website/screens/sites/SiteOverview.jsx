import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, StatusPill } from '@runly/ui'
import { AlertTriangle, Eye, FileText, Globe, History, LayoutTemplate, Mail, Pencil, Rocket, ShoppingBag } from 'lucide-react'
import { useDomains } from '../../hooks/useWebsite.js'
import { sitePath, editorPath } from '../../lib/pageRoute.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { SetupChecklist } from '../../components/SetupChecklist.jsx'
import { SiteAddress } from '../../components/SiteAddress.jsx'
import { SiteMetric } from '../../components/SiteMetric.jsx'

function formatDate(value) {
  if (!value) return ''
  try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) } catch { return '' }
}

const dismissKey = (siteId) => `runly-website-dismissed:${siteId}`
function readDismissed(siteId) {
  try { return new Set(JSON.parse(localStorage.getItem(dismissKey(siteId)) ?? '[]')) } catch { return new Set() }
}
function writeDismissed(siteId, set) {
  try { localStorage.setItem(dismissKey(siteId), JSON.stringify([...set])) } catch { /* storage blocked: stays in memory only */ }
}

export default function SiteOverview({ site, siteId, state, release, caps, pages, onPublish, onPreview }) {
  const navigate = useNavigate()
  const domains = useDomains(siteId)
  const [dismissed, setDismissed] = useState(() => readDismissed(siteId))
  const pageList = pages.data ?? []
  const firstPage = pageList[0]
  const readyDomain = (domains.data ?? []).find((domain) => domain.ready)
  const hasDomain = (domains.data ?? []).length > 0

  const items = [
    { id: 'pages', label: 'Crear tus páginas', icon: FileText, hint: 'Empieza con una plantilla o una página en blanco.', done: pageList.length > 0, action: () => navigate(sitePath(siteId, 'pages')), cta: 'Ir a Páginas' },
    { id: 'content', label: 'Agregar contenido en el editor', icon: Pencil, hint: 'Escribe tus textos y agrega imágenes y secciones.', done: Number(site.draftRevision ?? 0) > 0, action: () => firstPage && navigate(editorPath(siteId, firstPage.id)), cta: 'Abrir el editor', disabled: !firstPage },
    { id: 'catalog', label: 'Conectar tu Catálogo', icon: ShoppingBag, hint: 'Muestra tus productos en el sitio.', optional: true, done: false, action: () => navigate('/app/m/runly.catalog'), cta: 'Abrir Catálogo' },
    { id: 'form', label: 'Agregar un formulario de contacto', icon: Mail, hint: 'Recibe mensajes de tus visitantes.', optional: true, done: false, action: () => navigate(sitePath(siteId, 'forms')), cta: 'Ir a Formularios' },
    { id: 'domain', label: 'Elegir la dirección del sitio', icon: Globe, hint: 'El nombre con el que te encuentran.', optional: true, done: hasDomain, action: () => navigate(sitePath(siteId, 'domains')), cta: 'Ir a Dominios' },
    { id: 'preview', label: 'Ver una vista previa', icon: Eye, hint: 'Revisa cómo se ve antes de publicar.', done: false, action: onPreview, cta: 'Ver vista previa', disabled: !caps.previewSite.allowed },
    { id: 'publish', label: 'Publicar', icon: Rocket, hint: 'Haz visible tu sitio para todos.', done: Boolean(site.activeReleaseId), action: onPublish, cta: 'Publicar', disabled: !caps.publish.allowed },
  ].filter((item) => !dismissed.has(item.id))
  const doneCount = items.filter((item) => item.done).length

  function dismiss(id) {
    const next = new Set(dismissed); next.add(id); setDismissed(next); writeDismissed(siteId, next)
  }

  const tone = site.activeReleaseId ? (state.hasPending === true ? 'warning' : 'success') : 'neutral'
  const address = readyDomain ?? (domains.data ?? [])[0]

  return (
    <div className="space-y-5 p-4 md:p-6">
      <section className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--ring))]/12 via-[hsl(var(--card))] to-[hsl(var(--card))] p-5 md:p-7">
        <LayoutTemplate className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-[hsl(var(--ring))]/10" aria-hidden />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={tone}>{state.label}</StatusPill>
            {release && <span className="text-xs text-[hsl(var(--muted-foreground))]">Versión actual: {formatDate(release.createdAt)}</span>}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{site.name}</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{site.activeReleaseId ? 'Tu sitio está en línea.' : 'Tu borrador es privado hasta que lo publiques.'}</p>
          </div>
          {address ? <SiteAddress hostname={address.hostname} ready={address.ready} /> : <p className="text-sm text-[hsl(var(--muted-foreground))]">Todavía no tiene una dirección pública.</p>}
          <div className="flex flex-wrap gap-2">
            <CapabilityButton capability={caps.publish} onClick={onPublish}><Rocket className="mr-1.5 h-4 w-4" aria-hidden />Publicar</CapabilityButton>
            <CapabilityButton capability={caps.previewSite} variant="outline" onClick={onPreview}><Eye className="mr-1.5 h-4 w-4" aria-hidden />Vista previa</CapabilityButton>
          </div>
        </div>
      </section>
      {state.hasPending === true && (
        <Alert variant="warning" role="status">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <div>
            <AlertTitle>Hay cambios guardados sin publicar</AlertTitle>
            <AlertDescription>Tus visitantes siguen viendo la versión publicada. Se calcula comparando revisiones, por lo que es aproximado.</AlertDescription>
          </div>
        </Alert>
      )}
      <section aria-label="Contenido" className="grid gap-3 sm:grid-cols-3">
        <SiteMetric icon={FileText} tone="blue" label="Páginas" value={pageList.length} loading={pages.isPending} onClick={() => navigate(sitePath(siteId, 'pages'))} />
        <SiteMetric icon={History} tone="violet" label="Publicaciones" value={site.publicationRevision ?? 0} onClick={() => navigate(sitePath(siteId, 'publishing'))} />
        <SiteMetric icon={Globe} tone="emerald" label="Direcciones" value={(domains.data ?? []).length} loading={domains.isPending} onClick={() => navigate(sitePath(siteId, 'domains'))} />
      </section>
      <SetupChecklist items={items} onDismiss={dismiss} />
    </div>
  )
}
