import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { sceneAt } from '../../../../../../shared/studio/motion.js'

// Live slide: a read-only page renderer that draws sceneAt(document, page, time).
// Objects are built once (photos load and authorize once); every frame only moves
// them. Frame cost is published on the element as data-* for measurement.
export const MotionStage = forwardRef(function MotionStage({ editor, document, pageId, time, reducedMotion, width, height, fit, onReady, onError, style }, handle) {
  const host = useRef(null), player = useRef(null), stats = useRef({ frames: 0, total: 0, max: 0 }), latest = useRef(time)
  latest.current = time
  useImperativeHandle(handle, () => ({ capture: () => player.current?.captureFrame() ?? null }), [])

  function draw(at) {
    const renderer = player.current
    if (!renderer) return
    const started = performance.now()
    renderer.renderFrame(sceneAt(document, pageId, at, { reducedMotion }))
    const spent = performance.now() - started, s = stats.current
    s.frames++; s.total += spent; s.max = Math.max(s.max, spent)
    if (s.frames % 30 === 0 && host.current) Object.assign(host.current.dataset, { frames: String(s.frames), frameAvg: (s.total / s.frames).toFixed(3), frameMax: s.max.toFixed(3) })
  }

  useEffect(() => {
    const controller = new AbortController(), canvas = window.document.createElement('canvas')
    host.current.replaceChildren(canvas)
    let created = null
    editor.createPlayer(canvas, pageId, document, controller.signal).then(renderer => {
      created = renderer
      if (controller.signal.aborted) { renderer.destroy(); return }
      player.current = renderer
      draw(latest.current)
      onReady?.()
    }).catch(error => { if (!controller.signal.aborted) onError?.(error) })
    return () => {
      controller.abort()
      player.current = null
      created?.destroy()
    }
  }, [editor, document, pageId]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => { draw(time) }, [time, reducedMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: width * fit, height: height * fit, ...style }} className="relative shrink-0">
      {/* The Fabric canvas works in page pixels; CSS scales it to the stage. No pointer events: the stage handles navigation. */}
      <div ref={host} data-motion-stage className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${fit})` }} />
    </div>
  )
})

// Pixels of a slide that left the stage, shown while the transition runs.
export function CapturedFrame({ canvas, width, height, fit, style }) {
  const host = useRef(null)
  useLayoutEffect(() => {
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
    host.current.replaceChildren(canvas)
  }, [canvas])
  return <div ref={host} aria-hidden style={{ width: width * fit, height: height * fit, ...style }} className="shrink-0" />
}
