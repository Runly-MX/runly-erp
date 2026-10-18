import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

// html/body are globally overflow:hidden (the authenticated app shell scrolls
// internally). Public pages under /app/p opt out and scroll the document
// instead: an inner full-height scroll container misbehaves on iOS/iPadOS
// Safari (toolbar resize leaves a blank band, double scroll). Pages keep
// headers `sticky`; ones that still manage their own h-dvh scroll also fit.
export function PublicShell() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('runly-document-scroll')
    return () => root.classList.remove('runly-document-scroll')
  }, [])
  return (
    <div className="min-h-dvh bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Outlet />
    </div>
  )
}
