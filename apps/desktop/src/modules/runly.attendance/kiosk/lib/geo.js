// Device position for the geofence flag. Pure helpers take an injectable getter
// so they can be tested; createGeoTracker binds them to navigator.geolocation.
export const GEO_TIMEOUT_MS = 4_000
export const GEO_MAX_AGE_MS = 60_000
export const GEO_PUNCH_WAIT_MS = 1_500
export const GEO_STALE_MS = 30 * 60_000 // a fixed kiosk can reuse an older fix

// Resolves with the position or null when the getter fails or exceeds maxWaitMs.
// Never rejects and never waits longer than maxWaitMs.
export function waitForPosition(getter, maxWaitMs = GEO_PUNCH_WAIT_MS) {
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => finish(null), maxWaitMs)
    try {
      Promise.resolve(getter()).then((value) => finish(value ?? null), () => finish(null))
    } catch { finish(null) }
  })
}

export const toCoords = (position) => (position?.coords
  ? { latitude: position.coords.latitude, longitude: position.coords.longitude, at: position.timestamp ?? Date.now() }
  : null)

// Picks coordinates for a punch: a fresh fix first, otherwise the last known one
// when it is recent enough.
export function pickCoords(fresh, last, now = Date.now(), staleMs = GEO_STALE_MS) {
  if (fresh) return { latitude: fresh.latitude, longitude: fresh.longitude }
  if (last && now - last.at <= staleMs) return { latitude: last.latitude, longitude: last.longitude }
  return null
}

// status: null (not asked yet) | 'ok' | 'denied' | 'unavailable'
export function createGeoTracker({ geolocation = typeof navigator === 'undefined' ? null : navigator.geolocation, onChange = () => {}, initial = null } = {}) {
  let last = initial
  let status = geolocation ? null : 'unavailable'
  let inflight = null

  function request() {
    if (!geolocation || status === 'denied') return Promise.resolve(null)
    if (inflight) return inflight
    inflight = new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => { last = toCoords(position); status = 'ok'; onChange({ status, last }); resolve(last) },
        (error) => { status = error?.code === 1 ? 'denied' : 'unavailable'; onChange({ status, last }); resolve(null) },
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS },
      )
    }).finally(() => { inflight = null })
    return inflight
  }

  return { request, last: () => last, status: () => status }
}
