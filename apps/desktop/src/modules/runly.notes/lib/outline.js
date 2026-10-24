export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// `doc` is a ProseMirror node (or anything with descendants(cb)). Only real
// heading nodes are listed; the first paragraph (the title) is not a heading.
export function extractOutline(doc) {
  const items = []
  const seen = new Map()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (!text) return false
    const base = slugify(text) || 'seccion'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    items.push({ id: n ? `${base}-${n}` : base, level: node.attrs.level, text, pos })
    return false
  })
  return items
}

export function countPages(doc) {
  let breaks = 0
  doc.descendants((node) => {
    if (node.type.name === 'pageBreak') breaks += 1
    return true
  })
  return breaks + 1
}
