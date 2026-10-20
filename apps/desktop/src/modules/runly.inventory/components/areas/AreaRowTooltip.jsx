import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@runly/ui'

const isCoarse = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)

// The tree row itself (role=treeitem) wrapped in a tooltip that only opens when the folder name is truncated.
// The trigger is the row, so keyboard focus opens it too and no extra tab stop is created.
// `title` is the full path, `count` the item count (null for the Todas / General shortcuts).
export function AreaRowTooltip({ title, count, disabled, setRef, children, ...rowProps }) {
  const [open, setOpen] = useState(false)
  const [node, setNode] = useState(null)

  const onOpenChange = (next) => {
    if (!next) { setOpen(false); return }
    if (disabled || isCoarse()) return
    const label = node?.querySelector('[data-tree-label]')
    if (label && label.scrollWidth > label.clientWidth) setOpen(true)
  }

  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>
        <div {...rowProps} ref={(el) => { setNode(el); setRef(el) }}>{children}</div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8} className="pointer-events-none max-w-xs whitespace-normal break-words">
        <p className="font-medium">{title}</p>
        {count != null ? <p className="text-[hsl(var(--muted-foreground))]">{count} {count === 1 ? 'elemento' : 'elementos'}</p> : null}
      </TooltipContent>
    </Tooltip>
  )
}
