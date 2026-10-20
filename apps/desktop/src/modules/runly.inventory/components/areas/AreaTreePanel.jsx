import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Inbox, Layers } from 'lucide-react'
import { cn } from '@runly/ui'
import { buildAreaTree } from '../../lib/area-tree.js'
import { ancestorAreaIds, treeKeyAction, visibleTreeRows } from '../../lib/area-tree-nav.js'

function rowLabel(row) {
  if (row.kind === 'all') return 'Todas'
  if (row.kind === 'none') return 'General'
  return row.node.name
}

// Folder tree of inventory areas. `value` is the areaId filter ('' = Todas, '__none__' = General).
// `touch` enlarges rows to 44px for the modal (mobile) presentation.
export function AreaTreePanel({ areas, value, onSelect, touch = false, className }) {
  const tree = useMemo(() => buildAreaTree(areas), [areas])
  const [expanded, setExpanded] = useState(() => new Set(ancestorAreaIds(areas, value)))
  const [focused, setFocused] = useState(value)
  const refs = useRef(new Map())
  const pendingFocus = useRef(false)

  // Reveal the selected folder when the filter changes from outside (table filter, deep link).
  useEffect(() => {
    const parents = ancestorAreaIds(areas, value)
    if (parents.length) setExpanded((cur) => (parents.every((id) => cur.has(id)) ? cur : new Set([...cur, ...parents])))
    setFocused(value)
  }, [areas, value])

  const rows = useMemo(() => visibleTreeRows(tree, expanded), [tree, expanded])
  const tabbable = rows.some((r) => r.value === focused) ? focused : rows[0].value

  useEffect(() => {
    if (pendingFocus.current) {
      pendingFocus.current = false
      refs.current.get(focused)?.focus()
    }
  }, [focused, rows])

  const toggle = (id, open) => setExpanded((cur) => {
    const next = new Set(cur)
    if (open ?? !next.has(id)) next.add(id)
    else next.delete(id)
    return next
  })

  const onKeyDown = (event, row) => {
    if (event.target !== event.currentTarget) return
    const action = treeKeyAction(rows, row.value, event.key)
    if (!Object.keys(action).length) return
    event.preventDefault()
    if (action.focus != null) { pendingFocus.current = true; setFocused(action.focus) }
    if (action.toggle) toggle(row.value, action.toggle === 'expand')
    if (action.select) onSelect(row.value)
  }

  return (
    <div role="tree" aria-label="Áreas de inventario" className={cn('space-y-0.5', className)}>
      {rows.map((row) => {
        const selected = row.value === value
        const Icon = row.kind === 'all' ? Layers : row.kind === 'none' ? Inbox : row.isExpanded ? FolderOpen : Folder
        return (
          <div
            key={row.kind === 'area' ? row.value : row.kind}
            ref={(el) => { if (el) refs.current.set(row.value, el); else refs.current.delete(row.value) }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={selected}
            aria-expanded={row.hasChildren ? row.isExpanded : undefined}
            tabIndex={row.value === tabbable ? 0 : -1}
            onClick={() => onSelect(row.value)}
            onFocus={(event) => { if (event.target === event.currentTarget) setFocused(row.value) }}
            onKeyDown={(event) => onKeyDown(event, row)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-md pr-2 text-sm outline-none',
              'focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              touch ? 'min-h-11' : 'min-h-8',
              selected ? 'bg-[hsl(var(--primary))]/12 font-medium text-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--muted))]/60',
            )}
            style={{ paddingLeft: `${0.25 + row.depth}rem` }}
          >
            {row.hasChildren ? (
              <span
                aria-hidden="true"
                className={cn('flex shrink-0 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]', touch ? 'h-9 w-9' : 'h-6 w-6')}
                onClick={(event) => { event.stopPropagation(); toggle(row.value) }}
              >
                {row.isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            ) : <span className={cn('shrink-0', touch ? 'w-9' : 'w-6')} />}
            <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{rowLabel(row)}</span>
            {row.kind === 'area' ? (
              <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{row.node.itemCount ?? 0}</span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
