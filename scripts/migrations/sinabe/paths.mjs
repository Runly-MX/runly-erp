// Normalizes sinabe upload references to a canonical relative key such as
// `inventories/images/<file>` (relative to sinabe's backend/src/uploads/).
//
// The DB mixes formats: "uploads/inventories/...", "/uploads/resguardos/...",
// "src/uploads/...", absolute URLs ("https://host/api/uploads/..."), Windows
// backslashes and absolute Windows paths. Data URLs (base64 signatures) are not
// file references and normalize to null.

export const UPLOAD_ROOTS = ['inventories', 'projects', 'resguardos', 'signatures', 'profile', 'preferences']

export function normalizeUploadKey(raw) {
  if (raw == null) return null
  let value = String(raw).trim()
  if (!value || /^data:/i.test(value)) return null
  value = value.replace(/\\/g, '/')
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '') // scheme + host
  value = value.replace(/[?#].*$/, '')
  try { value = decodeURIComponent(value) } catch { /* keep raw on malformed escapes */ }
  const idx = value.toLowerCase().lastIndexOf('uploads/')
  if (idx >= 0) value = value.slice(idx + 'uploads/'.length)
  value = value.replace(/^[a-z]:\//i, '').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/').replace(/^\/+/, '')
  const segments = value.split('/')
  if (!value || segments.some((s) => s === '..' || s === '.' || s === '')) return null
  return value
}

// Coarse format bucket for census statistics (never includes the path itself).
export function classifyPathFormat(raw) {
  if (raw == null || String(raw).trim() === '') return 'vacio'
  const value = String(raw).trim()
  if (/^data:/i.test(value)) return 'data-url'
  if (value.includes('\\')) return /^[a-z]:\\/i.test(value) ? 'windows-absoluta' : 'barras-invertidas'
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return 'url-absoluta'
  if (/^\/api\/uploads\//i.test(value)) return 'api-uploads'
  if (/^\/uploads\//i.test(value)) return 'barra-uploads'
  if (/^uploads\//i.test(value)) return 'uploads-relativa'
  if (/^(\.\/)?src\/uploads\//i.test(value)) return 'src-uploads'
  if (/^\.\//.test(value)) return 'punto-barra'
  return 'otra'
}

// Folder bucket of a canonical key, e.g. "inventories/images".
export function keyFolder(key) {
  if (!key) return null
  const parts = key.split('/')
  if (parts[0] === 'inventories' && parts[1] === 'images' && parts[2] === 'thumbnails') return 'inventories/images/thumbnails'
  return parts.length > 2 ? parts.slice(0, 2).join('/') : parts.length === 2 ? parts[0] : '(raiz)'
}

export function keyExtension(key) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(key ?? '')
  return m ? m[1].toLowerCase() : '(sin-ext)'
}

export function isThumbnailKey(key) {
  return /(^|\/)thumbnails\//.test(key ?? '')
}
