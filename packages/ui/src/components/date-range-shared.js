// Pure helpers shared by DateRangeFilter, DateRangePanel and FilterMenu.

// Local YYYY-MM-DD (never toISOString(), which shifts the day to UTC).
export function localIso(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function daysAgo(n) {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return date
}

export const DATE_RANGE_PRESETS = [
  { label: 'Hoy', range: () => [localIso(new Date()), localIso(new Date())] },
  { label: 'Últimos 7 días', range: () => [localIso(daysAgo(6)), localIso(new Date())] },
  { label: 'Últimos 30 días', range: () => [localIso(daysAgo(29)), localIso(new Date())] },
  { label: 'Este mes', range: () => { const now = new Date(); return [localIso(new Date(now.getFullYear(), now.getMonth(), 1)), localIso(now)] } },
  { label: 'Mes anterior', range: () => { const now = new Date(); return [localIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), localIso(new Date(now.getFullYear(), now.getMonth(), 0))] } },
  { label: 'Este año', range: () => { const now = new Date(); return [localIso(new Date(now.getFullYear(), 0, 1)), localIso(now)] } },
]

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function shortDate(value, withYear = true) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  if (!match) return ''
  const day = Number(match[3])
  const month = MONTHS_SHORT[Number(match[2]) - 1] ?? ''
  return withYear ? `${day} ${month} ${match[1]}` : `${day} ${month}`
}

export function formatShortDate(value) {
  return shortDate(value)
}

// Human summary of a range: "3 mar 2026", "3 mar – 9 abr 2026", "Desde ...", "Hasta ...".
export function summarizeRange(from, to) {
  if (from && to) {
    if (from === to) return shortDate(from)
    const sameYear = from.slice(0, 4) === to.slice(0, 4)
    return `${shortDate(from, !sameYear)} – ${shortDate(to)}`
  }
  if (from) return `Desde ${shortDate(from)}`
  if (to) return `Hasta ${shortDate(to)}`
  return ''
}

export function findActivePreset(from, to) {
  return DATE_RANGE_PRESETS.find((p) => { const [a, b] = p.range(); return a === from && b === to }) ?? null
}
