import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, FileUploader, ErrorState, Skeleton, ConfirmDialog, Input, SelectField, Checkbox } from '@runly/ui'
import { createStudioEditor } from '../lib/fabric-adapter.js'
import { StudioInspector } from './StudioInspector.jsx'
import { StudioPageDialog } from './StudioPageDialog.jsx'
import { useStudioViewport } from '../hooks/useStudioViewport.js'

export function StudioWorkspace({ initial, resolveImage, uploadImage, onChange, editorRef, onReady, readOnly = false,
  participants = [], onPointer, onSelectionChange, resourcePanel, sharedClipboard, authorizePaste }) {
  const canvasRef = useRef(null)
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [confirm, setConfirm] = useState(false)
  const [page, setPage] = useState(initial.page), [pageOpen, setPageOpen] = useState(false), [selectedIds, setSelectedIds] = useState([]), [alignTarget, setAlignTarget] = useState('page')
  const pageRef = useRef(initial.page)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const view = useStudioViewport(page, editorRef), zoom = view.zoom
  const [history, setHistory] = useState({ canUndo: false, canRedo: false }), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const changed = useCallback(document => { setObjects(document.objects); setPage(document.page); pageRef.current = document.page; onChange(document) }, [onChange])
  const callbacksRef = useRef({ resolveImage, changed, onPointer, onSelectionChange, authorizePaste }), modeRef = useRef(readOnly)
  useEffect(() => { callbacksRef.current = { resolveImage, changed, onPointer, onSelectionChange, authorizePaste } }, [resolveImage, changed, onPointer, onSelectionChange, authorizePaste])
  useEffect(() => { modeRef.current = readOnly; editorRef.current?.setReadOnly(readOnly) }, [readOnly, editorRef])
  useEffect(() => {
    let cancelled = false, editor
    createStudioEditor(canvasRef.current, { document: initial, resolveImage: id => callbacksRef.current.resolveImage(id),
      sharedClipboard, authorizePaste: objects => callbacksRef.current.authorizePaste?.(objects),
      readOnly: modeRef.current, onPointer: point => callbacksRef.current.onPointer?.(point && point.x >= 0 && point.y >= 0 && point.x <= pageRef.current.width && point.y <= pageRef.current.height ? point : null),
      onChange: document => callbacksRef.current.changed(document), onSelection: (selection, ids) => { setSelection(selection); setSelectedIds(ids); callbacksRef.current.onSelectionChange?.(selection?.id ?? null) }, onError: setError, onHistory: setHistory }).then(instance => {
      editor = instance
      if (cancelled) { instance.destroy(); return }
      instance.setReadOnly(modeRef.current); editorRef.current = instance; setReady(true); onReady?.(true)
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true; editorRef.current = null; onReady?.(false); editor?.destroy() }
  }, [initial, editorRef, retry, onReady, sharedClipboard])
  async function attempt(action) {
    try { setBusy(true); setError(''); await action() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  function shortcut(event) {
    if (!ready || busy || event.target.closest('input,textarea,[contenteditable=true]')) return
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const action = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : ({ y: 'redo', c: 'copy', v: 'paste', d: 'duplicate' })[key]
    if (!action) return
    if (readOnly && action !== 'copy') return
    event.preventDefault(); event.stopPropagation(); attempt(() => editorRef.current[action]())
  }
  return <div role="application" aria-label="Editor gráfico de Studio" tabIndex={0} onKeyDown={shortcut} className="grid min-h-[65dvh] gap-4 text-foreground outline-none lg:grid-cols-[240px_minmax(0,1fr)_280px]">
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-semibold">Añadir al diseño</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={readOnly || !ready || busy || !history.canUndo} onClick={() => attempt(() => editorRef.current.undo())}>Deshacer</Button>
        <Button variant="outline" size="sm" disabled={readOnly || !ready || busy || !history.canRedo} onClick={() => attempt(() => editorRef.current.redo())}>Rehacer</Button>
      </div>
      <div className="flex flex-wrap gap-2 lg:flex-col">
        {[['text', 'Texto'], ['rectangle', 'Rectángulo'], ['ellipse', 'Círculo']].map(([type, label]) =>
          <Button key={type} variant="outline" disabled={readOnly || !ready || busy} onClick={() => attempt(() => editorRef.current.add(type))}>{label}</Button>)}
      </div>
      <Button variant="outline" disabled={readOnly || !ready || busy} onClick={() => setPageOpen(true)}>Tamaño y fondo</Button>
      {resourcePanel ? resourcePanel({ disabled: readOnly || !ready || busy, uploader: <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={readOnly || !ready || busy} emptyLabel="Subir nueva imagen"
        hint="PNG, JPG o WebP. Se conserva el original." onUpload={async file => {
          const image = await uploadImage(file)
          await editorRef.current.add('image', { fileAssetId: image.id, width: image.width, height: image.height })
          return null
        }} /> }) : <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={readOnly || !ready || busy} emptyLabel="Añadir imagen"
        hint="PNG, JPG o WebP. Se conserva el original." onUpload={async file => {
          const image = await uploadImage(file)
          await editorRef.current.add('image', { fileAssetId: image.id, width: image.width, height: image.height })
          return null
        }} />}
      <p className="text-xs text-muted-foreground">Arrastra para mover. Usa los tiradores para escalar y rotar. Doble clic para escribir.</p>
    </aside>
    <section aria-label="Área de diseño" className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{page.width} × {page.height} px</span>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Alejar" onClick={() => view.changeZoom(zoom - 0.1)}>−</Button>
          <Input aria-label="Zoom porcentual" type="number" min={5} max={400} className="w-20" value={Math.round(zoom * 100)} onChange={event => { if (event.target.value) view.changeZoom(Number(event.target.value) / 100) }} />
          <Button variant="outline" size="sm" aria-label="Acercar" onClick={() => view.changeZoom(zoom + 0.1)}>+</Button>
          <Button variant="ghost" size="sm" onClick={view.fit}>Ajustar página</Button>
          <Button variant="ghost" size="sm" onClick={view.center}>Centrar</Button>
          <Button variant="ghost" size="sm" onClick={() => view.changeZoom(1)}>100%</Button>
          <Button variant={view.hand ? 'secondary' : 'ghost'} size="sm" aria-pressed={view.hand} onClick={() => view.setHand(value => !value)}>Mano</Button>
        </div>
      </div>
      {error && <ErrorState title="No se pudo completar la operación" description={error} showReport={false}
        onRetry={!ready ? () => { setError(''); setRetry(value => value + 1) } : undefined} />}
      {!ready && !error && <Skeleton className="h-24 w-full" />}
      <div ref={view.viewport} {...view.gestures} aria-label="Viewport de Studio" className="h-[60dvh] overflow-auto overscroll-contain rounded-lg border border-border bg-muted" style={{ touchAction: view.hand ? 'none' : 'auto', cursor: view.hand ? 'grab' : undefined }}>
        <div style={{ position: 'relative', width: Math.max(view.size.width, page.width * zoom + 96), height: Math.max(view.size.height, page.height * zoom + 96) }}>
          <div ref={view.paper} style={{ position: 'absolute', left: Math.max(48, (view.size.width - page.width * zoom) / 2), top: Math.max(48, (view.size.height - page.height * zoom) / 2), transform: `scale(${zoom})`, transformOrigin: 'top left', width: page.width, height: page.height }}>
            <canvas ref={canvasRef} aria-label="Lienzo editable de Studio" />
            {participants.map(user => <div key={`${user.userId}:${user.sessionId}`} className="pointer-events-none absolute inset-0">
              {Number.isFinite(user.x) && Number.isFinite(user.y) && <span aria-label={`Cursor de ${user.name}`} data-document-x={user.x} data-document-y={user.y}
                className="absolute rounded bg-fuchsia-700 px-2 py-1 text-xs text-white" style={{ left: user.x, top: user.y }}>↖ {user.name}</span>}
              {objects.filter(object => object.id === user.selectedId).map(object => <span key={object.id} aria-label={`Selección de ${user.name}`}
                className="absolute border-2 border-fuchsia-500" style={{ left: object.x, top: object.y, width: object.width * (object.scaleX ?? 1), height: object.height * (object.scaleY ?? 1), transform: `rotate(${object.rotation}deg)`, transformOrigin: 'top left' }} />)}
            </div>)}
          </div>
        </div>
      </div>
    </section>
    <aside className="rounded-lg border border-border bg-card p-3">
      <StudioInspector selection={selection} onPatch={patch => attempt(() => editorRef.current.patch(patch))} onRemove={() => setConfirm(true)}
        onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))} busy={busy || readOnly} />
      <Button variant="outline" size="sm" disabled={readOnly || !ready || busy || !history.canPaste} onClick={() => attempt(() => editorRef.current.paste())}>Pegar</Button>
      <section aria-label="Alineación" className="mt-4 space-y-2">
        <SelectField id="studio-align-target" label="Alinear respecto a" value={alignTarget} onChange={setAlignTarget} options={[{ value: 'page', label: 'Página' }, { value: 'selection', label: 'Selección' }]} />
        <p className="text-xs text-muted-foreground">{selectedIds.length} seleccionados · Los bloqueados y ocultos no se modifican.</p>
        <div className="grid grid-cols-2 gap-1">{[['left','Izquierda'],['center','Centro horizontal'],['right','Derecha'],['top','Arriba'],['middle','Centro vertical'],['bottom','Abajo'],['distribute-x','Distribuir horizontal'],['distribute-y','Distribuir vertical']].map(([action,label]) => <Button key={action} variant="ghost" size="sm" disabled={readOnly || busy || !ready || selectedIds.length < (action.startsWith('distribute') ? 3 : 1)} onClick={() => attempt(() => editorRef.current.align(action, alignTarget))}>{label}</Button>)}</div>
      </section>
      <div className="mt-6 space-y-2" aria-label="Elementos del diseño">
        <h2 className="text-sm font-semibold">Elementos</h2>
        {objects.map((object, index) => <div key={object.id} className="flex items-center gap-1"><Checkbox aria-label={`Seleccionar elemento ${index + 1}`} disabled={!ready || busy || object.hidden || object.locked} checked={selectedSet.has(object.id)} onCheckedChange={checked => editorRef.current?.selectMany(checked ? [...selectedIds, object.id] : selectedIds.filter(id => id !== object.id))} /><Button variant={selectedSet.has(object.id) ? 'secondary' : 'ghost'}
          className="w-full justify-start" disabled={!ready || busy} onClick={() => editorRef.current?.select(object.id)}>
          {index + 1}. {{ text: 'Texto', rectangle: 'Rectángulo', ellipse: 'Círculo', image: 'Imagen' }[object.type]}{object.locked ? ' · Bloqueado' : ''}{object.hidden ? ' · Oculto' : ''}
        </Button></div>)}
      </div>
    </aside>
    {pageOpen && <StudioPageDialog open page={page} disabled={readOnly} onClose={() => setPageOpen(false)} onApply={(page, scale) => editorRef.current.resize(page, scale)} />}
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar elemento" description="Se eliminará la selección del diseño."
      onConfirm={() => attempt(() => { editorRef.current.remove(); setConfirm(false) })} />
  </div>
}
