import { FILE_ID } from '../../../../../../shared/studio/document.js'
import { openverseLicense } from '../../../../../../shared/studio/licenses.js'
import { catalogUrl } from '../network.js'
import { httpsUrl, text, validDimensions } from './common.js'

// Openverse anonymous searches allow at most 20 results per page.
const PAGE_SIZE = 20
// Illustrations are a separate category; photos exclude them so each tab stays coherent.
const CATEGORIES = ['photograph', 'illustration', 'digitized_artwork']
export function openversePhoto(row) {
  const license = openverseLicense(row)
  if (!row || typeof row.id !== 'string' || !FILE_ID.test(row.id) || !license || !httpsUrl(row.foreign_landing_url)) return null
  try { catalogUrl(row.url, 'openverse'); catalogUrl(row.thumbnail, 'openverse') } catch { return null }
  if (!validDimensions(row.width, row.height)) return null
  return { provider: 'openverse', id: row.id, type: 'image', title: text(row.title) || 'Fotografía', author: text(row.creator) || 'Autor no indicado',
    license: license.id, licenseUrl: license.url, sourceUrl: httpsUrl(row.foreign_landing_url), attributionRequired: license.attributionRequired,
    width: row.width, height: row.height, available: true }
}
export const openverse = {
  id: 'openverse', label: 'Openverse', idPattern: FILE_ID, categories: CATEGORIES, ttl: 5 * 60000,
  enabled: () => true,
  async search({ q, page, category, json }) {
    // Only raster formats can be imported; skipping SVG/GIF avoids results that fail at insert time.
    const params = { q, page: String(page), page_size: String(PAGE_SIZE), license: 'cc0,pdm,by', license_type: 'commercial,modification', mature: 'false', extension: 'jpg,jpeg,png,webp' }
    if (CATEGORIES.includes(category)) params.category = category
    const response = await json(`https://api.openverse.org/v1/images/?${new URLSearchParams(params)}`)
    if (!Array.isArray(response?.results) || response.results.length > PAGE_SIZE) return null
    const originals = {}
    const data = response.results.flatMap(raw => {
      const resource = openversePhoto(raw)
      if (!resource) return []
      originals[resource.id] = { resource, originalUrl: raw.url, thumbnailUrl: raw.thumbnail }
      return [resource]
    })
    return { data, originals, hasNext: Number.isInteger(response.page_count) && page < response.page_count }
  },
  async resolve({ id, json }) {
    const raw = await json(`https://api.openverse.org/v1/images/${encodeURIComponent(id)}/`), resource = openversePhoto(raw)
    return resource?.id === id ? { resource, originalUrl: raw.url, thumbnailUrl: raw.thumbnail } : null
  },
}
