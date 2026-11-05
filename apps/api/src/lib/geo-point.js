// Validates an optional latitude/longitude pair from a request body.
// Returns null when neither was sent (leave as is), { latitude: null, longitude: null }
// to clear, or both numbers rounded to the 6 decimals the columns keep.
// Throws an Error with a user-facing message otherwise.
export function normalizeGeoPoint(latitude, longitude) {
  if (latitude === undefined && longitude === undefined) return null
  const blank = (v) => v === null || v === undefined || String(v).trim() === ''
  if (blank(latitude) && blank(longitude)) return { latitude: null, longitude: null }
  if (blank(latitude) || blank(longitude)) throw new Error('Indica latitud y longitud juntas.')
  const lat = Number(latitude), lng = Number(longitude)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('La latitud debe estar entre -90 y 90.')
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('La longitud debe estar entre -180 y 180.')
  return { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 }
}
