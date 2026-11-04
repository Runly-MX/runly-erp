import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, ConfirmDialog, SelectField, TextField } from '@runly/ui'
import { AlertTriangle, Archive, BadgeCheck, Check, ChevronRight, CreditCard, IdCard, Info, Mail, Minus, Settings, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { SiteIconChip, SitePanel } from '../../components/SitePanel.jsx'

const TYPES = [
  { value: 'website', label: 'Sitio informativo' },
  { value: 'ecommerce', label: 'Sitio con Catálogo' },
  { value: 'blog', label: 'Blog' },
  { value: 'landing', label: 'Landing page' },
]

// Navigation row to a sub-screen: tinted chip, label, hint and chevron; 44px+ tall.
function LinkRow({ icon, tone, label, hint, onClick }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border border-[hsl(var(--border))] p-3 text-left transition-colors duration-200 hover:border-[hsl(var(--ring))]/40 hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
      <SiteIconChip icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}

export default function SiteSettings({ site, siteId, caps }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const baseName = site.draftIdentity?.name ?? site.name ?? ''
  const baseType = site.draftIdentity?.siteType ?? site.siteType ?? 'website'
  const [name, setName] = useState(baseName)
  const [siteType, setSiteType] = useState(baseType)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [stale, setStale] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveText, setArchiveText] = useState('')
  const [archiving, setArchiving] = useState(false)

  useEffect(() => {
    setName(baseName)
    setSiteType(baseType)
  }, [site.id, site.draftRevision, baseName, baseType])

  const dirty = name.trim() !== baseName || siteType !== baseType

  const matrix = [
    ['Ver el sitio', caps.siteRead.allowed],
    ['Editar páginas', caps.pagesUpdate.allowed],
    ['Publicar, volver a una versión y retirar', caps.publish.allowed],
    ['Cambiar la configuración del sitio', caps.siteEdit.allowed],
    ['Elegir la dirección', caps.reserveHostname.allowed],
    ['Ver formularios y respuestas', caps.formsRead.allowed],
  ]
  const allowedCount = matrix.filter(([, allowed]) => allowed).length

  async function save() {
    setBusy(true); setError(null); setStale(false)
    try {
      await api.saveIdentity(siteId, { name: name.trim(), siteType }, site.draftRevision, newIdempotencyKey())
      toast.success('Identidad guardada en el borrador. Se aplica al publicar.')
      await queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
    } catch (e) {
      if (e?.code === 'revision_conflict') { setStale(true); queryClient.invalidateQueries({ queryKey: websiteKeys.site(companyId, siteId) }) }
      else setError(e)
    } finally { setBusy(false) }
  }

  async function archive() {
    setArchiving(true)
    try {
      await api.archiveSite(siteId)
      await queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      toast.success('Sitio archivado. Sus datos se conservan.')
      navigate(PUBLIC_ROUTE_ROOT)
    } catch (e) { toast.error(describeError(e).message) } finally { setArchiving(false); setArchiveOpen(false) }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader icon={Settings} tone="amber" title="Configuración" description="Identidad del sitio, permisos y opciones avanzadas." />

      <SitePanel id="identity-title" icon={IdCard} tone="blue" title="Identidad" description="Los cambios se guardan en el borrador y llegan al sitio público cuando publiques.">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre del sitio" value={name} onChange={(e) => setName(e.target.value)} required />
          <SelectField label="Tipo de sitio" value={siteType} onChange={setSiteType} options={TYPES} />
        </div>
        {siteType !== baseType && (
          <p className="mt-3 flex gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />Cambiar el tipo cambia los bloques disponibles en el editor. No modifica el contenido ya guardado.
          </p>
        )}
        {stale && (
          <Alert variant="warning" role="alert" className="mt-3">
            <Info className="h-4 w-4" aria-hidden="true" />
            <div><AlertTitle>Este sitio cambió</AlertTitle><AlertDescription>Alguien guardó cambios antes que tú. Cargamos la versión actual; revisa tus datos y vuelve a guardar.</AlertDescription></div>
          </Alert>
        )}
        {error && <div className="mt-3"><ErrorNotice error={error} /></div>}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
          {dirty && <span className="text-xs text-[hsl(var(--muted-foreground))]">Tienes cambios sin guardar</span>}
          <CapabilityButton capability={caps.siteEdit} onClick={save} disabled={busy || !dirty || !name.trim()}>{busy ? 'Guardando…' : 'Guardar identidad'}</CapabilityButton>
        </div>
      </SitePanel>

      <SitePanel
        id="who-title"
        icon={ShieldCheck}
        tone="violet"
        title="Quién puede qué"
        description="Los permisos son de la empresa y valen para todos sus sitios: no se pueden dar a una persona solo para un sitio. Aquí ves lo que tu rol permite."
        action={<span className="text-sm font-semibold tabular-nums">{allowedCount} de {matrix.length}</span>}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {matrix.map(([label, allowed]) => (
            <li key={label} className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${allowed ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[hsl(var(--border))]'}`}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${allowed ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                {allowed ? <Check className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{label}</span>
                <span className={`block text-xs ${allowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-[hsl(var(--muted-foreground))]'}`}>{allowed ? 'Tu rol lo permite' : 'Tu rol no lo permite'}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]" data-source="server"><BadgeCheck className="h-3.5 w-3.5" aria-hidden />Permisos efectivos de este sitio, confirmados por el servidor.</p>
      </SitePanel>

      <SitePanel id="adv-title" icon={SlidersHorizontal} tone="neutral" title="Avanzado" description="El correo (SMTP) es de la empresa y lo comparten sus sitios. La analítica, el antispam y los pagos se guardan en este sitio.">
        <div className="grid gap-2 sm:grid-cols-2">
          <LinkRow icon={Mail} tone="blue" label="Correo, antispam y analítica" hint="Envío de formularios, protección y métricas" onClick={() => navigate(sitePath(siteId, 'advanced'))} />
          <LinkRow icon={CreditCard} tone="emerald" label="Pagos" hint="Cobros en línea de este sitio" onClick={() => navigate(sitePath(siteId, 'payments'))} />
        </div>
      </SitePanel>

      <SitePanel id="archive-title" danger icon={Archive} tone="rose" title="Archivar este sitio" description="El sitio deja de publicarse y sus direcciones dejan de responder. Pasa a Archivados en Sitios web, donde puedes restaurarlo (vuelve como borrador) o eliminarlo. Sus páginas, formularios y respuestas se conservan.">
        <CapabilityButton capability={caps.archive} variant="destructive" onClick={() => setArchiveOpen(true)}><Archive className="h-4 w-4" aria-hidden /> Archivar sitio</CapabilityButton>
      </SitePanel>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={(open) => { if (!open && !archiving) { setArchiveOpen(false); setArchiveText('') } }}
        title="Archivar sitio"
        description={`“${site.name}” dejará de publicarse y pasará a Archivados. Sus páginas, formularios y respuestas se conservan.`}
        confirmLabel="Archivar sitio"
        loading={archiving}
        confirmDisabled={archiveText !== site.name}
        onConfirm={archive}
      >
        <div className="mt-3"><TextField label={`Escribe el nombre del sitio para confirmar: ${site.name}`} value={archiveText} onChange={(e) => setArchiveText(e.target.value)} /></div>
      </ConfirmDialog>
    </div>
  )
}
