import { catalogUrl } from '../network.js'
import { looksSpanish } from '../icon-synonyms.js'
import { httpsUrl, plain, text, validDimensions } from './common.js'

// Pixabay stays disabled until PIXABAY_API_KEY is configured. Its terms require caching API responses for
// 24 hours, a budget of 100 requests/minute/key and no permanent hotlinking: previews are proxied through the
// API and originals are copied into Files only when a user imports them.
const PAGE_SIZE = 20, KINDS = { photograph: 'photo', illustration: 'illustration' }
const LICENSE = { id: 'Pixabay-Content-License', url: 'https://pixabay.com/service/license-summary/' }
export function pixabayImage(row) {
  if (!row || !Number.isInteger(row.id) || row.id < 1) return null
  const source = httpsUrl(row.pageURL)
  if (!source || new URL(source).hostname !== 'pixabay.com' || !validDimensions(row.imageWidth, row.imageHeight)) return null
  try { catalogUrl(row.largeImageURL, 'pixabay'); catalogUrl(row.webformatURL, 'pixabay') } catch { return null }
  const title = plain(text(row.tags, 400).split(',')[0], 120)
  return { provider: 'pixabay', id: String(row.id), type: 'image', title: title ? title[0].toUpperCase() + title.slice(1) : 'Imagen', author: plain(row.user, 120) || 'Autor no indicado',
    license: LICENSE.id, licenseUrl: LICENSE.url, sourceUrl: source, attributionRequired: false, width: row.imageWidth, height: row.imageHeight, available: true }
}
const entry = (row, resource) => ({ resource, originalUrl: row.largeImageURL, thumbnailUrl: row.webformatURL })
export const pixabay = {
  id: 'pixabay', label: 'Pixabay', idPattern: /^[1-9]\d{0,11}$/, categories: ['photograph', 'illustration'], ttl: 24 * 3600000, quota: 90, credentialed: true, disabledReason: 'Sin clave de API configurada',
  enabled: env => Boolean(env.PIXABAY_API_KEY),
  async search({ q, page, category, json, env }) {
    const params = new URLSearchParams({ key: env.PIXABAY_API_KEY, q, page: String(page), per_page: String(PAGE_SIZE), image_type: KINDS[category] ?? 'photo', safesearch: 'true', lang: looksSpanish(q) ? 'es' : 'en' })
    const response = await json(`https://pixabay.com/api/?${params}`)
    if (!Array.isArray(response?.hits) || response.hits.length > PAGE_SIZE) return null
    const originals = {}
    const data = response.hits.flatMap(row => {
      const resource = pixabayImage(row)
      if (!resource) return []
      originals[resource.id] = entry(row, resource)
      return [resource]
    })
    return { data, originals, hasNext: Number.isInteger(response.totalHits) && page * PAGE_SIZE < Math.min(response.totalHits, 500) }
  },
  async resolve({ id, json, env }) {
    const response = await json(`https://pixabay.com/api/?${new URLSearchParams({ key: env.PIXABAY_API_KEY, id })}`)
    const row = response?.hits?.length === 1 ? response.hits[0] : null, resource = pixabayImage(row)
    return resource?.id === id ? entry(row, resource) : null
  },
}
