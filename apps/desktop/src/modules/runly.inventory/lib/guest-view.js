// The public route is /app/p/inventory/:token, so the portal's own pages live in the URL hash:
//   (empty) -> list, #/nuevo -> new item, #/item/:id -> detail, #/item/:id/editar -> edit.
export function parsePortalHash(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'nuevo') return { view: 'new', id: null }
  if (parts[0] === 'item' && parts[1]) return { view: parts[2] === 'editar' ? 'edit' : 'detail', id: parts[1] }
  return { view: 'list', id: null }
}

export function portalHash(view, id = null) {
  if (view === 'new') return '#/nuevo'
  if (view === 'detail' && id) return `#/item/${encodeURIComponent(id)}`
  if (view === 'edit' && id) return `#/item/${encodeURIComponent(id)}/editar`
  return ''
}
