// Client-side search that ignores case and accents ("telefono" finds
// "Teléfono"), the same rule the API applies (atlas_unaccent). Use these for
// every in-memory list filter instead of toLowerCase().includes().

export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// True when every word of `query` appears in `text` (a string or a list of
// strings/numbers); an empty query matches everything.
export function matchesSearch(text, query) {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = normalizeSearchText(Array.isArray(text) ? text.filter((p) => p != null).join(' ') : text)
  return words.every((word) => haystack.includes(word))
}
