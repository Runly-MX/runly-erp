import { useEffect, useMemo, useState } from 'react'
import { MOTION_KEYS, SLIDE_LIMITS } from '../../../../../../../shared/studio/motion.js'
import { documentPages, pageId, withPages } from '../../../../../../../shared/studio/pages.js'
import { MotionStage } from '../../present/MotionStage.jsx'

const TAIL = 500
const strip = object => Object.fromEntries(Object.entries(object).filter(([key]) => !MOTION_KEYS.includes(key)))

// Plays one effect on the real selected elements, once, over the paper. It draws a
// temporary copy of the page (other elements still, the targets with only this effect,
// starting now) with the read-only player: nothing is written, saved, undone or synced.
export function EffectPreviewLayer({ editor, document, pageId: id, page, preview, onDone }) {
  const length = preview.effect.duration * (preview.effect.repeat ?? 1) + TAIL
  const temporary = useMemo(() => withPages(document, documentPages(document).map(scene => pageId(scene) !== id ? scene : {
    page: { ...scene.page, slide: { ...scene.page.slide, duration: Math.min(SLIDE_LIMITS.maxDuration, Math.max(SLIDE_LIMITS.minDuration, length)) } },
    objects: scene.objects.map(object => (preview.ids.includes(object.id) ? { ...strip(object), [preview.kind]: { ...preview.effect, delay: preview.kind === 'enter' ? 150 : 0 } } : strip(object))),
  })), [document, id, preview, length])
  const [time, setTime] = useState(0), [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ready) return undefined
    let frame
    const origin = performance.now()
    const loop = () => {
      const at = performance.now() - origin
      setTime(Math.min(at, length))
      if (at < length) frame = requestAnimationFrame(loop)
      else onDone()
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [ready, preview, length]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-effect-preview aria-hidden className="pointer-events-none absolute inset-0 z-[6] bg-[hsl(var(--background))]" style={{ opacity: ready ? 1 : 0 }}>
      <MotionStage editor={editor} document={temporary} pageId={id} time={time} width={page.width} height={page.height} fit={1} onReady={() => setReady(true)} onError={onDone} />
    </div>
  )
}
