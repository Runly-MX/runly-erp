// In-memory drag registry for panel → canvas drag and drop. dataTransfer only
// carries a marker; the payload (with its insert function) stays here.
// payload = { kind: 'element' | 'photo', label, insert(point|null), fileAssetId? }
let current = null
const MARKER = 'application/x-runly-studio'

export function startStudioDrag(event, payload) {
  current = payload
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(MARKER, payload.kind)
  event.dataTransfer.setData('text/plain', payload.label ?? '')
}
export const endStudioDrag = () => { current = null }
export const peekStudioDrag = () => current
export function takeStudioDrag() { const payload = current; current = null; return payload }
export const isStudioDrag = event => [...(event.dataTransfer?.types ?? [])].includes(MARKER)

// Props for a draggable tile (desktop pointer; touch keeps tap-to-insert).
export function draggable(payload) {
  return { draggable: true, onDragStart: event => startStudioDrag(event, payload), onDragEnd: endStudioDrag }
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
