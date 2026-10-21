// Row selection with shift-click ranges, shared by the table, list and card views.
// Clicking a row's checkbox sets the anchor; shift-clicking another one applies the anchor's new state
// (checked or not) to every row between the two, in the order shown.

// -> next Set of selected ids. `ids` is the visible order, `anchorId` the last plain click (or null).
export function toggleWithRange({ selected, ids, id, anchorId = null, shift = false }) {
  const next = new Set(selected)
  const checking = !next.has(id)
  const from = anchorId == null ? -1 : ids.indexOf(anchorId)
  const to = ids.indexOf(id)
  const span = shift && from !== -1 && to !== -1 ? ids.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
  for (const key of span) {
    if (checking) next.add(key)
    else next.delete(key)
  }
  return next
}
