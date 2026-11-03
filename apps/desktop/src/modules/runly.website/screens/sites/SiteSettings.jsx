import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, PageHeader, SelectField, TextField } from '@runly/ui'
import { Archive, Info } from 'lucide-react'
import { toast } from 'sonner'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeError } from '../../lib/websiteErrors.js'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../../lib/pageRoute.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'

const TYPES = [
  { value: 'website', label: 'Sitio informativo' },
  { value: 'ecommerce', label: 'Sitio con Catálogo' },
  { value: 'blog', label: 'Blog' },
  { value: 'landing', label: 'Landing page' },
]

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
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader title="Configuración" description="Identidad del sitio, permisos y opciones avanzadas." />
      <section aria-labelledby="identity-title" className="space-y-4 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="identity-title" className="text-base font-semibold">Identidad</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Nombre del sitio" value={name} onChange={(e) => setName(e.target.value)} required />
          <SelectField label="Tipo de sitio" value={siteType} onChange={setSiteType} options={TYPES} />
        </div>
        {siteType !== baseType && <p className="text-xs text-amber-700 dark:text-amber-300">Cambiar el tipo cambia los bloques disponibles en el editor. No modifica el contenido ya guardado.</p>}
        {stale && (
          <Alert variant="warning" role="alert">
            <Info className="h-4 w-4" aria-hidden="true" />
            <div><AlertTitle>Este sitio cambió</AlertTitle><AlertDescription>Alguien guardó cambios antes que tú. Cargamos la versión actual; revisa tus datos y vuelve a guardar.</AlertDescription></div>
          </Alert>
        )}
        {error && <ErrorNotice error={error} />}
        <div className="flex justify-end"><CapabilityButton capability={caps.siteEdit} onClick={save} disabled={busy || !dirty || !name.trim()}>{busy ? 'Guardando…' : 'Guardar identidad'}</CapabilityButton></div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Los cambios de identidad se guardan en el borrador y llegan al sitio público cuando publiques.</p>
      </section>

      <section aria-labelledby="who-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="who-title" className="text-base font-semibold">Quién puede qué</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Los permisos son de la empresa y valen para todos sus sitios: no se pueden dar a una persona solo para un sitio. Aquí ves lo que tu rol permite.</p>
        <ul className="divide-y divide-[hsl(var(--border))] text-sm">
          {matrix.map(([label, allowed]) => (
            <li key={label} className="flex items-center justify-between py-2">
              <span>{label}</span>
              <span className={allowed ? 'font-medium' : 'text-[hsl(var(--muted-foreground))]'}>{allowed ? 'Tu rol lo permite' : 'Tu rol no lo permite'}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-[hsl(var(--muted-foreground))]" data-source="server">Permisos efectivos de este sitio, confirmados por el servidor.</p>
      </section>

      <section aria-labelledby="adv-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h2 id="adv-title" className="text-base font-semibold">Avanzado</h2>
        <details className="rounded-lg border border-[hsl(var(--border))] p-3">
          <summary className="cursor-pointer text-sm font-medium">Correo, antispam, analítica y pagos</summary>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">El correo (SMTP) es de la empresa y lo comparten sus sitios. La analítica, el antispam y los pagos se guardan en este sitio.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(sitePath(siteId, 'advanced'))}>Correo, antispam y analítica</Button>
            <Button variant="outline" onClick={() => navigate(sitePath(siteId, 'payments'))}>Pagos</Button>
          </div>
        </details>
        <details className="rounded-lg border border-[hsl(var(--border))] p-3">
          <summary className="cursor-pointer text-sm font-medium">Archivar este sitio</summary>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">El sitio deja de publicarse y sus direcciones dejan de responder. Pasa a Archivados en Sitios web, donde puedes restaurarlo (vuelve como borrador) o eliminarlo. Sus páginas, formularios y respuestas se conservan.</p>
          <CapabilityButton capability={caps.archive} className="mt-3" variant="destructive" onClick={() => setArchiveOpen(true)}><Archive className="h-4 w-4" /> Archivar sitio</CapabilityButton>
        </details>
      </section>

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
