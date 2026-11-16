import { useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SliderRow } from '@runly/ui'
import { Clapperboard, Pause, Play, RotateCcw } from 'lucide-react'
import { findPage } from '../../../../../../../shared/studio/pages.js'
import { slideDuration } from '../../../../../../../shared/studio/motion.js'
import { MotionStage } from '../../present/MotionStage.jsx'

const STEP = 50
const label = ms => `${(ms / 1000).toFixed(1).replace('.', ',')} s`
const reducedMotionQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Plays one page with the same engine as Presentar; the slider seeks to any instant.
// Reads a snapshot of the design: nothing here edits, saves or syncs.
export function AnimationPreviewDialog({ open, onOpenChange, editor, pageId }) {
  const [document] = useState(() => editor.snapshot()), scene = findPage(document, pageId)
  const duration = slideDuration(scene.page), [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState('')
  const [reducedMotion] = useState(reducedMotionQuery), box = useRef(null), [width, setWidth] = useState(560)
  const origin = useRef(null)
  useEffect(() => {
    const element = box.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!playing) return undefined
    let frame
    origin.current = performance.now() - time
    const loop = () => {
      const at = Math.min(duration, performance.now() - origin.current)
      setTime(at)
      if (at >= duration) { setPlaying(false); return }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps
  const fit = Math.min(width / scene.page.width, 360 / scene.page.height)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader icon={Clapperboard}>
          <DialogTitle>Previsualizar animaciones</DialogTitle>
          <DialogDescription>{reducedMotion ? 'Tu sistema pide reducir el movimiento: los elementos aparecen sin desplazarse.' : 'Reproduce la página o arrastra el tiempo para ver cualquier instante.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div ref={box} className="flex h-[min(360px,45dvh)] items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]">
            {error ? <p className="px-4 text-sm text-destructive">{error}</p> : (
              <MotionStage editor={editor} document={document} pageId={pageId} time={time} reducedMotion={reducedMotion} width={scene.page.width} height={scene.page.height} fit={fit} onError={failure => setError(failure.message)} />
            )}
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => { if (!playing && time >= duration) setTime(0); setPlaying(value => !value) }}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Volver al inicio" onClick={() => { setPlaying(false); setTime(0) }}><RotateCcw className="h-4 w-4" /></Button>
            <div className="min-w-0 flex-1">
              <SliderRow label="Tiempo" value={Math.round(time / STEP) * STEP} min={0} max={duration} step={STEP} zero={0} format={label}
                onChange={value => { setPlaying(false); setTime(value) }} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
