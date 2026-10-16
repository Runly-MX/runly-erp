// "Escanear" kiosk UI logic that does not touch React: remembered preferences,
// the manual-entry decision (exact code vs. search suggestion), camera status,
// read feedback/announcements and the session list filter. Tested with node --test.
import { normalizeScanCode, publicTokenFromCode } from './scan-session.js'

// ── Preferences (localStorage, per device) ───────────────────────────────
export const PREF_KEYS = {
  camera: 'runly.inventory.scan.camera',
  muted: 'runly.inventory.scan.muted',
  autoAdd: 'runly.inventory.scan.autoAdd',
}

export function readFlag(key, fallback, storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(key)
    return value === null || value === undefined ? fallback : value === '1'
  } catch {
    return fallback
  }
}

export function writeFlag(key, value, storage = globalThis.localStorage) {
  try { storage?.setItem(key, value ? '1' : '0') } catch { /* blocked: the choice lasts this visit only */ }
}

// ── Manual entry: "Buscar o escribir código" ─────────────────────────────
const fold = (value) => String(value ?? '').trim().toLowerCase()

// True when the text is exactly one of the item's identifiers (folio, asset tag, serial).
export function isExactIdentifier(item, text) {
  const code = fold(text)
  return Boolean(code) && [item?.folio, item?.assetTag, item?.serialNumber].some((v) => v && fold(v) === code)
}

// What Enter does with the typed text.
// { text, suggestions, ready (suggestions belong to this exact text), activeIndex }
// -> { kind: 'none' } | { kind: 'resolve', code } | { kind: 'pick', item } | { kind: 'choose' }
// A keyboard-wedge scanner types and presses Enter before the debounced search
// runs (ready = false), so the code goes to the exact lookup like a camera read.
export function decideManualEntry({ text, suggestions = [], ready = false, activeIndex = -1 }) {
  const code = normalizeScanCode(text)
  if (!code) return { kind: 'none' }
  const active = activeIndex >= 0 ? suggestions[activeIndex] : null
  if (active) return { kind: 'pick', item: active }
  if (publicTokenFromCode(code) || !ready) return { kind: 'resolve', code }
  if (!suggestions.length || suggestions.some((item) => isExactIdentifier(item, code))) return { kind: 'resolve', code }
  if (suggestions.length === 1) return { kind: 'pick', item: suggestions[0] }
  return { kind: 'choose' }
}

// A list row (GET /inventory/items) shaped like a scan/resolve item, so a picked
// suggestion and a scanned code produce the same session row.
export function itemFromSearchRow(row) {
  if (!row?.id) return null
  return {
    id: row.id,
    name: row.name ?? null,
    folio: row.folio ?? null,
    serialNumber: row.serialNumber ?? null,
    assetTag: row.assetTag ?? null,
    status: row.status ?? null,
    adminStatus: row.adminStatus ?? null,
    locationName: row.locationName ?? row.location?.name ?? null,
    categoryName: row.categoryName ?? row.category?.name ?? null,
    brandName: row.brandName ?? row.brand?.name ?? null,
    coverImageFileId: row.coverImageFileId ?? null,
  }
}

// Code stored for a picked suggestion (the export keeps "Código leído").
export const searchRowCode = (item) => item?.folio ?? item?.assetTag ?? item?.serialNumber ?? item?.id ?? ''

// ── Camera status ────────────────────────────────────────────────────────
// error: null | 'denied' | 'unavailable' | 'failed'
export function cameraStatus({ enabled, paused, starting, error }) {
  if (!enabled) return 'off'
  if (error === 'denied') return 'denied'
  if (error === 'unavailable') return 'unavailable'
  if (error) return 'failed'
  if (paused) return 'paused'
  if (starting) return 'starting'
  return 'scanning'
}

export const CAMERA_STATUS_LABEL = {
  off: 'Cámara apagada',
  starting: 'Iniciando',
  scanning: 'Escaneando',
  paused: 'Pausado',
  denied: 'Sin permiso',
  unavailable: 'Sin cámara',
  failed: 'Error de cámara',
}

// getUserMedia / zxing error -> kind shown in the viewfinder.
export function cameraErrorKind(error) {
  const name = error?.message === 'unsupported' ? 'unsupported' : (error?.name ?? error?.message ?? '')
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'unsupported' || name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'unavailable'
  return 'failed'
}

// ── Read feedback ────────────────────────────────────────────────────────
// Last-read state -> feedback tone (frame color, sound, vibration).
export function feedbackTone(state) {
  if (state === 'added' || state === 'pending') return 'ok'
  if (state === 'duplicate') return 'duplicate'
  if (state === 'missing' || state === 'error') return 'missing'
  return null
}

export const FEEDBACK = {
  ok: { haptic: 40, sound: 'in' },
  duplicate: { haptic: [30, 40, 30], sound: 'info' },
  missing: { haptic: [120, 60, 120], sound: 'error' },
}

// Screen-reader announcement for a read (aria-live).
export function announceResult(result) {
  if (!result) return ''
  const item = result.item
  const what = item ? [item.name, item.folio ? `folio ${item.folio}` : null].filter(Boolean).join(', ') : result.code
  switch (result.state) {
    case 'loading': return `Buscando ${result.code}`
    case 'added': return `Encontrado: ${what}. Agregado a la lista.`
    case 'pending': return `Encontrado: ${what}. Pulsa Agregar para sumarlo a la lista.`
    case 'duplicate': return `Ya está en la lista: ${what}. Leído ${result.reads ?? 2} veces.`
    case 'missing': return `No encontrado: ${result.code}.`
    case 'error': return `No se pudo buscar ${result.code}. ${result.message ?? ''}`.trim()
    default: return ''
  }
}

// ── Session list filter ──────────────────────────────────────────────────
export const LIST_FILTERS = ['all', 'matched', 'missing']

export function filterRows(rows, filter) {
  if (filter === 'matched') return rows.filter((r) => r.item)
  if (filter === 'missing') return rows.filter((r) => !r.item)
  return rows
}
