import { validateDocument } from '../../../../../shared/studio/document.js'
import { applyOps, diffOps } from '../../../../../shared/studio/operations.js'

// Selective undo for a shared document: each entry keeps the forward and
// inverse operations of one local change. Undo applies the inverse on top of
// the current document, so changes made meanwhile by collaborators (folded in
// with `rebase`) are kept. Granularity is the object: undoing an edit restores
// that object's previous version.
export function createDocumentHistory(initial, { limit = 50, maxBytes = 8_000_000 } = {}) {
  let base = validateDocument(initial), past = [], future = []
  const size = entry => JSON.stringify(entry).length * 2
  function trim() {
    while (past.length + future.length > limit || [...past, ...future].reduce((n, entry) => n + size(entry), 0) > maxBytes) {
      if (past.length) past.shift()
      else if (future.length) future.shift()
      else break
    }
  }
  const travel = direction => {
    const entry = (direction === 'undo' ? past : future).at(-1)
    return entry ? validateDocument(applyOps(base, direction === 'undo' ? entry.inverse : entry.forward)) : null
  }
  return {
    commit(document) {
      const next = validateDocument(document), forward = diffOps(base, next)
      if (!forward.length) return false
      past.push({ forward, inverse: diffOps(next, base) }); base = next; future = []; trim(); return true
    },
    // Collaborators' changes: move the baseline without creating an entry.
    rebase(ops) { if (ops.length) base = validateDocument(applyOps(base, ops)) },
    peek(direction) { return travel(direction) },
    move(direction) {
      const next = travel(direction)
      if (!next) return null
      const from = direction === 'undo' ? past : future, to = direction === 'undo' ? future : past
      to.push(from.pop()); base = next; trim(); return next
    },
    state() { return { canUndo: past.length > 0, canRedo: future.length > 0, entries: past.length + future.length } },
  }
}
