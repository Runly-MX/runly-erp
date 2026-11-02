import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog, FileUploader, PageHeader, ProgressBar, SelectField, StatusPill } from '@runly/ui'
import { Info, UploadCloud } from 'lucide-react'
import { newIdempotencyKey } from '../../lib/websiteApi.js'
import { describeCode, describeError } from '../../lib/websiteErrors.js'
import { useWebsiteScope, websiteKeys } from '../../hooks/useWebsite.js'
import { CapabilityButton } from '../../components/CapabilityButton.jsx'
import { ErrorNotice } from '../../components/ErrorNotice.jsx'
import { PreviewDialog } from '../../components/PreviewDialog.jsx'

const ROUTING = [
  { value: 'mpa', label: 'Varias páginas (cada ruta es un archivo HTML)' },
  { value: 'spa', label: 'Una sola aplicación (todas las rutas abren index.html)' },
]

const POLL_MS = 1500
const POLL_MAX = 80

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

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Importar un sitio (ZIP)" description="Sube un sitio estático ya compilado. No se instala ni se ejecuta código del servidor." />
      <Alert role="note">
        <Info className="h-4 w-4" aria-hidden="true" />
        <div>
          <AlertTitle>Cómo preparar tu ZIP</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              <li>Debe tener un <code>index.html</code> en la raíz, o dentro de una única carpeta.</li>
              <li>Incluye todos los archivos que usa el sitio (imágenes, estilos, scripts). No se descargan recursos externos.</li>
              <li>Usa nombres con huella (hash) en los archivos que cambian: si un archivo cambia pero conserva su nombre, la publicación se rechaza.</li>
              <li>No incluyas archivos privados (<code>.env</code>, llaves, copias de seguridad), código fuente ni carpetas de servidor.</li>
              <li>La compatibilidad con cada herramienta de desarrollo no está certificada; solo se aceptan sitios estáticos.</li>
            </ul>
          </AlertDescription>
        </div>
      </Alert>

      {isolation && (
        <Alert role="status">
          <Info className="h-4 w-4" aria-hidden="true" />
          <div><AlertTitle>No disponible en esta instalación</AlertTitle><AlertDescription>{describeCode('isolation_required').message}</AlertDescription></div>
        </Alert>
      )}
      {error && !isolation && <ErrorNotice error={error} />}

      {['idle', 'uploading', 'validating', 'rejected'].includes(phase) && (
        <section aria-labelledby="up-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
          <h2 id="up-title" className="text-base font-semibold">Archivo</h2>
          <FileUploader value={file} accept=".zip" maxSizeMB={1024} emptyLabel="Elegir archivo ZIP" hint="Arrastra un archivo .zip o elígelo manualmente. El servidor valida el tamaño máximo." disabled={busy} onChange={(selected) => { setFile(selected ?? null); setPhase('idle'); setImported(null); setError(null) }} />
          {file && <p className="text-sm">Seleccionado: <strong>{file.name}</strong> ({Math.max(1, Math.round(file.size / 1024))} KB)</p>}
          <SelectField label="Cómo se navega el sitio" value={routingMode} onChange={setRoutingMode} options={ROUTING} />
          {(phase === 'uploading' || phase === 'validating') && (
            <div role="status" aria-live="polite" className="space-y-2">
              <ProgressBar value={null} />
              <p className="text-sm">{phase === 'uploading' ? 'Subiendo el archivo…' : 'Validando los archivos…'}</p>
            </div>
          )}
          {phase === 'rejected' && (
            <Alert variant="destructive" role="alert">
              <div>
                <AlertTitle>Archivo rechazado</AlertTitle>
                <AlertDescription>
                  {reasons.length ? <ul className="list-disc pl-5">{reasons.map((code) => <li key={code}>{describeCode(code)?.message ?? code}</li>)}</ul> : 'El archivo no cumple los requisitos. No se guardó nada en el sitio.'}
                </AlertDescription>
              </div>
            </Alert>
          )}
          <CapabilityButton capability={caps.importZip} onClick={upload} disabled={!file || busy}><UploadCloud className="h-4 w-4" /> Subir y validar</CapabilityButton>
        </section>
      )}

      {['imported', 'preparing', 'prepared', 'activating', 'done'].includes(phase) && (
        <section aria-labelledby="next-title" className="space-y-3 rounded-2xl border border-[hsl(var(--border))] p-4">
          <h2 id="next-title" className="flex items-center gap-2 text-base font-semibold">
            Tu ZIP es válido
            <StatusPill tone={phase === 'done' ? 'success' : phase === 'prepared' ? 'warning' : 'neutral'} size="sm">
              {{ imported: 'Importado', preparing: 'Preparando…', prepared: 'Preparado para publicar', activating: 'Publicando…', done: 'Publicado' }[phase]}
            </StatusPill>
          </h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Aún no es público. Primero se prepara una versión, la puedes ver en una vista previa privada y después la activas.</p>
          {(phase === 'preparing' || phase === 'activating') && <div role="status" aria-live="polite"><ProgressBar value={null} /></div>}
          <div className="flex flex-wrap gap-2">
            {phase === 'imported' && <CapabilityButton capability={caps.importZip} onClick={prepare}>Preparar versión</CapabilityButton>}
            {phase === 'prepared' && (
              <>
                <CapabilityButton capability={caps.previewSite} variant="outline" onClick={() => setPreviewOpen(true)}>Ver vista previa</CapabilityButton>
                <CapabilityButton capability={caps.importZip} onClick={() => setActivateOpen(true)}>Activar versión</CapabilityButton>
              </>
            )}
            {phase === 'done' && <p className="text-sm">La versión está activa. Revisa Publicaciones para ver el historial.</p>}
          </div>
        </section>
      )}

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
