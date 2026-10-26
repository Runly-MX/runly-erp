import { documentAssetIds } from '../../../../../shared/studio/shape-properties.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ErrorState, ConfirmDialog, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { AlertTriangle, CloudDownload, History } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { StudioWorkspace } from './StudioWorkspace.jsx'
import { createDraftStorage } from '../lib/draft-storage.js'
import { useStudioRealtime } from '../hooks/useStudioRealtime.js'
import { StudioSharing } from './StudioSharing.jsx'
import { StudioCreativeResources } from './StudioCreativeResources.jsx'
import { StudioCredits } from './StudioCredits.jsx'
import { createScopedClipboard } from '../lib/scoped-clipboard.js'
import { useStudioNavigation } from '../hooks/useStudioNavigation.js'
import { useStudioImageEditing } from '../hooks/useStudioImageEditing.jsx'
import { useSaveAsTemplate, useTemplateEditing } from './templates/useTemplateEditing.jsx'

const unwrap = response => response?.data ?? response

export function DesignEditor({ record, token, scope, onBack, onCopy, onRecordChange, editingTemplateId = null }) {
  const clipboard = useMemo(() => createScopedClipboard(scope.slice(0, scope.lastIndexOf(':'))), [scope])
  // Element library figures are real catalog icons (licensed, credited).
  const catalog = useMemo(() => ({
    importIcon: async id => (await runly.studio.catalogImport('iconify', id, record.id, token)).data.object,
    thumbnail: (id, signal) => runly.studio.catalogThumbnail('iconify', id, token, signal),
  }), [record.id, token])
  const authorizePaste = useCallback(async objects => {
    for (const id of documentAssetIds({objects})) {
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
  const [credits,setCredits]=useState(null)
  const [canEdit, setCanEdit] = useState(record.canEdit !== false), [denied, setDenied] = useState(false)
  const dirtyRef = useRef(false), refreshing = useRef(false)
  const initialAssets = useMemo(() => new Set(documentAssetIds(record.document)), [record.document])
  const boundAssets = useRef(initialAssets)
  const editorRef = useRef(null), revision = useRef(record.revision), generation = useRef(0), pending = useRef(null), timer = useRef(null), saving = useRef(false)
  const imageEditing = useStudioImageEditing({editorRef,designId:record.id,token,canEdit:canEdit && !denied})
  // Templates: save the current scene as a template; or, when opened from
  // "Editar contenido", write this design back to its template.
  const templateScope = scope.split(':').slice(0, 2)
  const saveAsTemplate = useSaveAsTemplate({ editorRef, token, scopeKey: templateScope, name })
  const templateEditing = useTemplateEditing({ editorRef, token, scopeKey: templateScope, templateId: editingTemplateId,
    designName: name, saveDesign: () => save(), onExit: onBack })
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
  // Resolves true once the server has this scene; a second call while saving
  // joins the save in flight instead of being dropped.
  function save(asCopy = false) {
    if (saving.current) return saving.current
    const task = performSave(asCopy).finally(() => { saving.current = null })
    saving.current = task
    return task
  }
  // The photo editor reads originals through the design's saved assets, so a
  // photo added since the last save must be saved first; never open it blindly.
  async function ensureSaved() {
    if (await save()) return
    throw new Error(conflict ? 'Resuelve el conflicto de versiones antes de editar la imagen. Tus cambios se conservan.'
      : 'Guarda el diseño antes de editar la imagen. Tus cambios se conservan.')
  }
  async function performSave(asCopy) {
    if (!editorRef.current || (!asCopy && (!canEdit || conflict))) return false
    setBusy(true); setError('')
    try {
      const editor = editorRef.current
      await editor.flush()
      if (editorRef.current !== editor) return false
      const sent = generation.current
      const draft = { name, document: editor.snapshot(), revision: revision.current }
      pending.current = draft; preserve()
      const saved = unwrap(await (asCopy ? runly.studio.createDesign({ name: `${name.slice(0, 145)} (copia)`, document: draft.document, sourceDesignId: record.id }, token) :
        runly.studio.updateDesign(record.id, draft, token)))
      if (asCopy) {
        if (generation.current !== sent) { preserve(); setError('La copia se guardó, pero hay cambios más recientes en este editor. Consérvalos antes de salir.'); return false }
        pending.current = null; clearTimeout(timer.current); store.clear(); dirtyRef.current = false; setDirty(false); navigation.finish(() => onCopy(saved.id)); return true
      }
      revision.current = saved.revision
      onRecordChange?.(saved)
      if (generation.current === sent) { pending.current = null; clearTimeout(timer.current); store.clear(); dirtyRef.current = false; setDirty(false); setRecovery(null) }
      else { pending.current = { ...pending.current, revision: saved.revision }; preserve() }
      return true
    } catch (error) { setConflict(error.status === 409); setError(error.message); return false }
    finally { setBusy(false) }
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
    onRecordChange?.(server)
    boundAssets.current = new Set(documentAssetIds(server.document))
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
      boundAssets.current = new Set(documentAssetIds(fresh.document))
      onRecordChange?.(fresh)
      setInitial(fresh.document); setName(fresh.name); nameRef.current = fresh.name; revision.current = fresh.revision
      setCanEdit(fresh.canEdit); setWorkspaceVersion(value => value + 1)
    } catch (error) { if ([401,403,404].includes(error.status)) revoked() }
    finally { refreshing.current = false }
  }, [record.id, token, preserve, revoked, onRecordChange])
  const realtime = useStudioRealtime({ id: record.id, token, scope, onRevision: confirmed, onDenied: revoked })
  // `point` (optional): centre of a drag-and-drop in page coordinates.
  async function insertResource(asset, point = null) {
    const url = unwrap(await runly.files.getSignedUrl(asset.id, token)).signedUrl
    const response = await fetch(url)
    if (!response.ok) throw new Error('La imagen ya no está disponible.')
    const bitmap = await createImageBitmap(await response.blob())
    const width = bitmap.width, height = bitmap.height; bitmap.close()
    if (width * height > 25_000_000) throw new Error('La imagen supera 25 megapíxeles.')
    const scale = Math.min(1, initial.page.width / width / 2, initial.page.height / height / 2)
    const size = { width: width * scale, height: height * scale }
    await editorRef.current.add('image', { fileAssetId: asset.id, ...size, ...(point ? { x: Math.round(point.x - size.width / 2), y: Math.round(point.y - size.height / 2) } : {}) })
  }
  async function openCredits(action) {
    const editor=editorRef.current
    if(!editor)return
    try {await editor.flush();if(editorRef.current===editor)setCredits({scene:editor.snapshot(),action})}
    catch(error){setExportError(error.message)}
  }
  async function exportImage(format, quality, reviewedScene) {
    if (!editorRef.current || exporting) return
    setExporting(true); setExportError('')
    try {
      const blob = await editorRef.current.exportImage(format, quality, reviewedScene), url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'diseño'}.${format}` })
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setExportError(error.message) } finally { setExporting(false) }
  }
  if (denied) return <div className="flex h-full items-center justify-center p-6"><ErrorState title="El diseño ya no está disponible" description="Tu copia local se conserva. Comprueba tus permisos con el propietario." showReport={false} onRetry={onBack} /></div>
  const notices = <>
    {templateEditing.notice}
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
    onSave: () => save(), ensureSaved, saveDisabled: !ready || !canEdit || busy || conflict,
    onShare: () => openCredits({kind:'share'}), onExport: (format,quality) => openCredits({kind:'export',format,quality}),
    onCredits: () => openCredits(), onSaveTemplate: ready ? saveAsTemplate.open : null, exporting, exportDisabled: exporting, notices,
  }
  return <>
    <StudioWorkspace key={workspaceVersion} initial={initial} readOnly={!canEdit} participants={realtime.participants} chrome={chrome}
      sharedClipboard={clipboard} authorizePaste={authorizePaste} onEditImage={imageEditing.editImage} catalog={catalog}
      resourcePanel={({ disabled, uploader }) => <StudioCreativeResources key={scope} token={token} designId={record.id} disabled={disabled} uploader={uploader} onFileInsert={insertResource} onVectorInsert={object => editorRef.current.add('vector',object)} />}
      onPointer={realtime.pointer} onSelectionChange={realtime.selection} resolveImage={resolveImage} uploadImage={uploadImage} onChange={changed} editorRef={editorRef} onReady={setReady} />
    <StudioSharing record={record} token={token} open={shareOpen} onOpenChange={setShareOpen} />
    {imageEditing.dialog}
    {saveAsTemplate.dialog}
    {credits?<StudioCredits id={record.id} token={token} scene={credits.scene} action={credits.action} onClose={()=>setCredits(null)} onContinue={()=>{const {action,scene}=credits;setCredits(null);if(action.kind==='share')setShareOpen(true);else exportImage(action.format,action.quality,scene)}}/>:null}
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
