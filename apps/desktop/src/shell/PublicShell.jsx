import { Outlet } from 'react-router-dom'

// html/body are globally overflow:hidden (the authenticated app shell scrolls
// internally), so every public page under /app/p needs its own bounded
// scroll region. Pages that manage their own (h-dvh + overflow) still fit.
export function PublicShell() {
  return (
    <div className="h-dvh overflow-y-auto overscroll-contain bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <Outlet />
    </div>
  )
}
