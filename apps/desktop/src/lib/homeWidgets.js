// Pure helpers for the Home widget board (kept React-free for unit tests).
//
// Saved preference `home.widgets`:
//   { shown: [ids in board order], layout: { [id]: { w: 1-3, h: 1-2 } } }
// Home starts EMPTY: nothing is shown until the person adds it. Older preferences
// ({ hidden, order, size }) are read as before so nobody's board changes under them.

export const MAX_COLS = 3;
export const MAX_ROWS = 2;
const LEGACY_WIDTH = { sm: 1, md: 2, lg: 3 };

// Widgets whose module the user can open, in catalog order. A widget of a module the
// person cannot use is never offered, saved or not.
export function availableWidgets(catalog, availableModuleKeys) {
  const keys = new Set(availableModuleKeys);
  return catalog.filter((w) => keys.has(w.moduleKey));
}

// Ids to show, in board order, among the offered widgets.
// `defaultAll`: a board with nothing saved yet shows everything offered (Mi trabajo);
// Home passes false and starts empty.
export function resolveShown(pref, offeredIds, { defaultAll = false } = {}) {
  const offered = new Set(offeredIds);
  const value = pref ?? {};
  if (Array.isArray(value.shown)) return value.shown.filter((id, index) => offered.has(id) && value.shown.indexOf(id) === index);
  // Legacy: the person had customised (hidden/order): keep what they saw.
  if (Array.isArray(value.hidden) || Array.isArray(value.order)) {
    const hidden = new Set(value.hidden ?? []);
    const order = Array.isArray(value.order) ? value.order : [];
    const rank = new Map(order.map((id, index) => [id, index]));
    return [...offeredIds]
      .filter((id) => !hidden.has(id))
      .map((id, index) => ({ id, at: rank.has(id) ? rank.get(id) : order.length + index }))
      .sort((a, b) => a.at - b.at)
      .map(({ id }) => id);
  }
  return defaultAll ? [...offeredIds] : [];
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value) || min)));

export function sizeOf(pref, id) {
  const saved = pref?.layout?.[id];
  if (saved) return { w: clamp(saved.w, 1, MAX_COLS), h: clamp(saved.h, 1, MAX_ROWS) };
  return { w: LEGACY_WIDTH[pref?.size?.[id]] ?? 1, h: 1 };
}

export const withSize = (pref, id, size) => ({ ...(pref ?? {}), layout: { ...(pref?.layout ?? {}), [id]: { w: clamp(size.w, 1, MAX_COLS), h: clamp(size.h, 1, MAX_ROWS) } } });

// The saved list always carries the current shown order (migrating legacy values).
export const withShown = (pref, shown) => ({ ...(pref ?? {}), shown });

export function addWidget(shown, id) {
  return shown.includes(id) ? shown : [...shown, id];
}

export const removeWidget = (shown, id) => shown.filter((item) => item !== id);

export function moveWidget(shown, fromId, toId) {
  const from = shown.indexOf(fromId);
  const to = shown.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return shown;
  const next = [...shown];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Size from a pointer drag: how many cells the widget covers when its corner sits at
// `deltaX/deltaY` from where it started, given the width/height of one cell (gap included).
export function sizeFromDrag(start, delta, cell) {
  return {
    w: clamp(start.w + delta.x / cell.width, 1, MAX_COLS),
    h: clamp(start.h + delta.y / cell.height, 1, MAX_ROWS),
  };
}

// Keyboard resize: arrows change one cell.
export function sizeFromKey(size, key) {
  if (key === "ArrowRight") return { ...size, w: clamp(size.w + 1, 1, MAX_COLS) };
  if (key === "ArrowLeft") return { ...size, w: clamp(size.w - 1, 1, MAX_COLS) };
  if (key === "ArrowDown") return { ...size, h: clamp(size.h + 1, 1, MAX_ROWS) };
  if (key === "ArrowUp") return { ...size, h: clamp(size.h - 1, 1, MAX_ROWS) };
  return size;
}
