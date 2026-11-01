// apps/desktop/src/modules/runly.catalog/lib/catalogRules.js
//
// Pure helpers for the catalog screens. None of them decides a commercial
// rule: prices, availability and stock stay authoritative on the server.
// They only shape input, explain state and stop obvious duplicates before a
// request is sent.

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

export function variantLabel(optionValues) {
  if (!optionValues || typeof optionValues !== 'object') return ''
  return Object.values(optionValues).filter(Boolean).join(' / ')
}

function comboKey(optionValues, optionNames) {
  return optionNames.map((name) => `${name}=${optionValues?.[name] ?? ''}`).join('|')
}

// Combinations of the product options that no active variant covers yet.
// Existing variants are never touched; an option without values yields none.
export function missingCombinations(options = [], variants = []) {
  const names = options.map((o) => o.name)
  const valueLists = options.map((o) => (o.values ?? []).map((v) => (typeof v === 'string' ? v : v.value)).filter(Boolean))
  if (!names.length || valueLists.some((list) => list.length === 0)) return []
  const existing = new Set(variants.map((v) => comboKey(v.option_values, names)))
  let combos = [{}]
  valueLists.forEach((values, i) => {
    combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [names[i]]: value })))
  })
  return combos.filter((combo) => !existing.has(comboKey(combo, names)))
}

export function combinationExists(optionValues, variants = [], optionNames = Object.keys(optionValues ?? {})) {
  const key = comboKey(optionValues, optionNames)
  return variants.some((v) => comboKey(v.option_values, optionNames) === key)
}

// SKU compares case-insensitively (as POS scan does); barcode is exact and
// keeps leading zeros.
function sameCode(field, a, b) {
  if (!a || !b) return false
  return field === 'sku' ? String(a).trim().toLowerCase() === String(b).trim().toLowerCase() : String(a).trim() === String(b).trim()
}

// Returns { [variantId]: { sku?: label, barcode?: label } } naming the other
// item that already uses the same code inside this product.
export function findIdentifierDuplicates(product, rows) {
  const items = [
    { id: '__product__', label: 'el producto', sku: product?.sku, barcode: product?.barcode },
    ...rows.map((r) => ({ id: r.id, label: r.label || 'otra variante', sku: r.sku, barcode: r.barcode })),
  ]
  const result = {}
  for (const row of rows) {
    for (const field of ['sku', 'barcode']) {
      const other = items.find((item) => item.id !== row.id && sameCode(field, item[field], row[field]))
      if (other) result[row.id] = { ...(result[row.id] ?? {}), [field]: other.label }
    }
  }
  return result
}

// Field-level optimistic check for the legacy product PATCH, which carries no
// version: a field conflicts when someone else changed it after the form was
// loaded and our new value differs from theirs.
export function detectFieldConflicts(base, fresh, next, fields) {
  const norm = (v) => (v === undefined || v === '' ? null : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))
  return fields.filter((field) => norm(fresh?.[field]) !== norm(base?.[field]) && norm(fresh?.[field]) !== norm(next?.[field]))
}

export const STOCK_STATE_META = {
  UNTRACKED: { label: 'Sin control', tone: 'neutral' },
  AVAILABLE: { label: 'Disponible', tone: 'success' },
  UNALLOCATED: { label: 'Sin asignar', tone: 'warning' },
  OUT_OF_STOCK: { label: 'Agotado', tone: 'danger' },
}

export function balanceTone(quantity) {
  if (quantity < 0) return { label: 'Negativo', tone: 'danger' }
  if (quantity === 0) return { label: 'Agotado', tone: 'danger' }
  return { label: 'Disponible', tone: 'success' }
}

export function parseWholeQuantity(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : null
}

// Commercial tax rate as the contract string (0-100, up to four decimals).
export function parseTaxRate(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(text)) return null
  return Number(text) <= 100 ? text : null
}
