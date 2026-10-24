// Spellcheck default per device: desktop on, touch off (the on-screen keyboard
// already autocorrects and the red underlines get in the way of the pen).
// `stored` is true | false | undefined (never chosen).
export function resolveSpellcheck(stored, isCoarse) {
  return typeof stored === 'boolean' ? stored : !isCoarse
}

export function parseStoredSpellcheck(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return undefined
}
