// Geometry of the automation canvas (pure, unit tested): where each node sits,
// how nodes are connected, how to fit the flow in the viewport and which
// insertion slot is closest to a point. Coordinates are canvas units; the
// view transform ({ x, y, k }) maps them to the screen.

export const NODE = Object.freeze({ width: 248, height: 92, gap: 96 });
export const VIEW_LIMITS = Object.freeze({ min: 0.4, max: 1.6 });
const ADD_SIZE = 56;

// nodes: [{ id, ... }]. Returns positions, edges between neighbours and the end "add" slot.
export function layoutNodes(nodes, orientation = "horizontal") {
  const horizontal = orientation === "horizontal";
  const step = (horizontal ? NODE.width : NODE.height) + NODE.gap;
  const placed = nodes.map((node, index) => ({ ...node, x: horizontal ? index * step : 0, y: horizontal ? 0 : index * step, width: NODE.width, height: NODE.height }));
  const edges = placed.slice(0, -1).map((from, index) => {
    const to = placed[index + 1];
    const start = horizontal ? { x: from.x + from.width, y: from.y + from.height / 2 } : { x: from.x + from.width / 2, y: from.y + from.height };
    const end = horizontal ? { x: to.x, y: to.y + to.height / 2 } : { x: to.x + to.width / 2, y: to.y };
    return { id: `${from.id}>${to.id}`, from: from.id, to: to.id, start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, toIndex: index + 1 };
  });
  const last = placed[placed.length - 1];
  const tail = last
    ? horizontal
      ? { start: { x: last.x + last.width, y: last.y + last.height / 2 }, end: { x: last.x + last.width + NODE.gap, y: last.y + last.height / 2 } }
      : { start: { x: last.x + last.width / 2, y: last.y + last.height }, end: { x: last.x + last.width / 2, y: last.y + last.height + NODE.gap } }
    : null;
  const add = tail
    ? { x: horizontal ? tail.end.x : tail.end.x - ADD_SIZE / 2, y: horizontal ? tail.end.y - ADD_SIZE / 2 : tail.end.y, width: ADD_SIZE, height: ADD_SIZE, edge: tail }
    : null;
  const right = add ? add.x + add.width : 0;
  const bottom = add ? add.y + add.height : 0;
  const bounds = { x: 0, y: horizontal ? -ADD_SIZE : 0, width: Math.max(right, NODE.width), height: horizontal ? NODE.height + ADD_SIZE * 2 : Math.max(bottom, NODE.height) };
  return { nodes: placed, edges, add, bounds, orientation };
}

// Curve between two ports (straight when aligned, a soft S otherwise).
export function edgePath({ start, end }, orientation = "horizontal") {
  if (orientation === "horizontal") {
    const dx = Math.max(24, Math.abs(end.x - start.x) / 2);
    return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
  }
  const dy = Math.max(24, Math.abs(end.y - start.y) / 2);
  return `M ${start.x} ${start.y} C ${start.x} ${start.y + dy}, ${end.x} ${end.y - dy}, ${end.x} ${end.y}`;
}

export const clampScale = (k) => Math.min(VIEW_LIMITS.max, Math.max(VIEW_LIMITS.min, k));

// View that shows `bounds` centred in a viewport, never zoomed in past 1.
export function fitView(bounds, viewport, margin = 56) {
  const availableWidth = Math.max(viewport.width - margin * 2, 40);
  const availableHeight = Math.max(viewport.height - margin * 2, 40);
  const k = clampScale(Math.min(1, availableWidth / bounds.width, availableHeight / bounds.height));
  return {
    k,
    x: (viewport.width - bounds.width * k) / 2 - bounds.x * k,
    y: (viewport.height - bounds.height * k) / 2 - bounds.y * k,
  };
}

// Opening view: the whole flow when it fits at a readable size (>= 70%), otherwise
// the beginning of the flow at 85% so text stays legible; the person pans from there
// ("Ajustar" shows everything at any size).
export function startView(bounds, viewport, margin = 56) {
  const whole = fitView(bounds, viewport, margin);
  if (whole.k >= 0.7) return whole;
  const k = 0.85;
  // A tall (vertical) flow starts at its top, below the floating controls; a wide one at its left.
  if (bounds.height > bounds.width) return { k, x: (viewport.width - bounds.width * k) / 2 - bounds.x * k, y: 72 - bounds.y * k };
  return { k, x: margin - bounds.x * k, y: (viewport.height - bounds.height * k) / 2 - bounds.y * k };
}

// Zoom keeping the canvas point under `anchor` (viewport coordinates) fixed.
export function zoomAt(view, nextScale, anchor) {
  const k = clampScale(nextScale);
  const ratio = k / view.k;
  return { k, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export const toCanvas = (view, point) => ({ x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k });

// Closest insertion slot to a canvas point: [{ index, point }] -> nearest within `reach`.
export function nearestSlot(slots, point, reach = 160) {
  let best = null;
  for (const slot of slots) {
    const distance = Math.hypot(slot.point.x - point.x, slot.point.y - point.y);
    if (distance <= reach && (!best || distance < best.distance)) best = { index: slot.index, distance };
  }
  return best;
}

// Where a dragged step would land: how many other steps lie before the pointer along the flow axis.
export function dropIndex(centres, draggedIndex, pointerCoordinate) {
  return centres.filter((centre, index) => index !== draggedIndex && centre < pointerCoordinate).length;
}
