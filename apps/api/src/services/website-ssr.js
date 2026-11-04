import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

// Loads the server renderer built next to the public runtime (ssr.mjs + ssr.json) and pre-renders published pages.
// Any failure (missing build, render error) returns null and the page falls back to the client-rendered shell.
export function createWebsiteSsr({ folder, maxEntries = 200 } = {}) {
  let loaded
  const cache = new Map()
  async function load() {
    try {
      const meta = JSON.parse(await readFile(resolve(folder, 'ssr.json'), 'utf8'))
      const bytes = await readFile(resolve(folder, 'ssr.mjs'))
      if (createHash('sha256').update(bytes).digest('hex') !== meta.hash) return null
      const module = await import(`${pathToFileURL(resolve(folder, 'ssr.mjs')).href}?v=${meta.hash}`)
      return typeof module.renderPage === 'function' ? { entryHash: meta.entryHash, renderPage: module.renderPage } : null
    } catch { return null }
  }
  // Rendered HTML depends only on the immutable release and the route, so it is cached per (release, path).
  return async function render({ releaseId, path, entryHash, page, theme, config }) {
    loaded ??= load()
    const renderer = await loaded
    if (!renderer || renderer.entryHash !== entryHash) return null
    const key = `${releaseId}:${config?.apiUrl ?? ''}:${path}`
    if (cache.has(key)) return cache.get(key)
    let result = null
    try { result = renderer.renderPage({ page, theme, config }) } catch { result = null }
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value)
    cache.set(key, result)
    return result
  }
}
