import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@runly/ui'
import { Clapperboard, Loader2, Play, Undo2 } from 'lucide-react'
import { transitionAt } from '../../../../../../../shared/studio/motion.js'
import { documentPages, pageId } from '../../../../../../../shared/studio/pages.js'
import { createSlideFrames } from '../../../lib/slide-frames.js'
import { layerStyle } from '../../../lib/stage-layers.js'

const STAGE = { width: 640, height: 360 }

// The real change between the previous page and this one, rendered like Presentar
// (same frames, same layers), forwards or backwards. Reads a snapshot; writes nothing.
export function TransitionPreviewDialog({ open, onOpenChange, editor, pageId: id, transition }) {
  const [document] = useState(() => editor.snapshot())
  const pages = useMemo(() => documentPages(document), [document])
  const index = Math.max(0, pages.findIndex(scene => pageId(scene) === id)), from = pages.length > 1 ? (index - 1 + pages.length) % pages.length : null
  const [urls, setUrls] = useState(null), [error, setError] = useState(''), [run, setRun] = useState(null), [progress, setProgress] = useState(1)
  const box = useRef(null)
  useEffect(() => {
    const frames = createSlideFrames({ editor, document, pages, stage: STAGE })
    Promise.all([from === null ? null : frames.frame(pageId(pages[from])), frames.frame(pageId(pages[index]))])
      .then(([before, after]) => { setUrls({ before, after }); setRun({ direction: 1, key: 1 }) })
      .catch(failure => { if (failure?.name !== 'AbortError') setError(failure.message) })
    return () => frames.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !transition.duration) { setProgress(1); return undefined }
    let frame
    const origin = performance.now() + 250
    const loop = () => { const p = Math.max(0, Math.min(1, (performance.now() - origin) / transition.duration)); setProgress(p); if (p < 1) frame = requestAnimationFrame(loop) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [run, transition.duration])

  const back = run?.direction === -1
  const layers = transitionAt(transition, progress, back ? -1 : 1)
  // Forwards the previous page leaves; backwards this page leaves and the previous returns.
  const sources = { outgoing: back ? urls?.after : urls?.before, incoming: back ? urls?.before : urls?.after }
  const scenes = { outgoing: back ? pages[index] : pages[from], incoming: back ? pages[from] : pages[index] }
  const layer = role => {
    const scene = scenes[role], url = sources[role]
    if (!scene || !url) return null
    const fit = Math.min(STAGE.width / scene.page.width, STAGE.height / scene.page.height)
    return (
      <div key={role} className="absolute inset-0 flex items-center justify-center" style={{ zIndex: layers.front === role ? 2 : 1 }}>
        <img src={url} alt="" draggable={false} className="max-w-none" style={{ width: scene.page.width * fit, height: scene.page.height * fit, ...layerStyle(layers[role]) }} />
      </div>
    )
  }
  const play = direction => setRun(previous => ({ direction, key: (previous?.key ?? 0) + 1 }))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader icon={Clapperboard}>
          <DialogTitle>Vista previa de la transición</DialogTitle>
          <DialogDescription>{from === null ? 'Solo hay una página: se muestra la entrada desde negro.' : `De la página ${from + 1} a la ${index + 1}, como al presentar.`}</DialogDescription>
        </DialogHeader>
        <div ref={box} className="relative mx-auto aspect-video w-full max-w-[640px] overflow-hidden rounded-md bg-black">
          {error ? <p className="absolute inset-0 flex items-center justify-center px-4 text-sm text-red-300">{error}</p>
            : urls ? <div className="absolute inset-0 origin-top-left" style={{ width: STAGE.width, height: STAGE.height, transform: `scale(${(box.current?.clientWidth ?? STAGE.width) / STAGE.width})` }}>{layer('outgoing')}{layer('incoming')}</div>
              : <span className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/70 motion-reduce:animate-none" aria-label="Preparando vista previa" /></span>}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-1.5" disabled={!urls || from === null} onClick={() => play(-1)}><Undo2 className="h-4 w-4" aria-hidden />Al retroceder</Button>
          <Button type="button" variant="outline" className="gap-1.5" disabled={!urls} onClick={() => play(1)}><Play className="h-4 w-4" aria-hidden />Reproducir de nuevo</Button>
          <Button type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
