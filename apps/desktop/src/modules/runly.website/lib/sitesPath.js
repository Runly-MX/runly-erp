// Maps a pathname under the module to a view.
export function parseSitesPath(pathname) {
  const match = pathname.match(/\/sites(?:\/([^/]+))?(?:\/(.*?))?\/?$/)
  if (!match) return { view: 'list' }
  const [, first, rest = ''] = match
  if (!first) return { view: 'list' }
  if (first === 'new') return { view: 'new' }
  const editor = rest.match(/^pages\/([^/]+)\/editor$/)
  if (editor) return { view: 'editor', siteId: first, pageId: editor[1] }
  return { view: 'workspace', siteId: first, section: rest.split('/')[0] || 'overview' }
}
