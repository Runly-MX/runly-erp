import { useLayoutEffect, useRef } from 'react'
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

const FROM = { below: 'translateY(8px)', left: 'translateX(-32px)', right: 'translateX(32px)' }

// Animates content in when `contentKey` changes (switching rail tabs or views);
// `from` picks the entry direction (lift from below, or slide from a side).
// Web Animations API: runs before paint on every key change, interruptible,
// and skipped entirely with prefers-reduced-motion.
export function FadeSwap({ contentKey, from = 'below', children, className, ...props }) {
  const node = useRef(null)
  useLayoutEffect(() => {
    const element = node.current
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const animation = element.animate([{ opacity: 0, transform: FROM[from] }, { opacity: 1, transform: 'none' }],
      { duration: from === 'below' ? 220 : 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
    return () => animation.cancel()
  }, [contentKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={node} {...props} className={className}>{children}</div>
}
