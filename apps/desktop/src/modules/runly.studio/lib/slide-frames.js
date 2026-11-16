// Presentation frames: each slide is rasterized once at stage resolution by the
// editor's own export path (auxiliary renderer queue, fresh image authorization,
// the same pixels as PNG export). Phase 2 swaps this source for a motion renderer
// that draws sceneAt(document, page, t); the player only calls frame(pageId).
const CACHE = 4 // previous, current, next and the one being prefetched
const MIN_SCALE = 0.25, MAX_SCALE = 4 // exportDimensions accepts 0.25–8

export function frameScale(page, stage, pixelRatio = 1) {
  // The slide fills the stage (small pages scale up), rendered at device pixels.
  const fit = Math.min(stage.width / page.width, stage.height / page.height)
  return Math.max(MIN_SCALE, Math.min(fit * Math.min(2, Math.max(1, pixelRatio)), MAX_SCALE))
}

export function createSlideFrames({ editor, document, pages, stage, pixelRatio = globalThis.devicePixelRatio ?? 1 }) {
  const controller = new AbortController(), cache = new Map()
  const byId = new Map(pages.map(scene => [scene.page.id, scene.page]))
  function evict() {
    while (cache.size > CACHE) {
      const [id, entry] = cache.entries().next().value
      cache.delete(id)
      entry.then(url => URL.revokeObjectURL(url)).catch(() => {})
    }
  }
  // Resolves an object URL; rejects with the editor's error (changed design, missing image, abort).
  function frame(id) {
    if (cache.has(id)) {
      const entry = cache.get(id)
      cache.delete(id); cache.set(id, entry)
      return entry
    }
    const page = byId.get(id)
    if (!page) return Promise.reject(new Error('La página ya no existe.'))
    const entry = editor.exportPage(id, 'png', 1, document, { scale: frameScale(page, stage, pixelRatio), signal: controller.signal })
      .then(blob => {
        if (controller.signal.aborted) throw new DOMException('Presentación cerrada.', 'AbortError')
        return URL.createObjectURL(blob)
      })
    entry.catch(() => { if (cache.get(id) === entry) cache.delete(id) })
    cache.set(id, entry)
    evict()
    return entry
  }
  return {
    frame,
    // Neighbours are requested after the current slide so it renders first.
    prefetch(ids) { for (const id of ids) if (id) frame(id).catch(() => {}) },
    destroy() {
      controller.abort()
      for (const entry of cache.values()) entry.then(url => URL.revokeObjectURL(url)).catch(() => {})
      cache.clear()
    },
  }
}
