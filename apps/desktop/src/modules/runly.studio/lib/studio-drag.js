// Panel → canvas drag and drop. Mouse uses native HTML5 drag (dataTransfer
// only carries a marker; the payload with its insert function stays here).
// Touch has no usable HTML5 drag, so a short press "lifts" the tile into a
// floating ghost that follows the finger and drops on registered zones.
// payload = { kind: 'element' | 'photo', label, insert(point|null), fileAssetId?, size?: {width,height} }
let current = null
const MARKER = 'application/x-runly-studio'
const zones = new Set(), watchers = new Set()

export const peekStudioDrag = () => current
export function takeStudioDrag() { const payload = current; current = null; return payload }
export const endStudioDrag = () => { current = null }
export const isStudioDrag = event => [...(event.dataTransfer?.types ?? [])].includes(MARKER)

// A drop zone receives { clientX, clientY } points from touch drags:
// { element, over(point), leave(), drop(point) }.
export function registerDropZone(zone) { zones.add(zone); return () => zones.delete(zone) }
// UI that must step aside during a touch drag (the phone panel sheet).
export function watchTouchDrag(listener) { watchers.add(listener); return () => watchers.delete(listener) }

// Lifted copy of the tile: same visual, slightly larger, with a shadow.
function ghostOf(tile) {
  const rect = tile.getBoundingClientRect(), ghost = tile.cloneNode(true)
  ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true')
  Object.assign(ghost.style, { position: 'fixed', left: '0', top: '0', width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', zIndex: '9999',
    pointerEvents: 'none', borderRadius: '14px', boxShadow: '0 18px 40px -12px rgb(0 0 0 / 0.45), 0 0 0 2px #d946ef', opacity: '0.95',
    background: 'hsl(var(--card))', transition: 'none' })
  return { ghost, width: rect.width, height: rect.height }
}

export function startStudioDrag(event, payload) {
  current = payload
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(MARKER, payload.kind)
  event.dataTransfer.setData('text/plain', payload.label ?? '')
  // Custom drag image: the tile itself as a lifted card instead of the browser's faded button.
  const tile = event.currentTarget
  if (tile && event.dataTransfer.setDragImage) {
    const { ghost, width, height } = ghostOf(tile)
    Object.assign(ghost.style, { left: '-10000px', top: '-10000px', transform: 'rotate(-3deg)' })
    document.body.appendChild(ghost)
    event.dataTransfer.setDragImage(ghost, width / 2, height / 2)
    setTimeout(() => ghost.remove(), 0)
  }
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const zoneAt = point => [...zones].find(zone => {
  const rect = zone.element?.getBoundingClientRect()
  return rect && point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom
})

function touchDrag(event, payload) {
  if (event.touches.length !== 1) return
  const tile = event.currentTarget, start = event.touches[0]
  let lifted = null, hovered = null, last = { clientX: start.clientX, clientY: start.clientY }
  // The card floats above the finger so the landing outline under it stays visible.
  const place = point => { lifted.ghost.style.transform = `translate(${point.clientX - lifted.width / 2}px, ${point.clientY - lifted.height - 28}px) scale(1.08) rotate(-3deg)` }
  // Listeners stay on the tile: touch events keep targeting it even if the panel hides or unmounts it.
  const cleanup = () => {
    clearTimeout(timer)
    tile.removeEventListener('touchmove', move); tile.removeEventListener('touchend', end); tile.removeEventListener('touchcancel', cancel)
    if (lifted) { lifted.ghost.remove(); hovered?.leave(); current = null; watchers.forEach(listener => listener(false)) }
  }
  const lift = () => {
    lifted = ghostOf(tile); current = payload
    if (!reduced()) lifted.ghost.style.transition = 'transform 40ms linear'
    document.body.appendChild(lifted.ghost); place(last)
    navigator.vibrate?.(8)
    watchers.forEach(listener => listener(true))
  }
  const timer = setTimeout(lift, 220)
  function move(e) {
    const touch = e.touches[0]
    last = { clientX: touch.clientX, clientY: touch.clientY }
    // Moving before the press completes is a scroll of the panel, not a drag.
    if (!lifted) { if (Math.hypot(touch.clientX - start.clientX, touch.clientY - start.clientY) > 8) cleanup(); return }
    e.preventDefault(); place(last)
    const zone = zoneAt(last)
    if (zone !== hovered) hovered?.leave()
    hovered = zone ?? null; hovered?.over(last)
  }
  function end(e) {
    if (lifted) {
      e.preventDefault() // no synthetic click: the drag already decided what happens
      const zone = zoneAt(last)
      if (zone) zone.drop(last, payload)
    }
    cleanup()
  }
  function cancel() { cleanup() }
  tile.addEventListener('touchmove', move, { passive: false })
  tile.addEventListener('touchend', end, { passive: false })
  tile.addEventListener('touchcancel', cancel)
}

// Props for a draggable tile: native drag for mouse/pen, press-and-drag for touch.
// Tiles also need `select-none [-webkit-touch-callout:none]` so a long press lifts them.
export function draggable(payload) {
  return { draggable: true, onDragStart: event => startStudioDrag(event, payload), onDragEnd: endStudioDrag,
    onTouchStart: event => touchDrag(event, payload),
    // Long press must lift the tile, not open the system menu or select text.
    onContextMenu: event => { if (current) event.preventDefault() } }
}

// Topmost visible, unlocked object under a document point (rotation-aware;
// objects rotate around their top-left corner).
export function hitTest(objects, point, accept = () => true) {
  for (const object of [...objects].reverse()) {
    if (object.hidden || object.locked || !accept(object)) continue
    const angle = -(object.rotation ?? 0) * Math.PI / 180, dx = point.x - object.x, dy = point.y - object.y
    const u = dx * Math.cos(angle) - dy * Math.sin(angle), v = dx * Math.sin(angle) + dy * Math.cos(angle)
    const width = object.width * (object.type === 'text' ? object.scaleX ?? 1 : 1), height = object.height * (object.type === 'text' ? object.scaleY ?? 1 : 1)
    if (u >= 0 && v >= 0 && u <= width && v <= height) return object
  }
  return null
}
