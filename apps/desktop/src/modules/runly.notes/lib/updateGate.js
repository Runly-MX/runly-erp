import * as Y from 'yjs'

// Holds inbound remote Y.js updates while an IME / handwriting composition is
// active. y-prosemirror re-renders the touched range when a remote update is
// applied, which replaces the composing text node and makes Samsung
// handwriting-to-text (and Android IMEs) lose or rewrite what was just
// written. Updates are CRDT-commutative, so delaying them is safe.
export function createUpdateGate(apply, { maxHoldMs = 8000 } = {}) {
  let composing = false
  let queue = []
  let timer = null

  function flush() {
    clearTimeout(timer)
    timer = null
    if (queue.length === 0) return
    const merged = queue.length === 1 ? queue[0] : Y.mergeUpdates(queue)
    queue = []
    apply(merged)
  }

  return {
    get composing() { return composing },
    push(update) {
      if (composing) queue.push(update)
      else apply(update)
    },
    setComposing(flag) {
      const next = Boolean(flag)
      if (next === composing) return
      composing = next
      if (composing) {
        clearTimeout(timer)
        timer = setTimeout(() => {
          composing = false
          flush()
        }, maxHoldMs)
      } else {
        flush()
      }
    },
    destroy() {
      clearTimeout(timer)
      timer = null
      queue = []
      composing = false
    },
  }
}
