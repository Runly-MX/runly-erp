import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils.js'

// Default tab style for the whole app: a pill strip whose active tab is a solid
// colored chip. A highlight slides between tabs (transform/size transition) and
// panels fade in. `tone` colors the highlight; 'brand' follows the instance
// brand color. Wrapped lists (flex-wrap) are supported because the highlight is
// positioned from the active trigger's offsets.
export const TAB_TONES = {
  brand: 'bg-(--brand-primary)',
  teal: 'bg-teal-600',
  blue: 'bg-blue-600',
  violet: 'bg-violet-600',
  amber: 'bg-amber-600',
  rose: 'bg-rose-600',
}

const Tabs = TabsPrimitive.Root

const TabsList = forwardRef(function TabsList({ className, tone = 'brand', children, ...props }, forwardedRef) {
  const listRef = useRef(null)
  const [box, setBox] = useState(null) // { x, y, w, h } of the active trigger

  const setRefs = useCallback((node) => {
    listRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])

  const measure = useCallback(() => {
    const active = listRef.current?.querySelector('[role="tab"][data-state="active"]')
    if (!active) { setBox(null); return }
    const next = { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
    setBox((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next))
  }, [])

  // The active trigger can change without this component re-rendering (Radix
  // owns the state), so measure after every render and on attribute changes.
  useLayoutEffect(() => { measure() })

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    const mutations = new MutationObserver(measure)
    mutations.observe(list, { attributes: true, attributeFilter: ['data-state'], subtree: true, childList: true })
    let resize = null
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(measure)
      resize.observe(list)
    }
    window.addEventListener('resize', measure)
    document.fonts?.ready?.then(measure).catch(() => {})
    return () => { mutations.disconnect(); resize?.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure])

  // Keep the active tab visible when the strip scrolls horizontally.
  useEffect(() => {
    const active = listRef.current?.querySelector('[role="tab"][data-state="active"]')
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [box?.x, box?.y])

  return (
      <TabsPrimitive.List
        ref={setRefs}
        className={cn(
          'relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          'border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 text-[hsl(var(--muted-foreground))]',
          className,
        )}
        {...props}
      >
        {box ? (
          <span
            aria-hidden="true"
            className={cn('pointer-events-none absolute left-0 top-0 rounded-xl shadow-sm transition-[transform,width,height] duration-250 ease-out motion-reduce:transition-none', TAB_TONES[tone] ?? TAB_TONES.brand)}
            style={{ width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)` }}
          />
        ) : null}
        {children}
      </TabsPrimitive.List>
  )
})

const TabsTrigger = forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative z-10 inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 sm:min-h-8',
        'hover:text-[hsl(var(--foreground))] data-[state=active]:hover:text-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary) focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
        'data-[state=active]:text-white data-[state=active]:[&_svg]:text-white',
        className,
      )}
      {...props}
    />
  )
})

const TabsContent = forwardRef(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40',
        'data-[state=active]:animate-[runly-tab-in_200ms_ease-out] motion-reduce:data-[state=active]:animate-none',
        className,
      )}
      {...props}
    />
  )
})

export { Tabs, TabsList, TabsTrigger, TabsContent }
