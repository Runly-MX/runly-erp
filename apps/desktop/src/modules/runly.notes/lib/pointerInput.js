// Once a stylus has touched a drawing surface, finger/palm contacts stop
// drawing (palm rejection). Before that, touch still draws so phones keep
// working. `touchDraws: false` forces pan/scroll for touch.
export function shouldDraw(event, { penSeen = false, touchDraws = true } = {}) {
  if (event.pointerType === 'touch') return touchDraws && !penSeen
  return true
}
