import { documentAssetIds } from '../../../../../shared/studio/shape-properties.js'
import {validateDocument} from '../../../../../shared/studio/document.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, ConfirmDialog } from '@runly/ui'
import { AlertTriangle, Eye, History } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { StudioWorkspace } from './StudioWorkspace.jsx'
import { createDraftStorage, recoverDraftDocument, createDraftArchive, sameDraft } from '../lib/draft-storage.js'
import { useStudioRealtime } from '../hooks/useStudioRealtime.js'
import { useStudioSync } from '../hooks/useStudioSync.js'
import { StudioSharing } from './StudioSharing.jsx'
import { StudioCreativeResources } from './StudioCreativeResources.jsx'
import { StudioCredits } from './StudioCredits.jsx'
import { createScopedClipboard } from '../lib/scoped-clipboard.js'
import { useStudioNavigation } from '../hooks/useStudioNavigation.js'
import { useStudioImageEditing } from '../hooks/useStudioImageEditing.jsx'
import { useSaveAsTemplate, useTemplateEditing } from './templates/useTemplateEditing.jsx'
import { exportDesign } from '../lib/studio-export.js'
import { downloadName, nextPaint, sanitizeExportError } from '../lib/studio-download.js'
import { AccessLost } from './editor/collaboration/AccessLost.jsx'
import { DownloadNotice } from './editor/DownloadNotice.jsx'

const unwrap = response => response?.data ?? response

