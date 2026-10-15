// "Escanear" kiosk: code normalization, the session list reducer (duplicates
// highlight the existing row instead of adding it twice), sessionStorage
// persistence and the CSV export. Pure, so it is tested with node --test.
export const SCAN_PATH = '/app/m/runly.inventory/inventory/scan'
export const MAX_SESSION_ROWS = 500
const MAX_CODE_LENGTH = 512
const PUBLIC_PATH_RE = /\/app\/p\/inv\/([A-Za-z0-9_-]+)/
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g

// Trimmed, control characters removed (keyboard-wedge scanners may add a
// trailing tab/CR), capped. Empty string when there is nothing to look up.
export function normalizeScanCode(text) {
  return String(text ?? '').replace(CONTROL_RE, '').trim().slice(0, MAX_CODE_LENGTH)
}

// Token of a Runly item link (`.../app/p/inv/<token>`), else null.
export function publicTokenFromCode(text) {
  const match = PUBLIC_PATH_RE.exec(normalizeScanCode(text))
  return match ? match[1] : null
}

// Key a raw code collapses to before any lookup (links by token, the rest
// case-insensitively), so a repeated read is detected without calling the API.
export function codeKey(text) {
  const token = publicTokenFromCode(text)
  return token ? `link:${token}` : `code:${normalizeScanCode(text).toLowerCase()}`
}

const itemIdentifiers = (item) => [item?.folio, item?.assetTag, item?.serialNumber].filter(Boolean).map((v) => `code:${String(v).toLowerCase()}`)

// Row already holding this code (raw key, or one of the matched item's identifiers).
export function findRowByCode(rows, text) {
  const key = codeKey(text)
  return rows.find((row) => row.codeKeys.includes(key)) ?? null
}

export const rowKeyFor = (result) => (result?.item?.id ? `item:${result.item.id}` : codeKey(result?.code))

// result: { code, item, matchedBy } from POST /inventory/scan/resolve.
export function toSessionRow(result, readAt = new Date().toISOString()) {
  const item = result.item ?? null
  return {
    key: rowKeyFor(result),
    code: normalizeScanCode(result.code),
    codeKeys: [...new Set([codeKey(result.code), ...itemIdentifiers(item)])],
    item,
    matchedBy: result.matchedBy ?? null,
    readAt,
    reads: 1,
  }
}

// state: rows, newest first.
export function sessionReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const row = toSessionRow(action.result, action.readAt)
      const existing = state.find((r) => r.key === row.key)
      if (existing) {
        return state.map((r) => (r === existing
          ? { ...r, reads: r.reads + 1, lastReadAt: row.readAt, codeKeys: [...new Set([...r.codeKeys, ...row.codeKeys])] }
          : r))
      }
      return [row, ...state].slice(0, MAX_SESSION_ROWS)
    }
    // Same row read again (detected before the lookup): count it, keep the position.
    case 'touch':
      return state.map((r) => (r.key === action.key ? { ...r, reads: r.reads + 1, lastReadAt: action.readAt ?? new Date().toISOString() } : r))
    // Fresh item data after a bulk action ({ [itemId]: item }).
    case 'refresh':
      return state.map((r) => (r.item && action.items[r.item.id] ? { ...r, item: { ...r.item, ...action.items[r.item.id] } } : r))
    case 'remove':
      return state.filter((r) => r.key !== action.key)
    case 'clear':
      return []
    case 'load':
      return Array.isArray(action.rows) ? action.rows.filter((r) => r && r.key && Array.isArray(r.codeKeys)).slice(0, MAX_SESSION_ROWS) : state
    default:
      return state
  }
}

export function sessionCounts(rows) {
  const matched = rows.filter((r) => r.item).length
  return { total: rows.length, matched, unmatched: rows.length - matched, reads: rows.reduce((sum, r) => sum + (r.reads || 1), 0) }
}

// ── Persistence (per company, per tab) ──────────────────────────────────
const storageKey = (companyId) => `runly.inventory.scan.${companyId || 'default'}`

export function loadSession(companyId, storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(storageKey(companyId))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? sessionReducer([], { type: 'load', rows: parsed }) : []
  } catch {
    return []
  }
}

export function saveSession(companyId, rows, storage = globalThis.sessionStorage) {
  try {
    if (rows.length) storage?.setItem(storageKey(companyId), JSON.stringify(rows))
    else storage?.removeItem(storageKey(companyId))
  } catch { /* storage blocked or full: the list just is not kept */ }
}

// ── Export ──────────────────────────────────────────────────────────────
export const SCAN_EXPORT_COLUMNS = ['Folio', 'Nombre', 'Serie', 'Número de activo', 'Tipo', 'Marca', 'Ubicación', 'Estado', 'Leído a las', 'Código leído']

const timeOf = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Oldest read first, as the operator scanned them. statusLabel(adminStatus) -> text.
export function toExportTable(rows, { statusLabel = (v) => v ?? '' } = {}) {
  const body = [...rows].reverse().map((row) => {
    const item = row.item
    if (!item) return ['', 'No encontrado', '', '', '', '', '', '', timeOf(row.readAt), row.code]
    return [
      item.folio ?? '', item.name ?? '', item.serialNumber ?? '', item.assetTag ?? '', item.categoryName ?? '',
      item.brandName ?? '', item.locationName ?? '', statusLabel(item.adminStatus) ?? '', timeOf(row.readAt), row.code,
    ]
  })
  return { columns: SCAN_EXPORT_COLUMNS, rows: body }
}

// Spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is prefixed with '.
const neutralize = (value) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)
const csvCell = (value) => {
  const text = neutralize(String(value ?? ''))
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// BOM so Excel opens the accents correctly; CRLF rows.
export function buildCsv({ columns, rows }) {
  return `﻿${[columns, ...rows].map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`
}

export function exportFilename(extension, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `escaneo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${extension}`
}
