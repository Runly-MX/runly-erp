import { useMemo, useRef } from 'react'
import { sceneAt } from '../../../../../../../shared/studio/motion.js'
import { MotionStage } from '../../present/MotionStage.jsx'

const SCALED = new Set(['text', 'line'])
// Corners of an evaluated object (contract: x/y top-left, rotation around it).
function corners(item) {
  const w = SCALED.has(item.type) ? item.width * (item.scaleX ?? 1) : item.width, h = SCALED.has(item.type) ? item.height * (item.scaleY ?? 1) : item.height
  const r = item.rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [item.x + x * c - y * s, item.y + x * s + y * c])
}
function contains(item, [px, py]) {
  const w = SCALED.has(item.type) ? item.width * (item.scaleX ?? 1) : item.width, h = SCALED.has(item.type) ? item.height * (item.scaleY ?? 1) : item.height
  const r = -item.rotation * Math.PI / 180, dx = px - item.x, dy = py - item.y
  const x = dx * Math.cos(r) - dy * Math.sin(r), y = dx * Math.sin(r) + dy * Math.cos(r)
  return x >= 0 && y >= 0 && x <= w && y <= h
}

// Modo Animación: the paper shows the evaluated scene at the playhead (read-only renderer).
// Selecting hits the evaluated geometry; dragging moves the animated state (a keyframe
// draft committed on release), never the design geometry underneath.
export function AnimatedCanvasLayer({ editor, document, pageId, page, time, zoom = 1, reducedMotion, selectedIds, readOnly, hand, onSelect, onDrag, onDragEnd }) {
  const layer = useRef(null), gesture = useRef(null)
  const frame = useMemo(() => sceneAt(document, pageId, time), [document, pageId, time])
  const toPage = event => {
    const box = layer.current.getBoundingClientRect()
    return [(event.clientX - box.left) * page.width / box.width, (event.clientY - box.top) * page.height / box.height]
  }
  function onPointerDown(event) {
    if (hand || event.button !== 0) return
    const point = toPage(event)
    const hit = [...frame.objects].reverse().find(item => !item.hidden && (item.opacity ?? 1) > 0.02 && contains(item, point))
    onSelect(hit?.id ?? null)
    if (!hit || readOnly || hit.locked) return
    event.preventDefault()
    try { layer.current.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
    gesture.current = { id: hit.id, start: point, moved: false }
  }
  function onPointerMove(event) {
    const g = gesture.current
    if (!g) return
    const [x, y] = toPage(event), dx = x - g.start[0], dy = y - g.start[1]
    if (!g.moved && Math.hypot(dx, dy) < 2) return
    g.moved = true
    onDrag(g.id, dx, dy)
  }
  function onPointerUp(event) {
    const g = gesture.current
    gesture.current = null
    if (!g?.moved) return
    const [x, y] = toPage(event)
    onDragEnd(g.id, x - g.start[0], y - g.start[1])
  }
  const selected = frame.objects.filter(item => selectedIds.includes(item.id) && !item.hidden)
  return (
    <div ref={layer} data-animated-canvas onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { gesture.current = null }}
      className="absolute inset-0 z-[5] touch-none select-none bg-[hsl(var(--background))] outline outline-fuchsia-500" style={{ outlineWidth: `${3 / zoom}px`, cursor: hand ? undefined : 'default' }}>
      <MotionStage editor={editor} document={document} pageId={pageId} time={time} reducedMotion={reducedMotion} width={page.width} height={page.height} fit={1} />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${page.width} ${page.height}`}>
        {selected.map(item => <polygon key={item.id} points={corners(item).map(p => p.join(',')).join(' ')} fill="none" stroke="#d946ef" strokeWidth={2 / zoom} />)}
      </svg>
    </div>
  )
}
