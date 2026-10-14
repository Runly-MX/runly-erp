// Registers the attendance service worker (public/sw-kiosk.js) for one scope.
// Used only by the kiosk and phone-key pages. Failures are silent: the pages
// work without it, it just adds cold-start offline support.
// Scopes are /app/p/kiosk/ and /app/p/attendance/ (all public pages live under
// /app/p/). Registrations left from the old /app/kiosk/ and /app/attendance/
// scopes are intentionally NOT unregistered here: see the note at the top of
// public/sw-kiosk.js. public/attendance-phone.webmanifest keeps its original
// `id` (/app/attendance/phone) so installed "Checador" apps stay the same app
// while scope/start_url move to /app/p/attendance/.
export function registerAttendanceWorker(scope) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const start = () => navigator.serviceWorker.register('/sw-kiosk.js', { scope }).catch(() => {})
  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
