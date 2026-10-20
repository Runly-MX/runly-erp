// Pure helpers for the inventory areas tree (client side).
export const AREA_NONE = '__none__'
const WRITE_ROLES = new Set(['editor', 'manager'])

// Flat [{ id, parentId, ... }] -> sorted forest with `children` and `depth`.
// An area whose parent is not in the list (not visible to the user) becomes a root.
export function buildAreaTree(areas = []) {
  const ids = new Set(areas.map((a) => a.id))
  const byParent = new Map()
  for (const area of areas) {
    const key = area.parentId && ids.has(area.parentId) ? area.parentId : null
    byParent.set(key, [...(byParent.get(key) ?? []), area])
  }
  const build = (parentId, depth) => (byParent.get(parentId) ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((area) => ({ ...area, depth, children: build(area.id, depth + 1) }))
  return build(null, 0)
}

// Depth-first flat list (parents before children) for tables and pickers.
export function flattenAreaTree(tree) {
  return tree.flatMap((node) => [node, ...flattenAreaTree(node.children)])
}

// Ids of an area and all its descendants (a parent cannot move under them).
export function descendantIds(areas, areaId) {
  const out = new Set([areaId])
  let grew = true
  while (grew) {
    grew = false
    for (const a of areas) {
      if (a.parentId && out.has(a.parentId) && !out.has(a.id)) { out.add(a.id); grew = true }
    }
  }
  return out
}

export const canWriteAreaRole = (role) => WRITE_ROLES.has(role)

// "Padre / Hijo" label for pickers.
export function areaPathLabel(areas, areaId) {
  const byId = new Map(areas.map((a) => [a.id, a]))
  const parts = []
  const seen = new Set()
  for (let cur = byId.get(areaId); cur && !seen.has(cur.id); cur = byId.get(cur.parentId)) {
    seen.add(cur.id)
    parts.unshift(cur.name)
  }
  return parts.join(' / ')
}

// Options for the area list filter: General first, then every visible area as "Padre / Hijo".
export function areaFilterOptions(areas = []) {
  if (!areas.length) return []
  return [
    { value: AREA_NONE, label: 'General (sin área)' },
    ...flattenAreaTree(buildAreaTree(areas)).map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) })),
  ]
}

// Areas where the user may put items. `requireArea` (scoping on and no inventory.scope.all)
// removes the General choice because a limited user cannot create unscoped items.
export function areaWriteOptions(areas = [], { requireArea = false } = {}) {
  const writable = areas.filter((a) => canWriteAreaRole(a.role))
  const writableSet = new Set(writable.map((a) => a.id))
  const options = flattenAreaTree(buildAreaTree(areas))
    .filter((a) => writableSet.has(a.id))
    .map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) }))
  return requireArea ? options : [{ value: AREA_NONE, label: 'General (sin área)' }, ...options]
}
