import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, ConfirmDialog, FileUploader, ProgressBar, SelectField, StatusPill } from '@runly/ui'
import { Check, CheckCircle2, Clock, Eye, FileArchive, FileCode2, Fingerprint, FolderTree, Info, ListChecks, Loader2, PackageCheck, Rocket, ShieldOff, UploadCloud, XCircle } from 'lucide-react'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeCode, describeError } from '../../lib/websiteErrors.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'
import { SiteSectionHeader } from '../../components/SiteSectionHeader.jsx'
import { SiteIconChip, SitePanel } from '../../components/SitePanel.jsx'

const ROUTING = [
  { value: 'mpa', label: 'Varias páginas (cada ruta es un archivo HTML)' },
  { value: 'spa', label: 'Una sola aplicación (todas las rutas abren index.html)' },
]

const POLL_MS = 1500
const POLL_MAX = 80

const GUIDE = [
  { icon: FolderTree, text: <>Debe tener un <code>index.html</code> en la raíz, o dentro de una única carpeta.</> },
  { icon: FileArchive, text: 'Incluye todos los archivos que usa el sitio (imágenes, estilos, scripts). No se descargan recursos externos.' },
  { icon: Fingerprint, text: 'Usa nombres con huella (hash) en los archivos que cambian: si un archivo cambia pero conserva su nombre, la publicación se rechaza.' },
  { icon: ShieldOff, text: <>No incluyas archivos privados (<code>.env</code>, llaves, copias de seguridad), código fuente ni carpetas de servidor.</> },
  { icon: FileCode2, text: 'La compatibilidad con cada herramienta de desarrollo no está certificada; solo se aceptan sitios estáticos.' },
]

// Visual-only stepper derived from `phase`: 0 upload, 1 prepare, 2 activate, 3 all done.
const STEPS = ['Subir y validar', 'Preparar versión', 'Activar']
function stepIndex(phase) {
  if (phase === 'done') return 3
  if (phase === 'prepared' || phase === 'activating') return 2
  if (phase === 'imported' || phase === 'preparing') return 1
  return 0
}

function Stepper({ phase }) {
  const current = stepIndex(phase)
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Pasos de la importación">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center text-xs transition-colors duration-200 sm:flex-row sm:text-left ${active ? 'border-[hsl(var(--ring))]/50 bg-[hsl(var(--ring))]/5 font-semibold' : done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[hsl(var(--ring))] text-white' : 'bg-[hsl(var(--muted))]'}`}>
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span>{label}{done && <span className="sr-only"> (completado)</span>}</span>
          </li>
        )
      })}
    </ol>
  )
}

const NEXT_STATE = {
  imported: { label: 'Importado', tone: 'neutral', icon: PackageCheck },
  preparing: { label: 'Preparando…', tone: 'neutral', icon: Loader2 },
  prepared: { label: 'Preparado para publicar', tone: 'warning', icon: Clock },
  activating: { label: 'Publicando…', tone: 'warning', icon: Loader2 },
  done: { label: 'Publicado', tone: 'success', icon: CheckCircle2 },
}

