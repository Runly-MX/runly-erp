// Coordinates pasted by a user: "19.4326, -99.1332", "19.4326 -99.1332" or a
// map link (Google Maps "@lat,lng", "!3dlat!4dlng", "?q=lat,lng"; OpenStreetMap
// "mlat=..&mlon=.."). Returns { latitude, longitude } or null.
const NUM = '(-?\\d{1,3}(?:[.]\\d+)?)'
const PATTERNS = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`mlat=${NUM}&mlon=${NUM}`),
  new RegExp(`[?&](?:q|ll|query|center)=${NUM}(?:,|%2C)\\s*${NUM}`, 'i'),
  new RegExp(`^\\s*\\(?${NUM}\\s*[,; ]\\s*${NUM}\\)?\\s*$`),
]

export function parseCoordinates(text) {
  const raw = String(text ?? '').trim()
  for (const pattern of PATTERNS) {
    const match = raw.match(pattern)
    if (!match) continue
    const latitude = Number(match[1]), longitude = Number(match[2])
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude }
  }
  return null
}

export const hasGeoPoint = (lat, lng) => lat !== '' && lat != null && lng !== '' && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
export const formatGeoPoint = (lat, lng) => `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
export const googleMapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`
