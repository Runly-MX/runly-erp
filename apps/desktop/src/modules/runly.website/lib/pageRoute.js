// Mirrors the server rules for page slugs/routes (validators.js + contracts §5)
// only to give instant feedback; the server remains the authority.

export function slugify(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function routeFromSlug(slug) {
  return slug ? `/${slug}` : '/'
}

export function validateRoute(routePath) {
  if (!routePath || !routePath.startsWith('/')) return 'La ruta debe empezar con /.'
  if (routePath.length > 512) return 'La ruta es demasiado larga.'
  if (/[\\?#%]/.test(routePath) || routePath.includes('..') || routePath.includes('//')) return 'La ruta contiene caracteres no permitidos.'
  if (routePath.split('/').filter(Boolean).length > 32) return 'La ruta tiene demasiados niveles.'
  return null
}

// Hostname slug rules from contracts §10: 3-50 chars [a-z0-9-], no edge hyphens.
export function validateHostSlug(slug) {
  if (!slug) return 'Escribe una dirección.'
  if (slug.length < 3 || slug.length > 50) return 'Usa entre 3 y 50 caracteres.'
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug)) return 'Solo letras minúsculas, números y guiones; sin guion al inicio o al final.'
  return null
}

export const PUBLIC_ROUTE_ROOT = '/app/m/runly.website'
export const sitePath = (siteId, section = '') => `${PUBLIC_ROUTE_ROOT}/sites/${siteId}${section ? `/${section}` : ''}`
export const postEditorPath = (siteId, postId) => (siteId ? sitePath(siteId, `blog/${postId}`) : `${PUBLIC_ROUTE_ROOT}/blog/${postId}/editor`)
export const editorPath = (siteId, pageId) => sitePath(siteId, `pages/${pageId}/editor`)
