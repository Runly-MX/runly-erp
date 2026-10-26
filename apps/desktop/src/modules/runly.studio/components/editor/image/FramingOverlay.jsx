import { useEffect, useId, useRef } from 'react'
import { Move } from 'lucide-react'
import { adjustmentsCss, maskPath } from '../../../lib/frame-shapes.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Same placement as studio-photo's _render: the cropped source scaled by
// cover/contain × zoom, centred on the frame, then moved by offset × frame size.
function placement(item, props, natural) {
  if (!natural) return null
  const sw = natural.width * props.crop.width, sh = natural.height * props.crop.height
  const k = (props.fit === 'contain' ? Math.min(item.width / sw, item.height / sh) : Math.max(item.width / sw, item.height / sh))
  return { width: sw, height: sh, base: k }
}

// In "cover" the photo must always cover the frame (no empty gaps), so the
// offset is limited by how much the scaled photo overflows the frame.
function limit(next, item, props, place) {
  if (!place || props.fit !== 'cover' || props.rotation) return { offsetX: clamp(next.offsetX, -4, 4), offsetY: clamp(next.offsetY, -4, 4) }
  const k = place.base * next.zoom
  const maxX = Math.max(0, (place.width * k - item.width) / 2) / item.width, maxY = Math.max(0, (place.height * k - item.height) / 2) / item.height
  return { offsetX: clamp(next.offsetX, -maxX, maxX), offsetY: clamp(next.offsetY, -maxY, maxY) }
}

// "Editar encuadre": rendered inside the scaled page (document coordinates).
// The mask outline stays fixed while the photo is dragged / zoomed underneath;
// the part of the photo outside the frame shows as a faint ghost, everything
// else is dimmed. Changes stream through onFrame; the caller commits or rolls
// back the whole session (one undo step).
export function FramingOverlay({ item, props, natural, imageUrl, zoom, onFrame, onDone, onCancel }) {
  const id = useId().replace(/:/g, '')
  const box = useRef(null), drag = useRef(null), frame = useRef(0)
  const live = useRef({ offsetX: props.offsetX, offsetY: props.offsetY, zoom: props.zoom })
  const place = placement(item, props, natural)
  useEffect(() => { if (!drag.current) live.current = { offsetX: props.offsetX, offsetY: props.offsetY, zoom: props.zoom } }, [props.offsetX, props.offsetY, props.zoom])
  const push = patch => {
    const merged = { ...live.current, ...patch }
    live.current = { ...merged, ...limit(merged, item, props, place) }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => onFrame({ ...live.current }))
  }
  useEffect(() => { box.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  function down(event) {
    event.preventDefault(); event.stopPropagation()
    box.current.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, offsetX: live.current.offsetX, offsetY: live.current.offsetY }
  }
  function move(event) {
    if (!drag.current) return
    // Screen px → page px (÷ viewport zoom) → offset in frame widths.
    const dx = (event.clientX - drag.current.x) / zoom / item.width, dy = (event.clientY - drag.current.y) / zoom / item.height
    push({ offsetX: drag.current.offsetX + dx, offsetY: drag.current.offsetY + dy })
  }
  function up() { drag.current = null }
  useEffect(() => {
    const node = box.current
    const wheel = event => { event.preventDefault(); event.stopPropagation(); push({ zoom: clamp(live.current.zoom * Math.exp(-event.deltaY * 0.0015), 0.5, 4) }) }
    node?.addEventListener('wheel', wheel, { passive: false })
    return () => node?.removeEventListener('wheel', wheel)
  })
  function key(event) {
    const step = event.shiftKey ? 0.05 : 0.01
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key]) { event.preventDefault(); push({ offsetX: live.current.offsetX + moves[event.key][0], offsetY: live.current.offsetY + moves[event.key][1] }) }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); push({ zoom: clamp(live.current.zoom * 1.1, 0.5, 4) }) }
    else if (event.key === '-') { event.preventDefault(); push({ zoom: clamp(live.current.zoom / 1.1, 0.5, 4) }) }
    else if (event.key === 'Enter') { event.preventDefault(); onDone() }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() }
  }
  const stroke = 2 / zoom, d = maskPath(props.mask, item.width, item.height, props.radius)
  const fullCrop = props.crop.x === 0 && props.crop.y === 0 && props.crop.width === 1 && props.crop.height === 1
  const ghost = place && imageUrl && fullCrop ? (() => {
    const k = place.base * props.zoom, width = place.width * k, height = place.height * k
    const cx = item.width / 2 + props.offsetX * item.width, cy = item.height / 2 + props.offsetY * item.height
    return { x: cx - width / 2, y: cy - height / 2, width, height, transform: `rotate(${props.rotation} ${cx} ${cy}) translate(${cx} ${cy}) scale(${props.flipX ? -1 : 1} ${props.flipY ? -1 : 1}) translate(${-cx} ${-cy})` }
  })() : null
  return (
    <>
      {/* Clicking the dimmed page outside the frame finishes framing. */}
      <div aria-hidden className="absolute inset-0 z-10 cursor-default" onPointerDown={event => { event.stopPropagation(); onDone() }} />
      <div ref={box} role="application" tabIndex={0} aria-label="Encuadre de la foto. Arrastra o usa las flechas para mover la foto; + y − para acercar; Intro para terminar; Escape para cancelar."
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        className="absolute z-20 cursor-grab touch-none outline-none active:cursor-grabbing"
        style={{ left: item.x, top: item.y, width: item.width, height: item.height, transform: `rotate(${item.rotation ?? 0}deg)`, transformOrigin: 'top left',
          boxShadow: '0 0 0 100000px rgb(2 6 23 / 0.55)' }}>
        <svg viewBox={`0 0 ${item.width} ${item.height}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {ghost ? (
            <>
              <defs>
                <mask id={`outside-${id}`} maskUnits="userSpaceOnUse" x={-item.width * 20} y={-item.height * 20} width={item.width * 41} height={item.height * 41}>
                  <rect x={-item.width * 20} y={-item.height * 20} width={item.width * 41} height={item.height * 41} fill="#fff" />
                  <path d={d} fill="#000" />
                </mask>
              </defs>
              <g mask={`url(#outside-${id})`} opacity="0.4">
                <image href={imageUrl} x={ghost.x} y={ghost.y} width={ghost.width} height={ghost.height} preserveAspectRatio="none" transform={ghost.transform}
                  style={{ filter: adjustmentsCss(props.adjustments) }} />
              </g>
            </>
          ) : null}
          <path d={d} fill="none" stroke="#ffffff" strokeWidth={stroke * 3} strokeOpacity="0.35" />
          <path d={d} fill="none" stroke="#d946ef" strokeWidth={stroke} strokeDasharray={`${8 / zoom} ${6 / zoom}`} />
          {[1, 2].map(n => <line key={`v${n}`} x1={(item.width * n) / 3} x2={(item.width * n) / 3} y1="0" y2={item.height} stroke="#ffffff" strokeOpacity="0.35" strokeWidth={stroke / 2} />)}
          {[1, 2].map(n => <line key={`h${n}`} y1={(item.height * n) / 3} y2={(item.height * n) / 3} x1="0" x2={item.width} stroke="#ffffff" strokeOpacity="0.35" strokeWidth={stroke / 2} />)}
        </svg>
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white shadow-lg backdrop-blur"
          style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}>
          <Move className="h-3.5 w-3.5" aria-hidden />Arrastra para mover la foto
        </span>
      </div>
    </>
  )
}
