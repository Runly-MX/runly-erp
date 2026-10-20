import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@runly/ui'
import { AreaTreePanel } from './AreaTreePanel.jsx'
import { clampTreeWidth, keyboardTreeWidth, TREE_DEFAULT, TREE_GAP, TREE_MIN } from '../../lib/area-tree-resize.js'

// Drag handle on the right edge of the docked panel (pointer events + keyboard, role=separator).
function ResizeHandle({ width, min, max, onPreview, onCommit, onDraggingChange }) {
  const ref = useRef(null)
  const drag = useRef(null)
  const frame = useRef(0)

  const finish = useCallback((commit) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    cancelAnimationFrame(frame.current)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    onDraggingChange(false)
    if (commit) {
      onPreview(state.width)
      onCommit(state.width)
    }
  }, [onCommit, onPreview, onDraggingChange])

  useEffect(() => () => {
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [])

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button > 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width, width }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    onDraggingChange(true)
  }

  const onPointerMove = (event) => {
    const state = drag.current
    if (!state) return
    state.width = clampTreeWidth(state.startWidth + event.clientX - state.startX, max)
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      onPreview(state.width)
      ref.current?.setAttribute('aria-valuenow', String(state.width))
    })
  }

  const onKeyDown = (event) => {
    const next = keyboardTreeWidth(width, event.key, event.shiftKey, max)
    if (next == null) return
    event.preventDefault()
    onCommit(next)
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar panel de carpetas"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(true)}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(clampTreeWidth(TREE_DEFAULT, max))}
      className={cn(
        'group/handle absolute inset-y-0 right-0 z-10 flex w-3 cursor-col-resize touch-none select-none items-stretch justify-center outline-none',
        'pointer-coarse:w-4',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'my-1 w-0.5 rounded-full bg-transparent transition-colors duration-150 motion-reduce:transition-none',
          'group-hover/handle:bg-[hsl(var(--primary))]/40 group-active/handle:bg-[hsl(var(--primary))]',
          'group-focus-visible/handle:bg-[hsl(var(--primary))] group-focus-visible/handle:ring-2 group-focus-visible/handle:ring-[hsl(var(--ring))]',
        )}
      />
    </div>
  )
}

// Docked, animated, resizable folder sidebar. The column animates its width (toggle only; never while dragging)
// while the inner panel keeps a fixed width so the tree does not reflow. The panel pushes the table.
export function AreaTreeDock({ dock, areas, value, onSelect, loading }) {
  const wrapperRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const { dockOpen, width, maxWidth, setWidth } = dock

  const preview = useCallback((px) => wrapperRef.current?.style.setProperty('--tree-w', `${px}px`), [])
  const commit = useCallback((px) => { setWidth(px) }, [setWidth])

  return (
    <div
      ref={wrapperRef}
      inert={!dockOpen}
      aria-hidden={!dockOpen}
      style={{ '--tree-w': `${width}px`, '--tree-gap': `${TREE_GAP}px` }}
      className={cn(
        'relative self-stretch overflow-x-clip',
        dockOpen
          ? 'w-[calc(var(--tree-w)+var(--tree-gap))] visible'
          : 'w-0 invisible',
        !dragging && 'transition-[width,visibility] ease-out motion-reduce:transition-none',
        !dragging && (dockOpen ? 'duration-240' : 'duration-180'),
      )}
    >
      <aside
        aria-label="Carpetas"
        style={{ width: 'var(--tree-w)' }}
        className={cn(
          'sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-md border border-[hsl(var(--border))] p-2.5',
          'transition-[opacity,transform] ease-out motion-reduce:transition-none',
          dockOpen ? 'translate-x-0 opacity-100 duration-240' : '-translate-x-3 opacity-0 duration-180',
        )}
      >
        <AreaTreePanel areas={areas} value={value} onSelect={onSelect} loading={loading} onCollapse={dock.toggle} />
      </aside>
      {dockOpen ? (
        <ResizeHandle
          width={width}
          min={TREE_MIN}
          max={maxWidth}
          onPreview={preview}
          onCommit={commit}
          onDraggingChange={setDragging}
        />
      ) : null}
    </div>
  )
}
