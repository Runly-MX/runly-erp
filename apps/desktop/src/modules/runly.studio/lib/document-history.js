import { validateDocument } from '../../../../../shared/studio/document.js'

export function createDocumentHistory(initial, { limit = 50, maxBytes = 8_000_000 } = {}) {
  let current = JSON.stringify(validateDocument(initial)), past = [], future = []
  function trim() {
    while (past.length + future.length > limit || [...past, current, ...future].reduce((n, value) => n + value.length * 2, 0) > maxBytes) {
      if (past.length) past.shift()
      else if (future.length) future.shift()
      else break
    }
  }
  return {
    commit(document) {
      const value = JSON.stringify(validateDocument(document))
      if (value === current) return false
      past.push(current); current = value; future = []; trim(); return true
    },
    peek(direction) { const value = (direction === 'undo' ? past : future).at(-1); return value ? JSON.parse(value) : null },
    move(direction) {
      const from = direction === 'undo' ? past : future, to = direction === 'undo' ? future : past
      if (!from.length) return null
      to.push(current); current = from.pop(); trim(); return JSON.parse(current)
    },
    state() { return { canUndo: past.length > 0, canRedo: future.length > 0, entries: past.length + future.length } },
  }
}
