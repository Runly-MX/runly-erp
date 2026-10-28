import { catalogUrl } from '../network.js'
import { httpsUrl, plain, validDimensions } from './common.js'

// Wikimedia Commons through the official MediaWiki API (no scraping). Only CC0, public domain and CC BY are
// accepted; SA, ND, NC, GFDL and unknown terms are dropped. Commons asks API clients to identify themselves.
const PAGE_SIZE = 20, MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const API = 'https://commons.wikimedia.org/w/api.php'
const PROPS = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '320', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|Copyrighted|ObjectName' }
export function wikimediaLicense(meta) {
  const name = String(meta?.LicenseShortName?.value ?? '').trim(), url = String(meta?.LicenseUrl?.value ?? '')
  const by = /^CC[ -]BY[ -](1\.0|2\.0|2\.5|3\.0|4\.0)$/i.exec(name)
  if (by) {
    const base = `/licenses/by/${by[1]}/`
    try { const actual = new URL(url); if (actual.hostname !== 'creativecommons.org' || !`${actual.pathname}/`.startsWith(base)) return null } catch { if (url) return null }
    return { id: `CC-BY-${by[1]}`, url: `https://creativecommons.org${base}`, attributionRequired: true }
  }
  if (/^CC0( 1\.0)?$/i.test(name)) return { id: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', attributionRequired: false }
  if (/^(public domain|pd)$/i.test(name) && String(meta?.Copyrighted?.value ?? '').toLowerCase() === 'false') return { id: 'Public-Domain', url: 'https://commons.wikimedia.org/wiki/Commons:Copyright_tags', attributionRequired: false }
  return null
}
export function wikimediaImage(page) {
  const info = page?.imageinfo?.[0], license = wikimediaLicense(info?.extmetadata)
  if (!license || !Number.isInteger(page?.pageid) || page.pageid < 1 || !info || !MIMES.has(info.mime) || !validDimensions(info.width, info.height)) return null
  try { catalogUrl(info.url, 'wikimedia'); catalogUrl(info.thumburl, 'wikimedia') } catch { return null }
  const source = httpsUrl(info.descriptionurl)
  if (!source || new URL(source).hostname !== 'commons.wikimedia.org') return null
  const meta = info.extmetadata ?? {}, title = plain(meta.ObjectName?.value) || String(page.title ?? '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '')
  return { provider: 'wikimedia', id: String(page.pageid), type: 'image', title: title || 'Imagen', author: plain(meta.Artist?.value) || plain(meta.Credit?.value) || 'Autor no indicado',
    license: license.id, licenseUrl: license.url, sourceUrl: source, attributionRequired: license.attributionRequired, width: info.width, height: info.height, available: true }
}
const entry = (row, resource) => ({ resource, originalUrl: row.imageinfo[0].url, thumbnailUrl: row.imageinfo[0].thumburl })
export const wikimedia = {
  id: 'wikimedia', label: 'Wikimedia Commons', idPattern: /^[1-9]\d{0,11}$/, categories: [], ttl: 10 * 60000,
  userAgent: process.env.STUDIO_CATALOG_USER_AGENT || 'RunlyStudio/1.0 (https://runly.mx; soporte@runly.mx)',
  enabled: () => true,
  async search({ q, page, json }) {
    const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(PAGE_SIZE), gsroffset: String((page - 1) * PAGE_SIZE), ...PROPS })
    const response = await json(`${API}?${params}`)
    // An empty search answers {batchcomplete:true}; anything else without `query` is not a MediaWiki answer.
    if (!response || typeof response !== 'object' || !('query' in response) && response.batchcomplete !== true) return null
    const pages = response.query?.pages ?? []
    if (!Array.isArray(pages) || pages.length > PAGE_SIZE) return null
    const originals = {}
    const data = [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).flatMap(row => {
      const resource = wikimediaImage(row)
      if (!resource) return []
      originals[resource.id] = entry(row, resource)
      return [resource]
    })
    return { data, originals, hasNext: Number.isInteger(response?.continue?.gsroffset) }
  },
  async resolve({ id, json }) {
    const response = await json(`${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', pageids: id, ...PROPS })}`)
    const row = response?.query?.pages?.[0], resource = wikimediaImage(row)
    return resource?.id === id ? entry(row, resource) : null
  },
}