// Real-time collaborative editor: every local change is synced as object
// operations (useStudioSync); collaborators' changes arrive live. There is no
// save button and no revision conflict. The browser draft only protects work
// that has not reached the server yet (offline, closing the tab).
export function DesignEditor({ record, token, scope, onBack, onRecordChange, editingTemplateId = null }) {
  const clipboard = useMemo(() => createScopedClipboard(scope.slice(0, scope.lastIndexOf(':'))), [scope])
  // Element library figures are real catalog icons (licensed, credited).
  const catalog = useMemo(() => ({
    importIcon: async id => (await runly.studio.catalogImport('iconify', id, record.id, token)).data.object,
    thumbnail: (id, signal) => runly.studio.catalogThumbnail('iconify', id, token, signal),
  }), [record.id, token])
  const boundAssets = useRef(new Set(documentAssetIds(record.document)))
  const authorizePaste = useCallback(async objects => {
    for (const id of documentAssetIds({objects})) {
      // Cross-document reuse needs independent Files access; a source design's private capability is not transferable.
      if (!boundAssets.current.has(id)) await runly.files.getSignedUrl(id, token)
    }
  }, [token])
  const store = useMemo(() => createDraftStorage({ getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) }, scope), [scope])
  const collisions=useMemo(()=>createDraftStorage({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)},`${scope}:collision`),[scope])
  const archive=useMemo(()=>createDraftArchive(window.localStorage,scope),[scope])
  const [initial] = useState(record.document), [name, setName] = useState(record.name)
  const [error, setError] = useState('')
  // Download: null | { phase: preparing|processing|downloading|done|cancelled|error, format, file, message }. The ref is the real guard against double clicks.
  const [download, setDownload] = useState(null), job = useRef(null), [shareOpen, setShareOpen] = useState(false)
  const exporting = Boolean(download && ['preparing', 'processing', 'downloading'].includes(download.phase))
  const [recovery, setRecovery] = useState(() => archive.read()??store.read()??collisions.read()), [copyWarning, setCopyWarning] = useState(false)
  const [ready, setReady] = useState(false)
  const [credits,setCredits]=useState(null)
  const [canEdit, setCanEdit] = useState(record.canEdit !== false), [denied, setDenied] = useState(false), [lostEdit, setLostEdit] = useState(false), [viewerSeen, setViewerSeen] = useState(false)
  const editorRef = useRef(null), nameRef = useRef(name), timer = useRef(null)
  const { sync, status,revision:sharedRevision } = useStudioSync({ record, token, scope, editorRef,
    onName: value => { nameRef.current = value; setName(value) },
    onError: message => setError(message),onConflict:draft=>{if(!archive.stash(draft))setCopyWarning(true);collisions.write(draft);setRecovery(current=>current??draft)} })
  const unsynced = status !== 'synced'
  const imageEditing = useStudioImageEditing({editorRef,designId:record.id,token,canEdit:canEdit && !denied})
  // Templates: save the current scene as a template; or, when opened from
  // "Editar contenido", write this design back to its template.
  const templateScope = scope.split(':').slice(0, 2)
  const saveAsTemplate = useSaveAsTemplate({ editorRef, token, scopeKey: templateScope, name,ensureSaved })
  const templateEditing = useTemplateEditing({ editorRef, token, scopeKey: templateScope, templateId: editingTemplateId,
    designName: name, saveDesign: ensureSaved, onExit: onBack })
  const preserve = useCallback(() => {
    if(recovery&&!archive.stash(recovery)){setCopyWarning(true);return false}
    const { document, revision } = sync.state()
    if (sync.state().status === 'synced') { store.clear(); return true }
    const saved = store.write({ ...sync.draft(),name: nameRef.current, document, revision })
    setCopyWarning(!saved)
    return saved
  }, [store, sync,recovery,archive])
  // Local edits only; collaborators' changes ({remote: true}) are already shared.
  const changed = useCallback((document, meta) => {
    if (meta?.remote) { for (const id of documentAssetIds(document)) boundAssets.current.add(id); return }
    sync.local(document)
    clearTimeout(timer.current); timer.current = setTimeout(preserve, 400)
  }, [sync, preserve])
  // Fully synced: no local draft is needed and the route cache gets the latest scene.
  useEffect(() => {
    if (status !== 'synced') return
    const state = sync.state()
    const protectedCopy=!recovery||archive.stash(recovery)
    if(protectedCopy)store.clear()
    setCopyWarning(!protectedCopy); setError('')
    onRecordChange?.({ ...record, name: state.name, revision: state.revision, document: state.document })
  }, [status,sharedRevision,recovery]) // eslint-disable-line react-hooks/exhaustive-deps
  const navigation = useStudioNavigation(unsynced && !denied, preserve)
  useEffect(() => () => { clearTimeout(timer.current); if (sync.state().status !== 'synced') preserve() }, [preserve, sync])
  // A (re)mounted canvas shows the shared state, which may be newer than `initial`.
  useEffect(() => { if (ready) editorRef.current?.applyRemote(sync.state().document) }, [ready, sync])
  // Images added by collaborators are bound to the design: read them through it.
  const resolveImage = useCallback(async id => {
    let signed = null
    if (boundAssets.current.has(id)) signed = unwrap(await runly.studio.assetUrl(record.id, id, token))
    else {
      try { signed = unwrap(await runly.files.getSignedUrl(id, token)) }
      catch (error) { signed = unwrap(await runly.studio.assetUrl(record.id, id, token).catch(() => { throw error })) }
    }
    if (!signed?.signedUrl) throw new Error('No se pudo abrir la imagen original.')
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
    const page = sync.state().document.page, scale = Math.min(1, page.width / width / 2, page.height / height / 2)
    return { id: asset.id, width: Math.max(1, width * scale), height: Math.max(1, height * scale) }
  }, [token, sync])
  // The photo editor reads originals through the design's assets: the photo
  // must have reached the server first.
  async function ensureSaved() {
    await editorRef.current?.flush()
    await sync.flush()
    if (sync.state().status !== 'synced') throw new Error('Los cambios todavía no llegan al servidor. Revisa la conexión; tus cambios se conservan.')
    return sync.state().document
  }
  async function recover() {
    try { await editorRef.current.load(recoverDraftDocument(sync.state().document,recovery)); if (recovery.name && recovery.name !== nameRef.current) { nameRef.current = recovery.name; setName(recovery.name); sync.rename(recovery.name) } retireRecovery() }
    catch (failure) { setError(failure.message) }
  }
  function retireRecovery(){
    if(!archive.remove(recovery)){setCopyWarning(true);return}
    if(sameDraft(store.read(),recovery))store.clear()
    if(sameDraft(collisions.read(),recovery))collisions.clear()
    setRecovery(archive.read())
  }
  const revoked = useCallback(() => { preserve();sync.deny(); setDenied(true) }, [preserve,sync])
  // Polling and whole-document updates (MCP, PUT): permission and missed revisions.
  const confirmed = useCallback((nextRevision, permission) => {
    if (typeof permission === 'boolean') {setCanEdit(current => { if (current && !permission) { setLostEdit(true); setViewerSeen(false) } if (!current && permission) setLostEdit(false); return permission });if(!permission&&sync.state().pending)sync.deny()}
    if (Number.isSafeInteger(nextRevision) && nextRevision > sync.state().revision) sync.changed(nextRevision)
  }, [sync])
  const realtime = useStudioRealtime({ id: record.id, token, scope, onRevision: confirmed, onDenied: revoked, onChange: sync.receive })
  // `point` (optional): centre of a drag-and-drop in page coordinates.
  async function insertResource(asset, point = null) {
    const url = unwrap(await runly.files.getSignedUrl(asset.id, token)).signedUrl
    const response = await fetch(url)
    if (!response.ok) throw new Error('La imagen ya no está disponible.')
    const bitmap = await createImageBitmap(await response.blob())
    const width = bitmap.width, height = bitmap.height; bitmap.close()
    if (width * height > 25_000_000) throw new Error('La imagen supera 25 megapíxeles.')
    const page = sync.state().document.page, scale = Math.min(1, page.width / width / 2, page.height / height / 2)
    const size = { width: width * scale, height: height * scale }
    await editorRef.current.add('image', { fileAssetId: asset.id, ...size, ...(point ? { x: Math.round(point.x - size.width / 2), y: Math.round(point.y - size.height / 2) } : {}) })
  }
  async function openCredits(action) {
    const editor=editorRef.current
    if(!editor)return
    try {await ensureSaved();await editor.flush();if(editorRef.current===editor)setCredits({scene:editor.snapshot(),action})}
    catch(error){setDownload({ phase: 'error', message: sanitizeExportError(error) })}
  }
  // Screen (PNG/JPG) or print PDF (RGB/CMYK, bleed, crop marks) from ExportDialog.
  async function exportImage(options, reviewedScene) {
    const editor = editorRef.current
    if (!editor || job.current) return
    const current = job.current = { cancelled: false }, format = options.type === 'pdf' ? 'PDF' : options.type.toUpperCase()
    const phase = (value, extra) => { if (!current.cancelled) setDownload({ phase: value, format, ...extra }) }
    phase('preparing')
    // The render is synchronous work: paint the notice first, and tell the flow when the browser render is over (a PDF is then built on the server).
    const observed = new Proxy(editor, { get: (target, key) => key === 'exportImage'
      ? async (...args) => { const blob = await target.exportImage(...args); phase('processing'); return blob }
      : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
    try {
      await nextPaint()
      await ensureSaved()
      const fresh=unwrap(await runly.studio.getDesign(record.id,token))
      // Fabric measures text boxes at render time. Compare persisted documents
      // here; exportImage separately verifies the exact reviewed canvas snapshot.
      if(fresh.revision!==sync.state().revision||JSON.stringify(validateDocument(fresh.document))!==JSON.stringify(validateDocument(sync.state().document)))throw Error('El diseño cambió. Revisa la revisión actual antes de descargar.')
      const { blob, extension } = await exportDesign({ editor: observed, options, scene: reviewedScene, designId: record.id, token, name,revision:fresh.revision })
      const authorized=unwrap(await runly.studio.getDesign(record.id,token))
      if(authorized.revision!==fresh.revision)throw Error('El diseño cambió durante la exportación. Vuelve a revisar y descargar.')
      if (current.cancelled) return
      phase('downloading'); await nextPaint()
      const file = downloadName(name, extension), url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: url, download: file }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      phase('done', { file }); setTimeout(() => setDownload(now => now?.phase === 'done' ? null : now), 6000)
    } catch (error) { phase('error', { message: sanitizeExportError(error) }) } finally { if (job.current === current) job.current = null }
  }
  // The render cannot be interrupted, but its result is discarded and nothing is downloaded; a new download can start right away.
  function cancelDownload() { if (job.current) { job.current.cancelled = true; job.current = null; setDownload({ phase: 'cancelled' }) } }
  if (denied) return <AccessLost onBack={onBack} preserved={sync.state().status !== 'synced' || Boolean(store.read())} />
  const notices = <>
    {templateEditing.notice}
    {recovery && canEdit ? <Notice icon={History} title="Hay una copia local para revisar" description="Se conservó tu trabajo durante la sincronización. Recuperar aplica los cambios locales disponibles sobre el diseño actual; revisa el resultado.">
      <Button size="sm" disabled={!ready} onClick={recover}>Recuperar</Button>
      <Button size="sm" variant="ghost" onClick={retireRecovery}>Descartar</Button>
    </Notice> : null}
    {lostEdit && !canEdit && !viewerSeen ? <Notice icon={Eye} title="Ahora solo puedes ver este diseño" description="Tu permiso de edición cambió y ya no puedes modificarlo. Los cambios que no llegaron al servidor se conservan en este navegador.">
      <Button size="sm" variant="ghost" onClick={() => setViewerSeen(true)}>Entendido</Button>
    </Notice> : null}
    {error && !(lostEdit && !canEdit) ? <Notice variant="warning" icon={AlertTriangle} title="No se pudo sincronizar un cambio" description={`${error} Los cambios locales se conservan para revisarlos.`}>
      <Button size="sm" variant="ghost" onClick={() => setError('')}>Cerrar</Button>
    </Notice> : null}
    {copyWarning ? <Notice variant="destructive" icon={AlertTriangle} title="Sin copia local" description="No se pudo conservar en este navegador lo que aún no se sincroniza. Mantén esta página abierta hasta que diga «Sincronizado»." /> : null}
    <DownloadNotice download={download} onCancel={cancelDownload} onClose={() => setDownload(null)} />
  </>
  const chrome = {
    name, nameDisabled: !canEdit || !ready, onBack,
    onName: value => { nameRef.current = value; setName(value); if (value.trim()) sync.rename(value.trim()) },
    syncState: status, live: realtime.status, onRetrySync: () => sync.resync(), ensureSaved,
    onShare: () => openCredits({kind:'share'}), onExport: options => openCredits({kind:'export',format:options.type,options}),
    onCredits: () => openCredits(), onSaveTemplate: ready ? async()=>{try{await ensureSaved();saveAsTemplate.open()}catch(e){setError(e.message)}} : null, exporting, exportDisabled: exporting, notices,
  }
  return <>
    <StudioWorkspace initial={initial} readOnly={!canEdit} participants={realtime.participants} selfId={scope.split(':')[1]} chrome={chrome}
      sharedClipboard={clipboard} authorizePaste={authorizePaste} onEditImage={imageEditing.editImage} catalog={catalog}
      resourcePanel={({ disabled, uploader }) => <StudioCreativeResources key={scope} token={token} designId={record.id} disabled={disabled} uploader={uploader} onFileInsert={insertResource} onVectorInsert={object => editorRef.current.add('vector',object)} />}
      onPointer={realtime.pointer} onSelectionChange={realtime.selection} resolveImage={resolveImage} uploadImage={uploadImage} onChange={changed} editorRef={editorRef} onReady={setReady} />
    <StudioSharing record={record} token={token} open={shareOpen} onOpenChange={setShareOpen} />
    {imageEditing.dialog}
    {saveAsTemplate.dialog}
    {credits?<StudioCredits id={record.id} token={token} scene={credits.scene} action={credits.action} onClose={()=>setCredits(null)} onContinue={()=>{const {action,scene}=credits;setCredits(null);if(action.kind==='share')setShareOpen(true);else exportImage(action.options,scene)}}/>:null}
    <ConfirmDialog open={navigation.pending} onOpenChange={open => { if (!open) navigation.cancel() }} title="Salir antes de sincronizar" description={copyWarning ? 'No se pudo conservar la copia local. Si sales puedes perder los últimos cambios. Espera a que diga «Sincronizado».' : 'Algunos cambios aún no llegan al servidor. Se conservarán en este navegador y podrás recuperarlos al volver.'}
      confirmLabel="Salir" onConfirm={navigation.proceed} />
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
