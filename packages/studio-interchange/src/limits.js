// Format identity and limits of the portable Studio package (and of the ZIP
// container shared with the Website template format).
export const FORMAT = Object.freeze({
  name: 'studio',
  formatVersion: 1,
  minReaderVersion: 1,
  documentSchemaVersion: 7,
  mime: 'application/vnd.runly.studio+zip',
})
// Bumps with any change of PACKAGE_LIMITS (recorded in validation evidence).
export const LIMITS_VERSION = 1
export const PACKAGE_LIMITS = Object.freeze({
  compressed: 64 * 1024 * 1024, expanded: 128 * 1024 * 1024, entry: 10 * 1024 * 1024, entries: 256, ratio: 200, folders: 32, depth: 3,
  pages: 24, objectsPerPage: 500, totalObjects: 2000, assets: 100, resourceBytes: 64 * 1024 * 1024, imageSide: 8192, imagePixels: 25_000_000, documentBytes: 4_000_000,
})

// Callers can only be stricter than the format: each override is clamped to the
// format limit. A malformed override is a programming error, not hostile input.
export function resolveLimits(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('INVALID_LIMITS')
  const limits = { ...PACKAGE_LIMITS }
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(PACKAGE_LIMITS, key) || !Number.isInteger(value) || value < 0) throw new TypeError(`INVALID_LIMITS:${key}`)
    limits[key] = Math.min(value, PACKAGE_LIMITS[key])
  }
  return Object.freeze(limits)
}
