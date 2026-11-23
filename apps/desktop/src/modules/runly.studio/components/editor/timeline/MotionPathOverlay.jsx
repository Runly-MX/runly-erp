import { useMemo, useRef, useState } from 'react'
import { centerAt, insertPathPoint, movePathPoint, positionPath, removePathPoint, segmentMiddle, translatePath } from '../../../lib/motion-path.js'
import { formatSeconds } from '../../../lib/timeline-math.js'

const PATH = '#d946ef', HALO = 'rgba(255,255,255,0.9)', START = '#10b981', END = '#f43f5e', CHOSEN = '#a21caf'
const coarseQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

// Editing aid over the animated paper (Animación only, never part of the design or of any
// export): the position path of each selected element through its centre, numbered points
// in time order, direction, the playhead position and «+» handles to add a point. Points
// are dragged here and selected in sync with the timeline (identity = keyframe instant).
export function MotionPathOverlay({ objects, selectedIds, selectedKeyframe, time, zoom, page, readOnly, tool, onSelectPoint, onDraft, onCommit, onError }) {
  const svg = useRef(null), drag = useRef(null)
  const [coarse] = useState(coarseQuery)
  const s = 1 / zoom, hit = (coarse ? 22 : 10) * s
  const shown = useMemo(() => objects.filter(object => selectedIds.includes(object.id) && !object.hidden).map(object => ({ object, points: positionPath(object) })).filter(entry => entry.points.length), [objects, selectedIds])
  const toPage = event => {
    const box = svg.current.getBoundingClientRect()
    return [(event.clientX - box.left) * page.width / box.width, (event.clientY - box.top) * page.height / box.height]
  }
  const run = (object, change) => { try { return { keyframes: change() } } catch (failure) { onError(failure.message); return null } }

  function down(event, object, point) {
    if (event.button !== 0) return
    event.stopPropagation(); event.preventDefault()
    onSelectPoint(object.id, point.at)
    if (readOnly || object.locked) return
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
    drag.current = { object, point, origin: toPage(event), whole: event.shiftKey, patch: null }
  }
  function move(event) {
    const d = drag.current
    if (!d) return
    const [x, y] = toPage(event), dx = x - d.origin[0], dy = y - d.origin[1]
    if (!d.patch && Math.hypot(dx, dy) * zoom < 3) return
    try { d.patch = { keyframes: d.whole ? translatePath(d.object, dx, dy) : movePathPoint(d.object, d.point.at, { x: d.point.x + dx, y: d.point.y + dy }) } } catch { return }
    onDraft(d.object.id, d.patch, d.whole ? `Mover trayectoria · ${Math.round(dx)}, ${Math.round(dy)}` : `Punto · ${formatSeconds(d.point.at)} · X ${Math.round(d.point.x + dx)} · Y ${Math.round(d.point.y + dy)}`)
  }
  function up() {
    const d = drag.current
    drag.current = null
    if (d?.patch) onCommit(d.object.id, d.patch)
  }
  // Keyboard on a focused point: arrows move it 1 px (Mayús 10 px), Supr removes it.
  function keys(event, object, point) {
    if (readOnly || object.locked) return
    const step = event.shiftKey ? 10 : 1, delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
    let patch = null
    if (delta) patch = run(object, () => movePathPoint(object, point.at, { x: point.x + delta[0], y: point.y + delta[1] }))
    else if (event.key === 'Delete' || event.key === 'Backspace') patch = run(object, () => removePathPoint(object, point.at))
    else return
    event.preventDefault(); event.stopPropagation()
    if (patch) onCommit(object.id, patch)
  }
  function insert(event, object, index, middle) {
    event.stopPropagation(); event.preventDefault()
    const patch = run(object, () => insertPathPoint(object, index))
    if (patch) { onCommit(object.id, patch); onSelectPoint(object.id, middle.at) }
  }

  const single = shown.length === 1 && !tool?.session
  return (
    <svg ref={svg} aria-label="Trayectorias de movimiento" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${page.width} ${page.height}`}>
      {shown.map(({ object, points }) => {
        const line = points.map(point => `${point.x},${point.y}`).join(' '), now = centerAt(object, time), editable = !readOnly && !object.locked
        return (
          <g key={object.id}>
            <polyline points={line} fill="none" stroke={HALO} strokeWidth={5 * s} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={line} fill="none" stroke={PATH} strokeWidth={2 * s} strokeDasharray={`${7 * s} ${4 * s}`} strokeLinejoin="round" />
            {points.slice(1).map((point, i) => {
              const a = points[i], length = Math.hypot(point.x - a.x, point.y - a.y)
              if (length * zoom < 44) return null
              const angle = Math.atan2(point.y - a.y, point.x - a.x) * 180 / Math.PI
              return <path key={`d${point.at}`} d={`M ${-4 * s} ${-4 * s} L ${3 * s} 0 L ${-4 * s} ${4 * s}`} fill="none" stroke={PATH} strokeWidth={2 * s} strokeLinecap="round" strokeLinejoin="round"
                transform={`translate(${(a.x + point.x) / 2} ${(a.y + point.y) / 2}) rotate(${angle})`} />
            })}
            {single && editable ? points.slice(1).map((point, i) => {
              const a = points[i], middle = Math.hypot(point.x - a.x, point.y - a.y) * zoom >= 48 ? segmentMiddle(object, a, point) : null
              if (!middle) return null
              return (
                <g key={`m${point.at}`} role="button" aria-label={`Añadir punto entre ${i + 1} y ${i + 2}`} style={{ pointerEvents: 'all', cursor: 'copy' }}
                  onPointerDown={event => insert(event, object, i, middle)}>
                  <circle cx={middle.x} cy={middle.y} r={hit * 0.8} fill="transparent" />
                  <circle cx={middle.x} cy={middle.y} r={6 * s} fill="white" stroke={PATH} strokeWidth={1.5 * s} />
                  <path d={`M ${middle.x - 3 * s} ${middle.y} h ${6 * s} M ${middle.x} ${middle.y - 3 * s} v ${6 * s}`} stroke={PATH} strokeWidth={1.5 * s} strokeLinecap="round" />
                </g>
              )
            }) : null}
            <circle cx={now.x} cy={now.y} r={5 * s} fill={PATH} stroke="white" strokeWidth={2 * s} />
            {points.map((point, i) => {
              const chosen = selectedKeyframe?.id === object.id && selectedKeyframe.at === point.at
              const first = i === 0, last = i === points.length - 1 && points.length > 1
              // Crowded on screen (low zoom, dense stroke): a small unnumbered dot; still draggable and in the timeline.
              const dense = !first && !last && !chosen && Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y) * zoom < 24
              const r = (chosen ? 11 : dense ? 4 : 9) * s
              const fill = chosen ? CHOSEN : first ? START : last ? END : 'white', ink = fill === 'white' ? CHOSEN : 'white'
              const label = `Punto ${i + 1} de ${points.length}${first ? ' (inicio)' : last ? ' (final)' : ''}, ${formatSeconds(point.at)}`
              return (
                <g key={i} role="button" tabIndex={0} aria-label={label} aria-pressed={chosen} data-path-point={point.at}
                  style={{ pointerEvents: 'all', cursor: editable ? 'move' : 'pointer', outline: 'none' }}
                  onPointerDown={event => down(event, object, point)} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null }}
                  onKeyDown={event => keys(event, object, point)} onFocus={() => onSelectPoint(object.id, point.at)}>
                  <circle cx={point.x} cy={point.y} r={dense ? Math.max(r, hit * 0.5) : Math.max(hit, r)} fill="transparent" />
                  {last ? <rect x={point.x - r} y={point.y - r} width={2 * r} height={2 * r} rx={3 * s} fill={fill} stroke={chosen ? 'white' : PATH} strokeWidth={2 * s} />
                    : <circle cx={point.x} cy={point.y} r={r} fill={fill} stroke={chosen ? 'white' : first ? 'white' : PATH} strokeWidth={2 * s} />}
                  {dense ? null : <text x={point.x} y={point.y} dy={3.6 * s} textAnchor="middle" fontSize={10 * s} fontWeight="700" fill={ink} style={{ fontFamily: 'system-ui, sans-serif' }}>{i + 1}</text>}
                </g>
              )
            })}
          </g>
        )
      })}
      {tool?.live?.length ? (
        <g>
          <polyline points={tool.live.map(point => point.join(',')).join(' ')} fill="none" stroke={HALO} strokeWidth={5 * s} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={tool.live.map(point => point.join(',')).join(' ')} fill="none" stroke={PATH} strokeWidth={2.5 * s} strokeLinejoin="round" strokeLinecap="round" />
          {tool.session.mode === 'points' ? tool.live.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={4 * s} fill="white" stroke={PATH} strokeWidth={2 * s} />) : null}
        </g>
      ) : null}
    </svg>
  )
}

// Captures the gesture of «Dibujar movimiento» / «Crear trayectoria» over the whole paper.
export function MotionToolLayer({ tool, page }) {
  const layer = useRef(null)
  const toPage = event => {
    const box = layer.current.getBoundingClientRect()
    return [(event.clientX - box.left) * page.width / box.width, (event.clientY - box.top) * page.height / box.height]
  }
  return (
    <div ref={layer} data-motion-tool={tool.session.mode} className="absolute inset-0 z-10 touch-none" style={{ cursor: 'crosshair' }}
      onPointerDown={event => {
        if (event.button !== 0) return
        event.stopPropagation(); event.preventDefault()
        try { layer.current.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
        tool.pointer.down(toPage(event), event.timeStamp)
      }}
      onPointerMove={event => { if (tool.drawing) tool.pointer.move(toPage(event), event.timeStamp) }}
      onPointerUp={() => { if (tool.drawing) tool.pointer.up() }} onPointerCancel={() => { if (tool.drawing) tool.pointer.up() }} />
  )
}
