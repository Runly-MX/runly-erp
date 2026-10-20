// Page numbers for a numbered pager: first and last page, `siblings` pages on each side of the
// current one, and 'gap' markers where pages are skipped. A gap that would hide a single page
// shows that page instead, so the list never has a useless ellipsis.
// Example (page 6 of 20, siblings 1): [1, 'gap', 5, 6, 7, 'gap', 20].
export function buildPageWindow(pageIndex, pageCount, siblings = 1) {
  const total = Math.max(0, Math.floor(pageCount) || 0)
  if (total <= 1) return total === 1 ? [1] : []
  const current = Math.min(Math.max(Math.floor(pageIndex) + 1 || 1, 1), total)
  const start = Math.max(2, current - siblings)
  const end = Math.min(total - 1, current + siblings)
  const out = [1]
  if (start === 3) out.push(2)
  else if (start > 3) out.push('gap')
  for (let page = start; page <= end; page += 1) out.push(page)
  if (end === total - 2) out.push(total - 1)
  else if (end < total - 2) out.push('gap')
  out.push(total)
  return out
}
