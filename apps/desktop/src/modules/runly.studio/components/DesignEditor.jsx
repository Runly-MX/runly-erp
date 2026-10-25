import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, PageHeader, ErrorState, ConfirmDialog, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui'
import { runly } from '../../../lib/runly.js'
import { StudioWorkspace } from './StudioWorkspace.jsx'
import { createDraftStorage } from '../lib/draft-storage.js'

const unwrap = response => response?.data ?? response

export function DesignEditor({ record, token, scope, onBack, onCopy }) {
  const store = useMemo(() => createDraftStorage({ getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value), removeItem: key => window.localStorage.removeItem(key) }, scope), [scope])
  const [initial, setInitial] = useState(record.document), [name, setName] = useState(record.name)
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [conflict, setConflict] = useState(false), [leaving, setLeaving] = useState(false), [server, setServer] = useState(null)
  const [recovery, setRecovery] = useState(() => store.read()), [copyWarning, setCopyWarning] = useState(false)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const editorRef = useRef(null), revision = useRef(record.revision), generation = useRef(0), pending = useRef(null), timer = useRef(null), saving = useRef(false)
  const nameRef = useRef(name); nameRef.current = name
  const preserve = useCallback(() => {
    if (pending.current) setCopyWarning(!store.write(pending.current))
  }, [store])
  const changed = useCallback(document => {
    generation.current++; setDirty(true)
    pending.current = { name: nameRef.current, document, revision: revision.current }
    clearTimeout(timer.current); timer.current = setTimeout(preserve, 150)
  }, [preserve])
  useEffect(() => {
    if (!dirty) return
    const warn = event => { preserve(); event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, preserve])
  useEffect(() => () => { clearTimeout(timer.current); if (pending.current) store.write(pending.current) }, [store])
  const resolveImage = useCallback(async id => {
    const signed = unwrap(await runly.files.getSignedUrl(id, token))
    if (!signed.signedUrl) throw new Error('No se pudo abrir la imagen original.')
    return signed.signedUrl
  }, [token])
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
    if (!editorRef.current || saving.current || (conflict && !asCopy)) return
    saving.current = true; setBusy(true); setError('')
    const sent = generation.current
    try {
      const editor = editorRef.current
      await editor.flush()
      if (editorRef.current !== editor) return
      const draft = { name, document: editor.snapshot(), revision: revision.current }
      pending.current = draft; preserve()
      const saved = unwrap(await (asCopy ? runly.studio.createDesign({ name: `${name.slice(0, 145)} (copia)`, document: draft.document }, token) :
        runly.studio.updateDesign(record.id, draft, token)))
      if (asCopy) {
        if (generation.current !== sent) { preserve(); setError('La copia se guardó, pero hay cambios más recientes en este editor. Consérvalos antes de salir.'); return }
        pending.current = null; clearTimeout(timer.current); store.clear(); onCopy(saved.id); return
      }
      revision.current = saved.revision
      if (generation.current === sent) { pending.current = null; clearTimeout(timer.current); store.clear(); setDirty(false); setRecovery(null) }
      else { pending.current = { ...pending.current, revision: saved.revision }; preserve() }
    } catch (error) { setConflict(error.status === 409); setError(error.message) }
    finally { saving.current = false; setBusy(false) }
  }
  function recover() {
    setWorkspaceVersion(value => value + 1)
    const stale = recovery.revision !== revision.current
    setInitial(recovery.document); setName(recovery.name); revision.current = recovery.revision
    pending.current = recovery; generation.current++; setDirty(true); setConflict(stale); setRecovery(null)
    setError(stale ? 'La copia local parte de una revisión anterior. Puedes guardarla como otro diseño.' : '')
  }
  async function review() {
    try { setServer(unwrap(await runly.studio.getDesign(record.id, token))) } catch (error) { setError(error.message) }
  }
  function loadServer() {
    setWorkspaceVersion(value => value + 1)
    preserve(); setRecovery(pending.current); pending.current = null; clearTimeout(timer.current)
    setInitial(server.document); setName(server.name); revision.current = server.revision
    setDirty(false); setConflict(false); setError(''); setServer(null)
  }
  async function exportPng() {
    if (!editorRef.current) return
    try {
      const blob = await editorRef.current.exportPng(), url = URL.createObjectURL(blob)
      const link = Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'diseño'}.png` })
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setError(error.message) }
  }
  return <div className="space-y-4 p-4">
    <PageHeader compact title="Runly Studio" description="Tu espacio para dar forma a las ideas" onBack={() => dirty ? setLeaving(true) : onBack()} actions={<div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={exportPng}>Exportar PNG</Button><Button onClick={() => save()} disabled={busy || conflict}>{busy ? 'Guardando…' : 'Guardar'}</Button>
    </div>} />
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label="Nombre del diseño" className="max-w-sm" value={name} maxLength={160} onChange={event => {
        nameRef.current = event.target.value; setName(event.target.value)
        if (editorRef.current) changed(editorRef.current.snapshot())
      }} />
      <span role="status" className="text-xs text-muted-foreground">{busy ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardado'}</span>
    </div>
    {recovery && <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" role="status">
      <p className="text-sm">Hay una copia local pendiente de recuperar.</p>
      <Button variant="outline" onClick={recover}>Recuperar copia local</Button>
      <Button variant="ghost" onClick={() => { store.clear(); setRecovery(null) }}>Descartar copia local</Button>
    </div>}
    {error && <ErrorState title={conflict ? 'Conflicto de versiones' : 'El diseño conserva tus cambios'} description={error} showReport={false} />}
    {conflict && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => save(true)}>Guardar como copia</Button>
      <Button variant="outline" onClick={review}>Revisar versión del servidor</Button>
    </div>}
    {error && !conflict && <Button variant="outline" disabled={busy} onClick={() => save()}>Reintentar guardado</Button>}
    {copyWarning && <p role="alert" className="text-sm text-destructive">No se pudo conservar la copia en este navegador. Mantén esta página abierta y reintenta guardar.</p>}
    <StudioWorkspace key={workspaceVersion} initial={initial} resolveImage={resolveImage} uploadImage={uploadImage} onChange={changed} editorRef={editorRef} />
    <ConfirmDialog open={leaving} onOpenChange={setLeaving} title="Salir sin guardar" description="Los cambios pendientes se conservarán en una copia local en este navegador durante siete días."
      confirmLabel="Salir" onConfirm={() => { preserve(); onBack() }} />
    <Dialog open={Boolean(server)} onOpenChange={open => { if (!open) setServer(null) }}><DialogContent><DialogHeader>
      <DialogTitle>Versión del servidor</DialogTitle><DialogDescription>La copia local se conserva al cargar esta versión.</DialogDescription>
    </DialogHeader>{server && <div className="space-y-3"><p>{server.name} · Revisión {server.revision} · {server.document.objects.length} elementos</p>
      <Button onClick={loadServer}>Cargar versión del servidor</Button></div>}</DialogContent></Dialog>
  </div>
}
