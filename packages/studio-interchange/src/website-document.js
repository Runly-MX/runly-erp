// Portable sections and Atlas Page schema 1 are two representations of the same tree.
// IDs here identify editor nodes, never database rows. No renderer or code comes from a ZIP.
export function sectionsToAtlasPage({ sections, path, title }, { id = 'template-page' } = {}) {
  const blocks = {}, active = new Set()
  let count = 0
  function visit(section, depth) {
    if (!section || typeof section !== 'object' || active.has(section) || depth > 6 || ++count > 300) throw new TypeError('INVALID_SECTION_TREE')
    active.add(section)
    const key = `block-${count}`, children = {}
    for (const [slot, nodes] of Object.entries(section.children ?? {})) {
      if (!Array.isArray(nodes)) throw new TypeError('INVALID_SECTION_SLOT')
      children[slot] = nodes.map(node => visit(node, depth + 1))
    }
    blocks[key] = { id: key, type: section.type, props: structuredClone(section.props ?? {}), ...(Object.keys(children).length ? { children } : {}) }
    active.delete(section)
    return key
  }
  return { schemaVersion: 1, id, slug: path, title, visibility: 'public', regions: { main: { id: 'main', children: sections.map(s => visit(s, 1)) } }, blocks, seo: {} }
}

export function atlasPageToSections(page) {
  if (page?.schemaVersion !== 1 || page.visibility !== 'public' || Object.keys(page).some(key => !['schemaVersion', 'id', 'slug', 'title', 'visibility', 'regions', 'blocks', 'seo', 'updatedAt'].includes(key)) || Object.keys(page.regions ?? {}).join() !== 'main' || !page.blocks || Object.keys(page.seo ?? {}).length) throw new TypeError('PAGE_NOT_PORTABLE')
  if (Object.keys(page.regions.main).some(key => !['id', 'children'].includes(key))) throw new TypeError('REGION_NOT_PORTABLE')
  const seen = new Set()
  function visit(id, depth) {
    const block = page.blocks[id]
    if (!block || block.id !== id || seen.has(id) || depth > 6 || seen.size >= 300) throw new TypeError('INVALID_ATLAS_TREE')
    if (Object.keys(block).some(key => !['id', 'type', 'props', 'children'].includes(key))) throw new TypeError('BLOCK_NOT_PORTABLE')
    seen.add(id)
    const children = {}
    for (const [slot, ids] of Object.entries(block.children ?? {})) {
      if (!Array.isArray(ids)) throw new TypeError('INVALID_ATLAS_SLOT')
      children[slot] = ids.map(child => visit(child, depth + 1))
    }
    return { type: block.type, props: structuredClone(block.props ?? {}), ...(Object.keys(children).length ? { children } : {}) }
  }
  const sections = page.regions.main.children.map(id => visit(id, 1))
  if (seen.size !== Object.keys(page.blocks).length) throw new TypeError('ORPHAN_ATLAS_BLOCK')
  return { path: page.slug, title: page.title, sections }
}

// Only catalog-typed image positions are remapped; text that resembles an asset is preserved.
export function mapWebsiteImages(page, catalog, resolve) {
  const mapped = structuredClone(page), definitions = new Map(catalog.blocks.map(b => [b.type, b]))
  for (const block of Object.values(mapped.blocks)) {
    const definition = definitions.get(block.type)
    if (!definition) throw new TypeError('UNKNOWN_BLOCK')
    for (const [key, value] of Object.entries(block.props ?? {})) {
      const field = definition.fields[key]
      if (field?.type === 'image' && value) block.props[key] = resolve(value)
      if (field?.type === 'background' && value?.kind === 'image' && value.url) block.props[key] = { ...value, url: resolve(value.url) }
    }
  }
  return mapped
}

export function websiteThemeToAtlasTokens(theme = {}) {
  return { ...(theme.colors ? { color: structuredClone(theme.colors) } : {}), ...(theme.fonts ? { font: { ...(theme.fonts.body ? { sans: theme.fonts.body } : {}), ...(theme.fonts.heading ? { heading: theme.fonts.heading } : {}) } } : {}), ...(theme.radius === undefined ? {} : { radius: { sm: `${theme.radius}px`, md: `${theme.radius}px`, lg: `${theme.radius}px` } }), ...(theme.spacing === undefined ? {} : { spacing: Object.fromEntries([0, 1, 2, 3, 4, 6, 8, 12, 16].map(n => [n, `${n * theme.spacing}px`])) }) }
}
