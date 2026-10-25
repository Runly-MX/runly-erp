import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ErrorState, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { AlertTriangle, CloudDownload, History } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { StudioWorkspace } from './StudioWorkspace.jsx'
import { createDraftStorage } from '../lib/draft-storage.js'
import { useStudioRealtime } from '../hooks/useStudioRealtime.js'
import { StudioSharing } from './StudioSharing.jsx'
import { StudioResources } from './StudioResources.jsx'
import { createScopedClipboard } from '../lib/scoped-clipboard.js'
import { useStudioNavigation } from '../hooks/useStudioNavigation.js'

const unwrap = response => response?.data ?? response

export function DesignEditor({ record, token, scope, onBack, onCopy }) {
  const clipboard = useMemo(() => createScopedClipboard(scope.slice(0, scope.lastIndexOf(':'))), [scope])
  const authorizePaste = useCallback(async objects => {
    for (const id of new Set(objects.filter(object => object.type === 'image').map(object => object.fileAssetId))) {
      // Cross-document reuse needs independent Files access; a source design's private capability is not transferable.
      if (!boundAssets.current.has(id)) await runly.files.getSignedUrl(id, token)
    }
  }, [token])
  const store = useMemo(() => createDraftStorage({ getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) }, scope), [scope])
  const [initial, setInitial] = useState(record.document), [name, setName] = useState(record.name)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [conflict, setConflict] = useState(false), [server, setServer] = useState(null)
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState(''), [shareOpen, setShareOpen] = useState(false)
  const [recovery, setRecovery] = useState(() => store.read()), [copyWarning, setCopyWarning] = useState(false)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const [canEdit, setCanEdit] = useState(record.canEdit !== false), [denied, setDenied] = useState(false)
  const dirtyRef = useRef(false), refreshing = useRef(false)
  const initialAssets = useMemo(() => new Set(record.document.objects.filter(object => object.type === 'image').map(object => object.fileAssetId)), [record.document])
  const boundAssets = useRef(initialAssets)
  const editorRef = useRef(null), revision = useRef(record.revision), generation = useRef(0), pending = useRef(null), timer = useRef(null), saving = useRef(false)
  const nameRef = useRef(name)
  const preserve = useCallback(() => {
    if (!pending.current) return true
    const saved = store.write(pending.current)
    setCopyWarning(!saved)
    return saved
  }, [store])
  const changed = useCallback(document => {
    dirtyRef.current = true
    generation.current++; setDirty(true)
    pending.current = { name: nameRef.current, document, revision: revision.current }
    clearTimeout(timer.current); timer.current = setTimeout(preserve, 150)
  }, [preserve])
  const navigation = useStudioNavigation(dirty, preserve)
  useEffect(() => () => { clearTimeout(timer.current); if (pending.current) store.write(pending.current) }, [store])
  const resolveImage = useCallback(async id => {
    const existing = boundAssets.current.has(id)
    const signed = unwrap(await (existing ? runly.studio.assetUrl(record.id, id, token) : runly.files.getSignedUrl(id, token)))
    if (!signed.signedUrl) throw new Error('No se pudo abrir la imagen original.')
    return signed.signedUrl
  }, [token, record.id])
  const uploadImage = useCallback(async file => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.')
    const bitmap = await createImageBitmap(file), width = bitmap.width, height = bitmap.height
    bitmap.close()
    if (width * height > 25_000_000) throw new Error('La imagen supera 25 megapíxeles.')
    const form = new FormData()
    form.append('file', file); form.append('moduleKey', 'runly.files'); form.append('entityType', 'AtlasFile')
    form.append('metadata', JSON.stringify({ source: 'runly.studio', originalWidth: width, originalHeight: height }))
    const asset = unwrap(await runly.files.upload(form, token))
    const scale = Math.min(1, initial.page.width / width / 2, initial.page.height / height / 2)
    return { id: asset.id, width: Math.max(1, width * scale), height: Math.max(1, height * scale) }
  }, [token, initial])
  async function save(asCopy = false) {
    if (!editorRef.current || saving.current || (!asCopy && (!canEdit || conflict))) return
    saving.current = true; setBusy(true); setError('')
    const sent = generation.current
    try {
      const editor = editorRef.current
      await editor.flush()
      if (editorRef.current !== editor) return
      const draft = { name, document: editor.snapshot(), revision: revision.current }
      pending.current = draft; preserve()
      const saved = unwrap(await (asCopy ? runly.studio.createDesign({ name: `${name.slice(0, 145)} (copia)`, document: draft.document, sourceDesignId: record.id }, token) :
        runly.studio.updateDesign(record.id, draft, token)))
      if (asCopy) {
        if (generation.current !== sent) { preserve(); setError('La copia se guardó, pero hay cambios más recientes en este editor. Consérvalos antes de salir.'); return }
        pending.current = null; clearTimeout(timer.current); store.clear(); dirtyRef.current = false; setDirty(false); navigation.finish(() => onCopy(saved.id)); return
      }
      revision.current = saved.revision
      if (generation.current === sent) { pending.current = null; clearTimeout(timer.current); store.clear(); dirtyRef.current = false; setDirty(false); setRecovery(null) }
      else { pending.current = { ...pending.current, revision: saved.revision }; preserve() }
    } catch (error) { setConflict(error.status === 409); setError(error.message) }
    finally { saving.current = false; setBusy(false) }
  }
  function recover() {
    setWorkspaceVersion(value => value + 1)
    const stale = recovery.revision !== revision.current
    setInitial(recovery.document); setName(recovery.name); nameRef.current = recovery.name; revision.current = recovery.revision
    pending.current = recovery; generation.current++; setDirty(true); setConflict(stale); setRecovery(null)
    dirtyRef.current = true
    setError(stale ? 'La copia local parte de una revisión anterior. Puedes guardarla como otro diseño.' : '')
  }
  async function review() {
    try { setServer(unwrap(await runly.studio.getDesign(record.id, token))) } catch (error) { setError(error.message) }
  }
  function loadServer() {
    if (!preserve()) return
    boundAssets.current = new Set(server.document.objects.filter(object => object.type === 'image').map(object => object.fileAssetId))
    setWorkspaceVersion(value => value + 1)
    preserve(); setRecovery(pending.current); pending.current = null; clearTimeout(timer.current)
    setInitial(server.document); setName(server.name); nameRef.current = server.name; revision.current = server.revision
    setDirty(false); setConflict(false); setError(''); setServer(null)
    dirtyRef.current = false
  }
  const revoked = useCallback(() => { preserve(); setDenied(true) }, [preserve])
  const confirmed = useCallback(async (nextRevision, permission) => {
    if (typeof permission === 'boolean') setCanEdit(permission)
    if (saving.current) return
    if (nextRevision <= revision.current || refreshing.current) return
    if (dirtyRef.current) { preserve(); setConflict(true); setError('Hay una revisión nueva. Tu borrador se conserva; revisa el servidor o guarda una copia.'); return }
    refreshing.current = true
    try {
      const fresh = unwrap(await runly.studio.getDesign(record.id, token))
      if (fresh.revision <= revision.current) return
      if (dirtyRef.current) { preserve(); setConflict(true); setError('Hay una revisión nueva. Tu borrador se conserva.'); return }
      boundAssets.current = new Set(fresh.document.objects.filter(object => object.type === 'image').map(object => object.fileAssetId))
      setInitial(fresh.document); setName(fresh.name); nameRef.current = fresh.name; revision.current = fresh.revision
      setCanEdit(fresh.canEdit); setWorkspaceVersion(value => value + 1)
    } catch (error) { if ([401,403,404].includes(error.status)) revoked() }
    finally { refreshing.current = false }
  }, [record.id, token, preserve, revoked])
  const realtime = useStudioRealtime({ id: record.id, token, scope, onRevision: confirmed, onDenied: revoked })
  async function insertResource(asset) {
    const url = unwrap(await runly.files.getSignedUrl(asset.id, token)).signedUrl
    const response = await fetch(url)
    if (!response.ok) throw new Error('La imagen ya no está disponible.')
    const bitmap = await createImageBitmap(await response.blob())
    const width = bitmap.width, height = bitmap.height; bitmap.close()
    if (width * height > 25_000_000) throw new Error('La imagen supera 25 megapíxeles.')
    const scale = Math.min(1, initial.page.width / width / 2, initial.page.height / height / 2)
    await editorRef.current.add('image', { fileAssetId: asset.id, width: width * scale, height: height * scale })
  }
  async function exportImage(format, quality) {
    if (!editorRef.current || exporting) return
    setExporting(true); setExportError('')
    try {
      const blob = await editorRef.current.exportImage(format, quality), url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'diseño'}.${format}` })
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setExportError(error.message) } finally { setExporting(false) }
  }
  if (denied) return <div className="flex h-full items-center justify-center p-6"><ErrorState title="El diseño ya no está disponible" description="Tu copia local se conserva. Comprueba tus permisos con el propietario." showReport={false} onRetry={onBack} /></div>
  const notices = <>
    {recovery ? <Notice icon={History} title="Hay una copia local sin guardar" description="Se conservó en este navegador la última vez que editaste.">
      <Button size="sm" onClick={recover}>Recuperar</Button>
      <Button size="sm" variant="ghost" onClick={() => { store.clear(); setRecovery(null) }}>Descartar</Button>
    </Notice> : null}
    {error ? <Notice variant="warning" icon={AlertTriangle} title={conflict ? 'Conflicto de versiones' : 'El diseño conserva tus cambios'} description={error}>
      {conflict ? <>
        <Button size="sm" disabled={!ready || busy} onClick={() => save(true)}>Guardar como copia</Button>
        <Button size="sm" variant="outline" onClick={review}>Ver versión del servidor</Button>
      </> : <Button size="sm" variant="outline" disabled={busy} onClick={() => save()}>Reintentar guardado</Button>}
    </Notice> : null}
    {copyWarning ? <Notice variant="destructive" icon={AlertTriangle} title="Sin copia local" description="No se pudo conservar la copia en este navegador. Mantén esta página abierta y reintenta guardar." /> : null}
    {exportError ? <Notice variant="destructive" icon={AlertTriangle} title="No se pudo descargar" description={`${exportError} Vuelve a intentarlo cuando el recurso esté disponible.`}>
      <Button size="sm" variant="ghost" onClick={() => setExportError('')}>Cerrar</Button>
    </Notice> : null}
  </>
  const chrome = {
    name, nameDisabled: !canEdit || !ready, onBack,
    onName: value => { nameRef.current = value; setName(value); if (editorRef.current) changed(editorRef.current.snapshot()) },
    saveState: busy ? 'saving' : dirty ? 'dirty' : 'saved', live: realtime.status,
    onSave: () => save(), saveDisabled: !ready || !canEdit || busy || conflict,
    onShare: () => setShareOpen(true), onExport: exportImage, exporting, exportDisabled: exporting, notices,
  }
  return <>
    <StudioWorkspace key={workspaceVersion} initial={initial} readOnly={!canEdit} participants={realtime.participants} chrome={chrome}
      sharedClipboard={clipboard} authorizePaste={authorizePaste}
      resourcePanel={({ disabled, uploader }) => <StudioResources key={scope} token={token} disabled={disabled} uploader={uploader} onInsert={insertResource} />}
      onPointer={realtime.pointer} onSelectionChange={realtime.selection} resolveImage={resolveImage} uploadImage={uploadImage} onChange={changed} editorRef={editorRef} onReady={setReady} />
    <StudioSharing record={record} token={token} open={shareOpen} onOpenChange={setShareOpen} />
    <ConfirmDialog open={navigation.pending} onOpenChange={open => { if (!open) navigation.cancel() }} title="Salir sin guardar" description={copyWarning ? 'No se pudo conservar la copia local. Si sales puedes perder estos cambios. Cancela y guarda antes de continuar.' : 'Los cambios pendientes se conservarán en una copia local en este navegador durante siete días.'}
      confirmLabel="Salir" onConfirm={navigation.proceed} />
    <Dialog open={Boolean(server)} onOpenChange={open => { if (!open) setServer(null) }}>
      <DialogContent size="md">
        <DialogHeader icon={CloudDownload}>
          <DialogTitle>Versión del servidor</DialogTitle>
          <DialogDescription>Tu copia local se conserva al cargar esta versión.</DialogDescription>
        </DialogHeader>
        {server ? <p className="text-sm">{server.name} · Revisión {server.revision} · {server.document.objects.length} elementos</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setServer(null)}>Cancelar</Button>
          <Button onClick={loadServer}>Cargar versión del servidor</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}

function Notice({ variant = 'default', icon: Icon, title, description, children }) {
  return (
    <Alert variant={variant} className="pointer-events-auto max-w-lg bg-[hsl(var(--card))] shadow-lg">
      <Icon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {children ? <div className="mt-2.5 flex flex-wrap gap-2">{children}</div> : null}
    </Alert>
  )
}
