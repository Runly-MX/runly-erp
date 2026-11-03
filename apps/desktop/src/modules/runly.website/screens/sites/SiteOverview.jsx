import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, Button, PageHeader, StatCard } from '@runly/ui'
import { AlertTriangle, CheckCircle2, Circle, FileText, Globe, History } from 'lucide-react'
import { useDomains } from '../../hooks/useWebsite.js'
import { sitePath, editorPath } from '../../lib/pageRoute.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'

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
    { id: 'pages', label: 'Crear tus páginas', done: pageList.length > 0, action: () => navigate(sitePath(siteId, 'pages')), cta: 'Ir a Páginas' },
    { id: 'content', label: 'Agregar contenido en el editor', done: Number(site.draftRevision ?? 0) > 0, action: () => firstPage && navigate(editorPath(siteId, firstPage.id)), cta: 'Abrir el editor', disabled: !firstPage },
    { id: 'catalog', label: 'Conectar tu Catálogo', optional: true, done: false, action: () => navigate('/app/m/runly.catalog'), cta: 'Abrir Catálogo' },
    { id: 'form', label: 'Agregar un formulario de contacto', optional: true, done: false, action: () => navigate(sitePath(siteId, 'forms')), cta: 'Ir a Formularios' },
    { id: 'domain', label: 'Elegir la dirección del sitio', optional: true, done: hasDomain, action: () => navigate(sitePath(siteId, 'domains')), cta: 'Ir a Dominios' },
    { id: 'preview', label: 'Ver una vista previa', done: false, action: onPreview, cta: 'Ver vista previa', disabled: !caps.previewSite.allowed },
    { id: 'publish', label: 'Publicar', done: Boolean(site.activeReleaseId), action: onPublish, cta: 'Publicar', disabled: !caps.publish.allowed },
  ].filter((item) => !dismissed.has(item.id))
  const doneCount = items.filter((item) => item.done).length

  function dismiss(id) {
    const next = new Set(dismissed); next.add(id); setDismissed(next); writeDismissed(siteId, next)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader eyebrow="Sitio web" title={site.name} description="Resumen del sitio y primeros pasos." />
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="state-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
          <h2 id="state-title" className="text-base font-semibold">Estado</h2>
          <p className="text-sm">{state.label}</p>
          {release && <p className="text-sm text-[hsl(var(--muted-foreground))]">Versión actual: {formatDate(release.createdAt)}</p>}
          {state.hasPending === true && (
            <Alert variant="warning" role="status">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <div>
                <AlertTitle>Hay cambios guardados sin publicar</AlertTitle>
                <AlertDescription>Tus visitantes siguen viendo la versión publicada. Se calcula comparando revisiones, por lo que es aproximado.</AlertDescription>
              </div>
            </Alert>
          )}
          {!site.activeReleaseId && <p className="text-sm text-[hsl(var(--muted-foreground))]">Este sitio todavía no tiene una versión publicada. Tu borrador es privado.</p>}
          <p className="text-sm">
            {readyDomain ? <>Dirección activa: <a className="underline" href={`https://${readyDomain.hostname}`} target="_blank" rel="noreferrer">{readyDomain.hostname}</a></> : 'Todavía no tiene una dirección pública activa.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <CapabilityButton capability={caps.publish} onClick={onPublish}>Publicar</CapabilityButton>
            <CapabilityButton capability={caps.previewSite} variant="outline" onClick={onPreview}>Vista previa</CapabilityButton>
          </div>
        </section>
        <section aria-labelledby="steps-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
          <h2 id="steps-title" className="text-base font-semibold">Primeros pasos <span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">({doneCount} de {items.length})</span></h2>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Hecho" /> : <Circle className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-label="Pendiente" />}
                <span className={item.done ? 'text-[hsl(var(--muted-foreground))] line-through' : ''}>{item.label}{item.optional ? ' (opcional)' : ''}</span>
                {!item.done && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={item.action} disabled={item.disabled}>{item.cta}</Button>
                    {item.optional && <Button size="sm" variant="ghost" onClick={() => dismiss(item.id)}>No lo necesito</Button>}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section aria-label="Contenido" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <button type="button" className="text-left" onClick={() => navigate(sitePath(siteId, 'pages'))}><StatCard label="Páginas" value={pages.isPending ? '—' : pageList.length} icon={FileText} loading={pages.isPending} /></button>
        <button type="button" className="text-left" onClick={() => navigate(sitePath(siteId, 'publishing'))}><StatCard label="Publicaciones" value={site.publicationRevision ?? 0} icon={History} /></button>
        <button type="button" className="text-left" onClick={() => navigate(sitePath(siteId, 'domains'))}><StatCard label="Direcciones" value={domains.isPending ? '—' : (domains.data ?? []).length} icon={Globe} loading={domains.isPending} /></button>
      </section>
    </div>
  )
}
