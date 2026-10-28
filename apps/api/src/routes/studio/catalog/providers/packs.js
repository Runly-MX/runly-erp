import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import sharp from 'sharp'
import { isStudioRaster } from '../../image-format.js'
import { normalizeText } from './common.js'

// Bundled illustration packs (e.g. CC0 collections). A pack is only served when its manifest declares an allowed
// license with verification evidence and every asset matches its SHA256 and passes strict validation. SVG art is
// never imported as geometry: it is rasterized to PNG on the server, so scripts, styles and references are inert.
const PACKS_DIR = new URL('../packs/', import.meta.url)
const PAGE_SIZE = 24, MAX_ASSET_BYTES = 2 * 1024 * 1024, MAX_ASSETS = 500
const LICENSES = { 'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/' }
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/, FILE = /^assets\/[a-z0-9][a-z0-9._-]{0,80}\.(svg|png|webp|jpe?g)$/
const MIME = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
export const PACK_ID = /^[a-z0-9][a-z0-9-]{0,40}:[a-z0-9][a-z0-9-]{0,60}$/

// Comments are inert and removed first (editors leave generator URLs in them). The SVG namespaces are the only
// external-looking strings allowed; everything active or referencing is rejected.
export function safeSvg(svg) {
  const stripped = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\sxmlns(?::[a-z]+)?\s*=\s*"http:\/\/www\.w3\.org\/[^"]*"/gi, '')
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(stripped)) return false
  return !/<!DOCTYPE|<!ENTITY|<script|<foreignObject|<iframe|<object|<embed|<audio|<video|<image|<use[\s>]|<style|<a[\s>]|\son[a-z]+\s*=|javascript:|data:|https?:|@import|url\(\s*["']?(?!#)/i.test(stripped)
}
async function loadPack(dir, name) {
  const manifest = JSON.parse(readFileSync(new URL(`${name}/manifest.json`, dir), 'utf8'))
  const { license } = manifest
  if (manifest.id !== name || !SLUG.test(name) || !LICENSES[license?.id] || license.url !== LICENSES[license.id] || !/^https:\/\//.test(license.evidenceUrl ?? '') ||
    !/^\d{4}-\d{2}-\d{2}$/.test(license.verifiedAt ?? '') || !/^https:\/\//.test(manifest.sourceUrl ?? '') || !manifest.author || !Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > MAX_ASSETS) throw new Error('manifest')
  const assets = new Map()
  for (const asset of manifest.assets) {
    if (!SLUG.test(asset.id) || !FILE.test(asset.file) || assets.has(`${name}:${asset.id}`)) throw new Error('asset')
    const url = new URL(`${name}/${asset.file}`, dir), extension = asset.file.split('.').pop().toLowerCase()
    if (statSync(url).size > MAX_ASSET_BYTES) throw new Error('size')
    const bytes = readFileSync(url)
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('hash')
    if (extension === 'svg' ? !safeSvg(bytes.toString('utf8')) : !isStudioRaster(bytes, MIME[extension])) throw new Error('content')
    const metadata = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata()
    const width = Math.round(metadata.width), height = Math.round(metadata.height)
    if (!(width >= 1 && height >= 1 && width * height <= 25_000_000)) throw new Error('dimensions')
    const resource = { provider: 'packs', id: `${name}:${asset.id}`, type: 'image', title: String(asset.title ?? asset.id).slice(0, 120), author: String(manifest.author).slice(0, 120),
      license: license.id, licenseUrl: license.url, sourceUrl: manifest.sourceUrl, attributionRequired: false, width, height, available: true }
    assets.set(resource.id, { resource, extension, url, text: normalizeText(`${asset.id} ${resource.title} ${(asset.tags ?? []).join(' ')} ${manifest.name ?? ''}`) })
  }
  return assets
}
// Invalid packs are skipped (never partially served); `rejected` feeds diagnostics without exposing paths.
export function createPacksProvider({ dir = PACKS_DIR } = {}) {
  let loaded
  const ready = () => loaded ??= (async () => {
    const assets = new Map(); let rejected = 0
    const names = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : []
    for (const name of names) { try { for (const [id, asset] of await loadPack(dir, name)) assets.set(id, asset) } catch { rejected++ } }
    return { assets, rejected }
  })()
  return {
    id: 'packs', label: 'Colecciones Runly', idPattern: PACK_ID, categories: [], ttl: 0, local: true,
    disabledReason: 'Sin colecciones instaladas',
    enabled: () => existsSync(dir) && readdirSync(dir, { withFileTypes: true }).some(entry => entry.isDirectory()),
    rejected: async () => (await ready()).rejected,
    async search({ q, page }) {
      const { assets } = await ready(), words = normalizeText(q).split(/\s+/).filter(Boolean)
      const rows = [...assets.values()].filter(asset => words.every(word => asset.text.includes(word)))
      const start = (page - 1) * PAGE_SIZE
      return { data: rows.slice(start, start + PAGE_SIZE).map(asset => asset.resource), originals: {}, hasNext: start + PAGE_SIZE < rows.length }
    },
    async resolve({ id }) {
      const asset = (await ready()).assets.get(id)
      if (!asset) return null
      const source = readFileSync(asset.url)
      const bytes = asset.extension === 'svg' ? await sharp(source, { density: 144, limitInputPixels: 25_000_000 }).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer() : source
      return { resource: asset.resource, local: { bytes, mime: asset.extension === 'svg' ? 'image/png' : MIME[asset.extension] } }
    },
  }
}
