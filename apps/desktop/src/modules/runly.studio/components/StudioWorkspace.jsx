import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, FileUploader, ErrorState, Skeleton, ConfirmDialog } from '@runly/ui'
import { createStudioEditor } from '../lib/fabric-adapter.js'
import { StudioInspector } from './StudioInspector.jsx'

export function StudioWorkspace({ initial, resolveImage, uploadImage, onChange, editorRef }) {
  const canvasRef = useRef(null)
  const [selection, setSelection] = useState(null), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [zoom, setZoom] = useState(0.5), [confirm, setConfirm] = useState(false)
  const [objects, setObjects] = useState(initial.objects)
  const changed = useCallback(document => { setObjects(document.objects); onChange(document) }, [onChange])
  const callbacksRef = useRef({ resolveImage, changed })
  callbacksRef.current = { resolveImage, changed }
  useEffect(() => {
    let cancelled = false, editor
    createStudioEditor(canvasRef.current, { document: initial, resolveImage: id => callbacksRef.current.resolveImage(id),
      onChange: document => callbacksRef.current.changed(document), onSelection: setSelection, onError: setError }).then(instance => {
      editor = instance
      if (cancelled) { instance.destroy(); return }
      editorRef.current = instance; setReady(true)
    }).catch(error => { if (!cancelled) setError(error.message) })
    return () => { cancelled = true; editorRef.current = null; editor?.destroy() }
  }, [initial, editorRef])
  async function attempt(action) {
    try { setError(''); await action() } catch (error) { setError(error.message) }
  }
  return <div className="grid min-h-[65dvh] gap-4 text-foreground lg:grid-cols-[240px_minmax(0,1fr)_280px]">
    <aside className="space-y-3 rounded-lg border border-border bg-card p-3">
      <h2 className="text-sm font-semibold">Añadir al diseño</h2>
      <div className="flex flex-wrap gap-2 lg:flex-col">
        {[['text', 'Texto'], ['rectangle', 'Rectángulo'], ['ellipse', 'Círculo']].map(([type, label]) =>
          <Button key={type} variant="outline" disabled={!ready} onClick={() => attempt(() => editorRef.current.add(type))}>{label}</Button>)}
      </div>
      <FileUploader accept="image/png,image/jpeg,image/webp" maxSizeMB={10} disabled={!ready} emptyLabel="Añadir imagen"
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
      {error && <ErrorState title="No se pudo completar la operación" description={error} showReport={false} />}
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
      <StudioInspector selection={selection} onPatch={patch => attempt(() => editorRef.current.patch(patch))} onRemove={() => setConfirm(true)} />
      <div className="mt-6 space-y-2" aria-label="Elementos del diseño">
        <h2 className="text-sm font-semibold">Elementos</h2>
        {objects.map((object, index) => <Button key={object.id} variant={selection?.id === object.id ? 'secondary' : 'ghost'}
          className="w-full justify-start" onClick={() => editorRef.current?.select(object.id)}>
          {index + 1}. {{ text: 'Texto', rectangle: 'Rectángulo', ellipse: 'Círculo', image: 'Imagen' }[object.type]}
        </Button>)}
      </div>
    </aside>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Eliminar elemento" description="Se eliminará la selección del diseño."
      onConfirm={() => { editorRef.current.remove(); setConfirm(false) }} />
  </div>
}