// ZIP import (S4). The server validates privately and never executes anything;
// this screen only drives: select -> validate -> (rejected | ready) -> prepare
// -> preview -> activate. Limits are the server's (policy static-v1), not ours.
export default function SiteImport({ site, siteId, caps }) {
  const queryClient = useQueryClient()
  const { api, companyId } = useWebsiteScope()
  const [file, setFile] = useState(null)
  const [routingMode, setRoutingMode] = useState('mpa')
  const [phase, setPhase] = useState('idle') // idle | uploading | validating | rejected | imported | preparing | prepared | activating | done
  const [imported, setImported] = useState(null)
  const [release, setRelease] = useState(null)
  const [error, setError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const keys = useRef({})

  const isolation = error?.code === 'isolation_required'

  async function upload() {
    setError(null); setPhase('uploading')
    try {
      keys.current.import = newIdempotencyKey()
      let current = (await api.createImport(siteId, file, { routingMode }, keys.current.import)).data
      setPhase('validating')
      for (let i = 0; i < POLL_MAX && !['ready', 'rejected', 'failed', 'expired'].includes(current.phase); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        current = (await api.getImport(siteId, current.id)).data
      }
      setImported(current)
      setPhase(current.phase === 'ready' ? 'imported' : 'rejected')
    } catch (e) { setError(e); setPhase('idle') }
  }

  async function prepare() {
    setError(null); setPhase('preparing')
    try {
      const fresh = (await api.getSite(siteId)).data
      keys.current.prepare ??= newIdempotencyKey()
      let current = (await api.prepareRelease(siteId, {
        kind: 'dist',
        importId: imported.id,
        baseReleaseId: fresh.activeReleaseId ?? null,
        expectedDraftRevision: String(fresh.draftRevision),
        expectedPublicationRevision: String(fresh.publicationRevision),
      }, keys.current.prepare)).data
      for (let i = 0; i < POLL_MAX && current.state === 'preparing'; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        current = (await api.getRelease(siteId, current.id)).data
      }
      keys.current.prepare = null
      if (current.state !== 'ready') { setRelease(current); setError({ code: current.failureCode ?? 'preparation_failed', status: 422 }); setPhase('imported'); return }
      setRelease(current); setPhase('prepared')
    } catch (e) { keys.current.prepare = null; setError(e); setPhase('imported') }
  }

  async function activate() {
    setError(null); setPhase('activating')
    try {
      keys.current.activate ??= newIdempotencyKey()
      await api.activateRelease(siteId, {
        releaseId: release.id,
        manifestHash: release.manifestHash,
        expectedDraftRevision: String(release.draftRevision),
        expectedPublicationRevision: String(release.publicationRevision),
      }, keys.current.activate)
      keys.current.activate = null
      await queryClient.invalidateQueries({ queryKey: websiteKeys.all(companyId) })
      setActivateOpen(false); setPhase('done')
    } catch (e) { keys.current.activate = null; setError(e); setActivateOpen(false); setPhase('prepared') }
  }

  const busy = ['uploading', 'validating', 'preparing', 'activating'].includes(phase)
  const reasons = imported?.errorCodes ?? (imported?.errorCode ? [imported.errorCode] : [])
  const nextState = NEXT_STATE[phase]

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader icon={UploadCloud} tone="blue" title="Importar un sitio (ZIP)" description="Sube un sitio estático ya compilado. No se instala ni se ejecuta código del servidor." />
      <Stepper phase={phase} />

      {isolation && (
        <Alert role="status">
          <Info className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>No disponible en esta instalación</AlertTitle><AlertDescription>{describeCode('isolation_required').message}</AlertDescription></div>
        </Alert>
      )}
      {error && !isolation && <ErrorNotice error={error} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {['idle', 'uploading', 'validating', 'rejected'].includes(phase) && (
          <SitePanel id="up-title" icon={FileArchive} tone="blue" title="Archivo" description="Elige el ZIP y cómo se navega el sitio.">
            <div className="space-y-4">
              <FileUploader value={file} accept=".zip" maxSizeMB={1024} emptyLabel="Elegir archivo ZIP" hint="Arrastra un archivo .zip o elígelo manualmente. El servidor valida el tamaño máximo." disabled={busy} onChange={(selected) => { setFile(selected ?? null); setPhase('idle'); setImported(null); setError(null) }} />
              {file && (
                <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--muted))]/50 p-3 text-sm">
                  <SiteIconChip icon={FileArchive} tone="blue" size="sm" />
                  <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                </div>
              )}
              <SelectField label="Cómo se navega el sitio" value={routingMode} onChange={setRoutingMode} options={ROUTING} />
              {(phase === 'uploading' || phase === 'validating') && (
                <div role="status" aria-live="polite" className="space-y-2">
                  <ProgressBar value={null} />
                  <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{phase === 'uploading' ? 'Subiendo el archivo…' : 'Validando los archivos…'}</p>
                </div>
              )}
              {phase === 'rejected' && (
                <Alert variant="destructive" role="alert">
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  <div>
                    <AlertTitle>Archivo rechazado</AlertTitle>
                    <AlertDescription>
                      {reasons.length ? <ul className="list-disc pl-5">{reasons.map((code) => <li key={code}>{describeCode(code)?.message ?? code}</li>)}</ul> : 'El archivo no cumple los requisitos. No se guardó nada en el sitio.'}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
              <div className="flex justify-end border-t border-[hsl(var(--border))] pt-4">
                <CapabilityButton capability={caps.importZip} onClick={upload} disabled={!file || busy}><UploadCloud className="h-4 w-4" aria-hidden /> Subir y validar</CapabilityButton>
              </div>
            </div>
          </SitePanel>
        )}

        {nextState && (
          <SitePanel
            id="next-title"
            icon={phase === 'done' ? CheckCircle2 : PackageCheck}
            tone="emerald"
            title={<>Tu ZIP es válido <StatusPill tone={nextState.tone} size="sm" icon={nextState.icon}>{nextState.label}</StatusPill></>}
            description="Aún no es público. Primero se prepara una versión, la puedes ver en una vista previa privada y después la activas."
          >
            {(phase === 'preparing' || phase === 'activating') && <div role="status" aria-live="polite" className="mb-3"><ProgressBar value={null} /></div>}
            <div className="flex flex-wrap gap-2">
              {phase === 'imported' && <CapabilityButton capability={caps.publish} onClick={prepare}><PackageCheck className="h-4 w-4" aria-hidden /> Preparar versión</CapabilityButton>}
              {phase === 'prepared' && (
                <>
                  <CapabilityButton capability={caps.previewSite} variant="outline" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4" aria-hidden /> Ver vista previa</CapabilityButton>
                  <CapabilityButton capability={caps.publish} onClick={() => setActivateOpen(true)}><Rocket className="h-4 w-4" aria-hidden /> Activar versión</CapabilityButton>
                </>
              )}
              {phase === 'done' && <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />La versión está activa. Revisa Publicaciones para ver el historial.</p>}
            </div>
          </SitePanel>
        )}

        <SitePanel id="guide-title" icon={ListChecks} tone="amber" title="Cómo preparar tu ZIP" className="lg:self-start">
          <ul className="space-y-3">
            {GUIDE.map(({ icon, text }, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <SiteIconChip icon={icon} size="sm" />
                <span className="pt-1 text-[hsl(var(--muted-foreground))] [&_code]:rounded [&_code]:bg-[hsl(var(--muted))] [&_code]:px-1 [&_code]:text-[hsl(var(--foreground))]">{text}</span>
              </li>
            ))}
          </ul>
        </SitePanel>
      </div>

      <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} siteId={siteId} releaseId={release?.id ?? null} title="Vista previa del ZIP" />
      <ConfirmDialog
        open={activateOpen}
        onOpenChange={(open) => { if (!open && phase !== 'activating') setActivateOpen(false) }}
        tone="warning"
        title="Activar el sitio importado"
        description={`Tu sitio público “${site.name}” cambiará a este ZIP. Puedes volver a la versión anterior desde Publicaciones.`}
        confirmLabel="Activar versión"
        loading={phase === 'activating'}
        onConfirm={activate}
      />
    </div>
  )
}
