// Opt-in bridge: without a mounted editor guard, all navigation remains synchronous.
let guard = null
let bypass = 0
let popGuard = null
// Imported by the company provider before BrowserRouter mounts. At-window
// popstate listeners run in registration order; a lazy editor installs too late.
// Outside an opted-in dirty editor this listener has no effect.
if (typeof window !== 'undefined') window.addEventListener('popstate', event => popGuard?.(event), true)
export function registerPopNavigationGuard(next) {
  popGuard = next
  return () => { if (popGuard === next) popGuard = null }
}
export function registerNavigationGuard(next) {
  guard = next
  return () => { if (guard === next) guard = null }
}
export function guardNavigation(action) {
  if (guard && !bypass) { guard(action); return false }
  action(); return true
}
export function commitNavigation(action) {
  bypass++
  try { return action() } finally { bypass-- }
}
