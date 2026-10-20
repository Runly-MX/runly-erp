import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FolderTree, Inbox, Layers, PanelLeftClose } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { buildAreaTree } from '../../lib/area-tree.js'
import { ancestorAreaIds, treeKeyAction, visibleTreeRows } from '../../lib/area-tree-nav.js'

function rowLabel(row) {
  if (row.kind === 'all') return 'Todas'
  if (row.kind === 'none') return 'General'
  return row.node.name
}

const LINE = 'bg-[hsl(var(--border))]'

// One indent column of the tree guide lines. The last column of a folder row is its elbow:
// a vertical line (full height, or only to the middle for the last child) plus a short horizontal stub.
function GuideCell({ continues, elbow, isLast, touch }) {
  return (
    <span aria-hidden="true" className={cn('relative shrink-0 self-stretch', touch ? 'w-9' : 'w-6')}>
      {elbow ? (
        <>
          <span className={cn('absolute left-1/2 top-0 w-px', LINE, isLast ? 'h-1/2' : 'h-full')} />
          <span className={cn('absolute left-1/2 right-0 top-1/2 h-px', LINE)} />
        </>
      ) : continues ? <span className={cn('absolute inset-y-0 left-1/2 w-px', LINE)} /> : null}
    </span>
  )
}

// Folder tree of inventory areas. `value` is the areaId filter ('' = Todas, '__none__' = General).
// `touch` enlarges rows to 44px for the modal (mobile) presentation.
// `onCollapse` shows the "Carpetas" header with the collapse button (docked panel only).
export function AreaTreePanel({ areas, value, onSelect, touch = false, loading = false, onCollapse, className }) {
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

  const renderRow = (row, index) => {
    const selected = row.value === value
    const Icon = row.kind === 'all' ? Layers : row.kind === 'none' ? Inbox : row.isExpanded ? FolderOpen : Folder
    const label = rowLabel(row)
    // Todas / General are top-level shortcuts; a divider separates them from the folder hierarchy.
    const showDivider = row.kind === 'area' && rows[index - 1]?.kind === 'none'
    return (
      <div key={row.kind === 'area' ? row.value : row.kind} role="none">
        {showDivider ? <div role="separator" className="mx-1 my-1.5 h-px bg-[hsl(var(--border))]" /> : null}
        <div
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
            'group flex cursor-pointer items-stretch outline-none',
            row.kind === 'area' && 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200',
          )}
        >
          {row.guides.map((continues, column) => (
            <GuideCell key={column} continues={continues} elbow={column === row.guides.length - 1} isLast={row.isLast} touch={touch} />
          ))}
          <div
            className={cn(
              'relative my-px flex min-w-0 flex-1 items-center gap-1 rounded-md pr-2 text-sm transition-colors duration-150',
              'group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--ring))]',
              touch ? 'min-h-11' : 'min-h-8',
              selected ? 'bg-[hsl(var(--primary))]/12 font-medium text-[hsl(var(--primary))]' : 'hover:bg-[hsl(var(--muted))]/60',
            )}
          >
            {selected ? <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[hsl(var(--primary))]" /> : null}
            {row.kind === 'area' && row.hasChildren ? (
              <span
                aria-hidden="true"
                className={cn('flex shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors duration-150 hover:bg-[hsl(var(--muted))]', touch ? 'h-9 w-9' : 'h-6 w-6')}
                onClick={(event) => { event.stopPropagation(); toggle(row.value) }}
              >
                <ChevronRight className={cn('h-4 w-4 transition-transform duration-150', row.isExpanded && 'rotate-90')} />
              </span>
            ) : <span className={cn('shrink-0', row.kind === 'area' ? (touch ? 'w-3' : 'w-2') : 'w-2')} />}
            <Icon className={cn('h-4 w-4 shrink-0', selected ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]')} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
            {row.kind === 'area' ? (
              <span className="ml-1 shrink-0 rounded-md bg-[hsl(var(--muted))]/70 px-1.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{row.node.itemCount ?? 0}</span>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {onCollapse ? (
        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-2 pl-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FolderTree className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />Carpetas
          </h2>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-md" aria-label="Ocultar carpetas" title="Ocultar carpetas" onClick={onCollapse}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      {loading ? (
        <div className="space-y-1.5 p-1" aria-busy="true" aria-label="Cargando carpetas">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-7 animate-pulse rounded-md bg-[hsl(var(--muted))]" style={{ width: `${90 - i * 12}%` }} />)}
        </div>
      ) : (
        <div role="tree" aria-label="Áreas de inventario">
          {rows.map(renderRow)}
          {areas.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">Aún no hay carpetas. Créalas desde la configuración de áreas.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
