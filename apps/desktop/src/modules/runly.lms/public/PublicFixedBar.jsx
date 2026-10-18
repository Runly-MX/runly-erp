import { useLayoutEffect, useRef, useState } from 'react'

// Top bar of the public LMS pages, fixed to the viewport (not `sticky`) so it
// stays put whatever element iOS/iPadOS Safari ends up scrolling. A spacer of
// the bar's measured height keeps the content below it.
export function PublicFixedBar({ className = '', children }) {
  const ref = useRef(null)
  const [height, setHeight] = useState(56)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const sync = () => setHeight(el.offsetHeight)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <>
      <div aria-hidden="true" className="shrink-0" style={{ height }} />
      <header ref={ref} className={`fixed inset-x-0 top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] pt-[env(safe-area-inset-top)] ${className}`}>
        {children}
      </header>
    </>
  )
}
