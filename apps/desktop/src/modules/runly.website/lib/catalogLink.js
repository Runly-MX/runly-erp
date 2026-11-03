// Pure helpers for the Website <-> Catalog link. Catalog owns products; Website
// only reads them and (through Catalog's own publish command) toggles the web
// visibility flag. Nothing here duplicates product data.

// Which pages of a site reference which products. `drafts` is
// [{ page, document }]. A ProductCardBlock names one product (id or slug); a
// ProductsGridBlock lists by category (empty slug = every published product).
export function scanProductUsage(drafts, products) {
  const byKey = new Map()
  for (const product of products) {
    byKey.set(String(product.id), product.id)
    if (product.slug) byKey.set(String(product.slug), product.id)
  }
  const cards = new Map()
  const grids = []
  for (const { page, document } of drafts) {
    for (const block of Object.values(document?.blocks ?? {})) {
      if (block?.type === 'ProductCardBlock') {
        const productId = byKey.get(String(block.props?.productId ?? ''))
        if (!productId) continue
        const list = cards.get(productId) ?? []
        if (!list.some((entry) => entry.id === page.id)) list.push({ id: page.id, title: page.title })
        cards.set(productId, list)
      } else if (block?.type === 'ProductsGridBlock') {
        grids.push({ page: { id: page.id, title: page.title }, categorySlug: String(block.props?.categorySlug ?? '') })
      }
    }
  }
  return { cards, grids }
}

export function gridsShowing(product, grids) {
  return grids.filter((grid) => !grid.categorySlug || grid.categorySlug === product.category_slug)
}

// Adds a ProductCardBlock at the end of a builder document. Returns null when
// the document is not a populated builder document (the editor must create it).
export function appendProductCard(document, product) {
  if (!document || typeof document !== 'object' || !document.blocks || !document.regions?.main) return null
  let n = Object.keys(document.blocks).length + 1
  let id = `catalog_${n}`
  while (document.blocks[id]) { n += 1; id = `catalog_${n}` }
  const block = { id, type: 'ProductCardBlock', props: { productId: product.slug || product.id, showPrice: true, showDescription: true } }
  return {
    ...document,
    blocks: { ...document.blocks, [id]: block },
    regions: { ...document.regions, main: { ...document.regions.main, children: [...(document.regions.main.children ?? []), id] } },
  }
}

export function formatPrice(value, currency = 'MXN') {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  try { return new Intl.NumberFormat('es', { style: 'currency', currency }).format(number) } catch { return String(number) }
}
