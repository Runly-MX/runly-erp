// Pure helpers for SupabaseCanvasSync. Excalidraw stamps every element with a
// monotonically increasing integer `version` on each change; we broadcast only
// the elements whose version rose since the last broadcast.

export function versionMap(elements) {
  const m = new Map()
  for (const el of elements) {
    if (el && el.id != null) m.set(el.id, el.version ?? 0)
  }
  return m
}

// prevMap: Map<id, version> from the previous broadcast (or empty on first).
// Returns { changed: Element[], nextMap: Map }.
export function diffElements(prevMap, nextElements) {
  const changed = []
  const nextMap = new Map(prevMap)
  for (const el of nextElements) {
    if (!el || el.id == null) continue
    const prevV = prevMap.get(el.id)
    const v = el.version ?? 0
    if (prevV === undefined || v > prevV) {
      changed.push(el)
      nextMap.set(el.id, v)
    }
  }
  return { changed, nextMap }
}

// Only suppress a snapshot response if the received one covers every local
// version/tombstone AND the complete non-element metadata. Missing files,
// different layer order or equal-version conflicts still require a response.
export function coversSnapshot(incoming, local) {
  if (!incoming || !local || !Array.isArray(incoming.elements) || !Array.isArray(local.elements)) return false
  if ([...incoming.elements, ...local.elements].some(element => typeof element?.id !== 'string')) return false
  const versions = new Map(incoming.elements.map(element => [element.id, element]))
  if (!local.elements.every(element => {
    const other = versions.get(element.id)
    return other && (other.version > element.version || (other.version === element.version && other.versionNonce === element.versionNonce))
  })) return false
  if (JSON.stringify(incoming.layers ?? []) !== JSON.stringify(local.layers ?? [])) return false
  if (JSON.stringify(incoming.appState ?? {}) !== JSON.stringify(local.appState ?? {})) return false
  return Object.entries(local.files ?? {}).every(([id, file]) => JSON.stringify(incoming.files?.[id]) === JSON.stringify(file))
}

// Trailing throttle. The wrapped fn runs at most once per `ms`, always with the
// latest args, with a trailing call for the last burst.
export function throttle(fn, ms) {
  let last = 0
  let timer = null
  let lastArgs = null
  const throttled = (...args) => {
    lastArgs = args
    const now = Date.now()
    const wait = ms - (now - last)
    if (wait <= 0) {
      last = now
      fn(...lastArgs)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn(...lastArgs)
      }, wait)
    }
  }
  throttled.cancel = () => { clearTimeout(timer); timer = null; lastArgs = null; last = 0 }
  return throttled
}
