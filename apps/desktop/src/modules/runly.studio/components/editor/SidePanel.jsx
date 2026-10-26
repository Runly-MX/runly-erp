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

// Fades and lifts content in when `contentKey` changes (switching rail tabs).
export function FadeSwap({ contentKey, children, className }) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    setEntered(false)
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [contentKey])
  return (
    <div className={cn('transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none', entered ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0', className)}>
      {children}
    </div>
  )
}
