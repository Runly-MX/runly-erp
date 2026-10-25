// Pure helpers for the Home widget board (kept React-free for unit tests).

// Widgets whose module the user can open, in catalog order.
export function availableWidgets(catalog, availableModuleKeys) {
  const keys = new Set(availableModuleKeys);
  return catalog.filter((w) => keys.has(w.moduleKey));
}

export function visibleWidgets(catalog, availableModuleKeys, hidden = []) {
  const hiddenSet = new Set(hidden);
  return availableWidgets(catalog, availableModuleKeys).filter((w) => !hiddenSet.has(w.id));
}

export const WIDGET_SIZES = Object.freeze(["sm", "md", "lg"]);
export const SIZE_LABELS = Object.freeze({ sm: "Normal", md: "Ancho", lg: "Completo" });

// Widgets in the person's order; ones they never placed (new widgets) keep their
// catalog position after the placed ones.
export function orderWidgets(widgets, order = []) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return widgets
    .map((widget, index) => ({ widget, index }))
    .sort((a, b) => (rank.has(a.widget.id) ? rank.get(a.widget.id) : order.length + a.index) - (rank.has(b.widget.id) ? rank.get(b.widget.id) : order.length + b.index))
    .map(({ widget }) => widget);
}

// Moves `id` one place within the full visible order. `ids` is the order shown now.
export function moveInOrder(ids, id, delta) {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

export const nextSize = (size) => WIDGET_SIZES[(Math.max(0, WIDGET_SIZES.indexOf(size)) + 1) % WIDGET_SIZES.length];

export function toggleHidden(hidden = [], id) {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}
