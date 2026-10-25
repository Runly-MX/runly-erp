import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, FileUploader, ErrorState, Skeleton, ConfirmDialog } from '@runly/ui'
import { createStudioEditor } from '../lib/fabric-adapter.js'
import { StudioInspector } from './StudioInspector.jsx'

export function StudioWorkspace({ initial, resolveImage, uploadImage, onChange, editorRef, onReady }) {
  const canvasRef = useRef(null)
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(0.5), [confirm, setConfirm] = useState(false)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false }), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const changed = useCallback(document => { setObjects(document.objects); onChange(document) }, [onChange])
  const callbacksRef = useRef({ resolveImage, changed })
  callbacksRef.current = { resolveImage, changed }
  useEffect(() => {
    let cancelled = false, editor
    createStudioEditor(canvasRef.current, { document: initial, resolveImage: id => callbacksRef.current.resolveImage(id),
      onChange: document => callbacksRef.current.changed(document), onSelection: setSelection, onError: setError, onHistory: setHistory }).then(instance => {
      editor = instance
      if (cancelled) { instance.destroy(); return }
      editorRef.current = instance; setReady(true); onReady?.(true)
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true; editorRef.current = null; onReady?.(false); editor?.destroy() }
  }, [initial, editorRef, retry, onReady])
  async function attempt(action) {
    try { setBusy(true); setError(''); await action() } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  function shortcut(event) {
    if (!ready || busy || event.target.closest('input,textarea,[contenteditable=true]')) return
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    const action = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : ({ y: 'redo', c: 'copy', v: 'paste', d: 'duplicate' })[key]
    if (!action) return
    event.preventDefault(); event.stopPropagation(); attempt(() => editorRef.current[action]())
  }
  return <div role="application" aria-label="Editor gráfico de Runly Studio" tabIndex={0} onKeyDown={shortcut} className="grid min-h-[65dvh] gap-4 text-foreground outline-none lg:grid-cols-[240px_minmax(0,1fr)_280px]">
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-semibold">Añadir al diseño</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!ready || busy || !history.canUndo} onClick={() => attempt(() => editorRef.current.undo())}>Deshacer</Button>
        <Button variant="outline" size="sm" disabled={!ready || busy || !history.canRedo} onClick={() => attempt(() => editorRef.current.redo())}>Rehacer</Button>
      </div>
      <div className="flex flex-wrap gap-2 lg:flex-col">
        {[['text', 'Texto'], ['rectangle', 'Rectángulo'], ['ellipse', 'Círculo']].map(([type, label]) =>
          <Button key={type} variant="outline" disabled={!ready || busy} onClick={() => attempt(() => editorRef.current.add(type))}>{label}</Button>)}
      </div>
      <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={!ready || busy} emptyLabel="Añadir imagen"
        hint="PNG, JPG o WebP. Se conserva el original." onUpload={async file => {
          const image = await uploadImage(file)
          await editorRef.current.add('image', { fileAssetId: image.id, width: image.width, height: image.height })
          return null
        }} />
      <p className="text-xs text-muted-foreground">Arrastra para mover. Usa los tiradores para escalar y rotar. Doble clic para escribir.</p>
    </aside>
    <section aria-label="Área de diseño" className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{initial.page.width} × {initial.page.height} px</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Alejar" onClick={() => setZoom(value => Math.max(0.1, value - 0.1))}>−</Button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" aria-label="Acercar" onClick={() => setZoom(value => Math.min(2, value + 0.1))}>+</Button>
        </div>
      </div>
      {error && <ErrorState title="No se pudo completar la operación" description={error} showReport={false}
        onRetry={!ready ? () => { setError(''); setRetry(value => value + 1) } : undefined} />}
      {!ready && !error && <Skeleton className="h-24 w-full" />}
      <div className="h-[60dvh] overflow-auto rounded-lg border border-border bg-muted p-6">
        <div style={{ width: initial.page.width * zoom, height: initial.page.height * zoom }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: initial.page.width }}>
            <canvas ref={canvasRef} aria-label="Lienzo editable de Runly Studio" />
          </div>
        </div>
      </div>
    </section>
    <aside className="rounded-lg border border-border bg-card p-3">
      <StudioInspector selection={selection} onPatch={patch => attempt(() => editorRef.current.patch(patch))} onRemove={() => setConfirm(true)}
        onAction={action => attempt(() => editorRef.current[action]())} onOrder={direction => attempt(() => editorRef.current.order(direction))} busy={busy} />
      <Button variant="outline" size="sm" disabled={!ready || busy || !history.canPaste} onClick={() => attempt(() => editorRef.current.paste())}>Pegar</Button>
      <div className="mt-6 space-y-2" aria-label="Elementos del diseño">
        <h2 className="text-sm font-semibold">Elementos</h2>
        {objects.map((object, index) => <Button key={object.id} variant={selection?.id === object.id ? 'secondary' : 'ghost'}
          className="w-full justify-start" disabled={!ready || busy} onClick={() => editorRef.current?.select(object.id)}>
          {index + 1}. {{ text: 'Texto', rectangle: 'Rectángulo', ellipse: 'Círculo', image: 'Imagen' }[object.type]}{object.locked ? ' · Bloqueado' : ''}{object.hidden ? ' · Oculto' : ''}
        </Button>)}
      </div>
    </aside>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar elemento" description="Se eliminará la selección del diseño."
      onConfirm={() => { editorRef.current.remove(); setConfirm(false) }} />
  </div>
}
