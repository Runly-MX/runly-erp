// Geometry of the automation canvas (pure, unit tested): where each block sits,
// how blocks are connected, how to fit the flow in the viewport and which
// insertion slot is closest to a point. Coordinates are canvas units; the
// view transform ({ x, y, k }) maps them to the screen.
//
// Blocks sit on a grid (horizontal or vertical preset) unless the person moved
// them: `positions` (id -> { x, y }) overrides the grid for those blocks, and the
// arrows pick the nearest sides of the two blocks they join.

export const NODE = Object.freeze({ width: 248, height: 92, gap: 96 });
export const VIEW_LIMITS = Object.freeze({ min: 0.4, max: 1.6 });
export const SNAP = 8;
const ADD_SIZE = 56;
const PAD = 56;

const OUT = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } };
const OPPOSITE = { right: "left", left: "right", bottom: "top", top: "bottom" };

const portPoint = (node, side) => {
  if (side === "right") return { x: node.x + node.width, y: node.y + node.height / 2 };
  if (side === "left") return { x: node.x, y: node.y + node.height / 2 };
  if (side === "bottom") return { x: node.x + node.width / 2, y: node.y + node.height };
  return { x: node.x + node.width / 2, y: node.y };
};

// Sides of `from` and `to` an arrow between them leaves and enters by.
export function connect(from, to) {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  const out = Math.abs(dx) * (NODE.height / NODE.width) >= Math.abs(dy)
    ? (dx >= 0 ? "right" : "left")
    : (dy >= 0 ? "bottom" : "top");
  const into = OPPOSITE[out];
  return { out, into, start: portPoint(from, out), end: portPoint(to, into) };
}

export const snap = (value) => Math.round(value / SNAP) * SNAP;

// nodes: [{ id, ... }]. `orientation` is the grid preset; `positions` the manual overrides.
export function layoutNodes(nodes, orientation = "horizontal", positions = {}) {
  const horizontal = orientation === "horizontal";
  const step = (horizontal ? NODE.width : NODE.height) + NODE.gap;
  const placed = nodes.map((node, index) => {
    const manual = positions[node.id];
    return {
      ...node,
      x: manual ? manual.x : horizontal ? index * step : 0,
      y: manual ? manual.y : horizontal ? 0 : index * step,
      width: NODE.width,
      height: NODE.height,
      ports: { in: null, out: null },
    };
  });
  const edges = placed.slice(0, -1).map((from, index) => {
    const to = placed[index + 1];
    const link = connect(from, to);
    from.ports.out = link.out;
    to.ports.in = link.into;
    return { id: `${from.id}>${to.id}`, from: from.id, to: to.id, ...link, mid: { x: (link.start.x + link.end.x) / 2, y: (link.start.y + link.end.y) / 2 }, toIndex: index + 1 };
  });

  // The closing "add" slot continues from the last block along the grid direction.
  const last = placed[placed.length - 1];
  let add = null;
  if (last) {
    const side = horizontal ? "right" : "bottom";
    const start = portPoint(last, side);
    const end = horizontal ? { x: start.x + NODE.gap, y: start.y } : { x: start.x, y: start.y + NODE.gap };
    add = {
      x: horizontal ? end.x : end.x - ADD_SIZE / 2,
      y: horizontal ? end.y - ADD_SIZE / 2 : end.y,
      width: ADD_SIZE,
      height: ADD_SIZE,
      edge: { start, end, out: side, into: OPPOSITE[side] },
    };
    last.ports.out = side;
  }
  const items = [...placed, ...(add ? [add] : [])];
  const left = Math.min(...items.map((item) => item.x), 0);
  const top = Math.min(...items.map((item) => item.y), 0) - PAD;
  const right = Math.max(...items.map((item) => item.x + item.width), NODE.width);
  const bottom = Math.max(...items.map((item) => item.y + item.height), NODE.height) + PAD;
  return { nodes: placed, edges, add, bounds: { x: left, y: top, width: right - left, height: bottom - top }, orientation };
}

// Cubic curve that leaves `start` along its side and arrives at `end` along its side.
export function edgePath({ start, end, out, into }) {
  const distance = Math.max(28, Math.hypot(end.x - start.x, end.y - start.y) / 2);
  const leave = OUT[out] ?? OUT.right;
  const arrive = OUT[into] ?? OUT.left;
  const c1 = { x: start.x + leave.x * distance, y: start.y + leave.y * distance };
  const c2 = { x: end.x + arrive.x * distance, y: end.y + arrive.y * distance };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
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
  if (bounds.height > bounds.width) return { k, x: (viewport.width - bounds.width * k) / 2 - bounds.x * k, y: 72 - (bounds.y + PAD) * k };
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
