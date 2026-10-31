// Inicio board: a wide panel (lg: full row, xl: 8 of 12) followed by n small
// panels. The first small one sits beside the wide panel on xl; the rest share
// the next row equally. On lg (2 columns) an odd last panel spans the row.
// Returns one class string per small panel, so no permission or capability
// that hides a panel leaves a hole. Literal classes for Tailwind's scanner.
const XL_SHARE = { 1: 'xl:col-span-12', 2: 'xl:col-span-6', 3: 'xl:col-span-4' }

export const WIDE_PANEL = 'lg:col-span-2 xl:col-span-8'

export function boardSpans(n) {
  return Array.from({ length: n }, (_, i) => {
    const lg = i === n - 1 && n % 2 === 1 ? 'lg:col-span-2' : ''
    const xl = i === 0 ? 'xl:col-span-4' : XL_SHARE[Math.min(3, n - 1)] ?? 'xl:col-span-4'
    return [lg, xl].filter(Boolean).join(' ')
  })
}
