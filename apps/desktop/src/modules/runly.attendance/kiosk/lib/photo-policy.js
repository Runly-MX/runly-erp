// Evidence-photo rules for local punches and for the outbox sync.
export const PHOTO_HOLD_MS = 8_000
const PHOTO_METHODS = new Set(['phone_qr', 'card'])

// Photo is required by the kiosk itself (any method) or, for phone_qr/card,
// by the company policy requirePhotoForQr (server default is true).
export function photoRequired({ method, kiosk, settings }) {
  if (kiosk?.requireSelfie) return true
  return PHOTO_METHODS.has(method) && settings?.requirePhotoForQr !== false
}

// A punch whose capture is still 'pending' is held back so the server does not
// flag a photo that is just being processed; after the hold it goes out as unavailable.
export function isHeldForPhoto(punch, now = Date.now(), holdMs = PHOTO_HOLD_MS) {
  if (punch?.selfie !== 'pending') return false
  const at = Date.parse(punch.deviceTime)
  return !Number.isFinite(at) || now - at < holdMs
}

export const selfieStatus = (punch) => (punch?.selfie === 'captured' ? 'captured' : punch?.selfie === 'pending' || punch?.selfie === 'unavailable' ? 'unavailable' : 'none')

// { ready, held } for the next sync batch.
export function splitForSync(punches, now = Date.now()) {
  const ready = []
  const held = []
  for (const p of punches) (isHeldForPhoto(p, now) ? held : ready).push(p)
  return { ready, held }
}
