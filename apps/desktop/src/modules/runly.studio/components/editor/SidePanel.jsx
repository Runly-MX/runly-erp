import { useEffect, useState } from 'react'
import { cn } from '@runly/ui'

// Docked side panel that animates open/close: width collapses while the
// content slides and fades, so the canvas reflows smoothly instead of jumping.
// Stays mounted while closed (`inert`) so the closing animation has content.
export function SidePanel({ side = 'left', open, label, children, className }) {
  const width = 'w-[300px] xl:w-[320px]'
  return (
    <aside aria-label={label} inert={!open}
      className={cn('relative shrink-0 overflow-hidden bg-[hsl(var(--card))] transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none',
        open ? cn(width, side === 'left' ? 'border-r border-[hsl(var(--border))]' : 'border-l border-[hsl(var(--border))]') : 'w-0', className)}>
      <div className={cn('absolute inset-y-0 flex flex-col transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none', width,
        side === 'left' ? 'left-0' : 'right-0', open ? 'translate-x-0 opacity-100' : cn('opacity-0', side === 'left' ? '-translate-x-6' : 'translate-x-6'))}>
        {children}
      </div>
    </aside>
  )
}

const FROM = { below: 'translate-y-1.5', left: '-translate-x-6', right: 'translate-x-6' }

// Fades content in when `contentKey` changes (switching rail tabs or views);
// `from` picks the entry direction (lift from below, or slide from a side).
export function FadeSwap({ contentKey, from = 'below', children, className }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    setEntered(false)
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [contentKey])
  return (
    <div className={cn('transition-[opacity,transform] ease-out motion-reduce:transition-none', from === 'below' ? 'duration-200' : 'duration-300',
      entered ? 'translate-x-0 translate-y-0 opacity-100' : cn(FROM[from], 'opacity-0 motion-reduce:translate-x-0 motion-reduce:translate-y-0'), className)}>
      {children}
    </div>
  )
}
