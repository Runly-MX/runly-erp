// Calendar surface styles chosen in "Apariencia" (persisted in useCalendarStore).
export const SURFACES = [
  { value: 'plain', label: 'Plano' },
  { value: 'relief', label: 'Relieve' },
  { value: 'tinted', label: 'Tinte' },
]

export const TINTS = ['#7C3AED', '#2563EB', '#0D9488', '#16A34A', '#D97706', '#E11D48', '#475569']

const mix = (color, pct, base) => (pct ? `color-mix(in srgb, ${color} ${pct}%, ${base})` : base)

// Backdrop behind the month grid (visible between "relief" cards).
export function gridBackdrop({ surface, tint }) {
  if (surface === 'relief') return mix(tint, 7, 'hsl(var(--surface-2))')
  if (surface === 'tinted') return mix(tint, 4, 'hsl(var(--surface-1))')
  return undefined
}

export function dayCellBg({ surface, tint, shadeWeekends }, { weekend, current }) {
  const base = surface === 'relief' ? 'hsl(var(--card))' : 'hsl(var(--surface-1))'
  const color = surface === 'plain' ? 'hsl(var(--muted-foreground))' : tint
  let pct = surface === 'tinted' ? 6 : 0
  if (weekend && shadeWeekends) pct += surface === 'plain' ? 4 : 6
  if (!current) pct += surface === 'plain' ? 3 : 4
  return mix(color, pct, base)
}
