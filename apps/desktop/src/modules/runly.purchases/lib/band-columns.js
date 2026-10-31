// Columns for n counters in a row of `width` px: as many as fit (min 8.5rem
// each), balanced across rows (7 -> 4 + 3, not 6 + 1).
export function bandColumns(n, width, minCell = 136) {
  if (!n) return 1
  const fit = Math.max(1, Math.min(n, Math.floor(width / minCell) || 1))
  return Math.ceil(n / Math.ceil(n / fit))
}
