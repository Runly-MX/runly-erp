export const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : ''
export const httpsUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href.slice(0, 2048) : '' } catch { return '' } }
export const validDimensions = (width, height) => Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width * height <= 25_000_000
const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'", '&nbsp;': ' ' }
// Provider metadata (e.g. Commons "Artist") arrives as HTML; the credit line is plain text.
export const plain = (value, max = 200) => text(value, 2000).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, match => entities[match]).replace(/\s+/g, ' ').trim().slice(0, max)
export const normalizeText = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
