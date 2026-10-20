// Pure helpers for the keyboard-navigable area folder tree.
import { AREA_NONE } from './area-tree.js'

// Filter value of the "Todas" entry (no areaId filter).
export const TREE_ALL = ''

// Flat list of the rows currently visible: Todas, General, then the folders
// whose ancestors are all expanded. `value` is the areaId filter the row sets.
// Folder rows also carry what the tree guide lines need:
//  - isLast: no later sibling, so the elbow stops at the row.
//  - guides: one boolean per indent column (length === depth). The last column
//    is the row's own elbow (true = the vertical line continues below it); the
//    others tell whether an ancestor's vertical line passes through this row.
export function visibleTreeRows(tree, expanded) {
  const shortcut = { depth: 0, parentValue: null, hasChildren: false, isExpanded: false, isLast: true, guides: [] }
  const rows = [
    { ...shortcut, value: TREE_ALL, kind: 'all' },
    { ...shortcut, value: AREA_NONE, kind: 'none' },
  ]
  // `ancestorsOpen[k]` = the ancestor at depth k + 1 still has later siblings.
  const walk = (nodes, parentValue, ancestorsOpen) => {
    nodes.forEach((node, index) => {
      const hasChildren = node.children.length > 0
      const isExpanded = hasChildren && expanded.has(node.id)
      const isLast = index === nodes.length - 1
      const guides = node.depth > 0 ? [...ancestorsOpen.slice(0, node.depth - 1), !isLast] : []
      rows.push({ value: node.id, kind: 'area', depth: node.depth, parentValue, hasChildren, isExpanded, isLast, guides, node })
      if (isExpanded) walk(node.children, node.id, node.depth > 0 ? guides : [])
    })
  }
  walk(tree, null, [])
  return rows
}

// Ids of the ancestors of an area (nearest first), so a selection can be revealed.
export function ancestorAreaIds(areas, areaId) {
  const byId = new Map(areas.map((a) => [a.id, a]))
  const out = []
  const seen = new Set([areaId])
  for (let cur = byId.get(byId.get(areaId)?.parentId); cur && !seen.has(cur.id); cur = byId.get(cur.parentId)) {
    seen.add(cur.id)
    out.push(cur.id)
  }
  return out
}

// WAI-ARIA tree keyboard model. Returns { focus, toggle, select } where only the
// relevant keys are set: `focus` is the row value to move to, `toggle` is
// 'expand' | 'collapse' for the focused row, `select` selects the focused row.
export function treeKeyAction(rows, focusedValue, key) {
  const index = rows.findIndex((r) => r.value === focusedValue)
  const row = rows[index]
  if (!row) return {}
  switch (key) {
    case 'ArrowDown': return index < rows.length - 1 ? { focus: rows[index + 1].value } : {}
    case 'ArrowUp': return index > 0 ? { focus: rows[index - 1].value } : {}
    case 'Home': return { focus: rows[0].value }
    case 'End': return { focus: rows[rows.length - 1].value }
    case 'ArrowRight':
      if (row.hasChildren && !row.isExpanded) return { toggle: 'expand' }
      if (row.hasChildren) return { focus: rows[index + 1].value }
      return {}
    case 'ArrowLeft':
      if (row.hasChildren && row.isExpanded) return { toggle: 'collapse' }
      return row.parentValue != null ? { focus: row.parentValue } : {}
    case 'Enter':
    case ' ': return { select: true }
    default: return {}
  }
}
