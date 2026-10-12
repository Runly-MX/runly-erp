// Registers the attendance service worker (public/sw-kiosk.js) for one scope.
// Used only by the kiosk and phone-key pages. Failures are silent: the pages
// work without it, it just adds cold-start offline support.
export function registerAttendanceWorker(scope) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const start = () => navigator.serviceWorker.register('/sw-kiosk.js', { scope }).catch(() => {})
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
