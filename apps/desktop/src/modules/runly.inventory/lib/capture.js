// Capture helpers for the new-asset form: pinned fields that survive saves and
// reloads (stored in this browser), and bulk creation from a list of serials.

export const MAX_BULK_SERIALS = 200

// Unique per asset, so pinning them would only produce duplicates.
export const UNPINNABLE_FIELDS = ['serialNumber', 'assetTag']
export const canPinField = (name) => !UNPINNABLE_FIELDS.includes(name) && !name.startsWith('__')

export const DEFAULT_CAPTURE = { pinned: [], values: {}, continuous: false, multi: false, pinMode: false, separator: 'comma' }

// Serials separated by commas, semicolons, spaces or new lines. Repeats are
// dropped (first occurrence kept) and reported.
export function parseSerials(text) {
  const serials = []
  const repeated = []
  const seen = new Set()
  for (const raw of String(text ?? '').split(/[\s,;]+/)) {
    const serial = raw.trim()
    if (!serial) continue
    if (seen.has(serial)) { if (!repeated.includes(serial)) repeated.push(serial) } else { seen.add(serial); serials.push(serial) }
  }
  return { serials, repeated }
}

// What goes between serials when a scanner or the camera adds one. The
// trailing separator is always left in place so the text reads "A, B, " and the
// next read lands cleanly; hand-typed separators of any kind still parse.
export const SERIAL_SEPARATORS = {
  comma: { label: 'Coma', joiner: ', ' },
  newline: { label: 'Salto de línea', joiner: '\n' },
  space: { label: 'Espacio', joiner: ' ' },
}

export function appendSerial(text, code, separator = 'comma') {
  const serial = String(code ?? '').replace(/[\s,;]+/g, '')
  if (!serial) return { text: String(text ?? ''), added: false }
  if (parseSerials(text).serials.includes(serial)) return { text: String(text ?? ''), added: false }
  const { joiner } = SERIAL_SEPARATORS[separator] ?? SERIAL_SEPARATORS.comma
  const base = String(text ?? '').replace(/[\s,;]+$/, '')
  return { text: `${base}${base ? joiner : ''}${serial}${joiner}`, added: true }
}

// `pinned` holds field names (RunlyForm fieldPins).
export function pinnedValues(values, pinned) {
  const out = {}
  for (const field of pinned) {
    const value = values?.[field]
    if (canPinField(field) && value !== undefined && value !== null && value !== '') out[field] = value
  }
  return out
}

// No name -> undefined, so the API generates one from brand/type/model.
export function bulkUnitName(name, serial) {
  const base = String(name ?? '').trim()
  return base ? `${base} · ${serial}`.slice(0, 255) : undefined
}

export function captureStorageKey(companyId, userId) {
  return companyId && userId ? `runly.inventory.capture:${companyId}:${userId}` : null
}

export function loadCapture(key, storage = globalThis.localStorage) {
  if (!key) return DEFAULT_CAPTURE
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? 'null')
    return parsed && typeof parsed === 'object' ? { ...DEFAULT_CAPTURE, ...parsed } : DEFAULT_CAPTURE
  } catch { return DEFAULT_CAPTURE }
}

export function saveCapture(key, state, storage = globalThis.localStorage) {
  if (!key) return
  try { storage?.setItem(key, JSON.stringify(state)) } catch { /* private mode / quota: pinning just won't persist */ }
}
