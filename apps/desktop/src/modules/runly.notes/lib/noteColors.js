// Background color palette for notes.
// `value` is what gets persisted in the DB (light pastel applied to the editor).
// `swatch` is a more saturated version used ONLY in the color picker so colors are recognizable.
// `dark` is the deep equivalent applied in dark mode.
// `accent` tints the note's icon ({ light, dark }); null keeps the default amber.
export const NOTE_BACKGROUND_COLORS = [
  { label: 'Predeterminado', value: null,      swatch: null,      dark: null,      accent: null },
  { label: 'Crema',          value: '#fefce8', swatch: '#fef08a', dark: '#1e1a00', accent: { light: '#a16207', dark: '#facc15' } },
  { label: 'Menta',          value: '#f0fdf4', swatch: '#bbf7d0', dark: '#001a08', accent: { light: '#15803d', dark: '#4ade80' } },
  { label: 'Cielo',          value: '#eff6ff', swatch: '#bfdbfe', dark: '#00101f', accent: { light: '#1d4ed8', dark: '#60a5fa' } },
  { label: 'Lavanda',        value: '#faf5ff', swatch: '#e9d5ff', dark: '#0d0818', accent: { light: '#7e22ce', dark: '#c084fc' } },
  { label: 'Rosa',           value: '#fff1f2', swatch: '#fecdd3', dark: '#1f0008', accent: { light: '#be123c', dark: '#fb7185' } },
  { label: 'Melocoton',      value: '#fff7ed', swatch: '#fed7aa', dark: '#1a0d00', accent: { light: '#c2410c', dark: '#fb923c' } },
  { label: 'Hielo',          value: '#f0f9ff', swatch: '#bae6fd', dark: '#001525', accent: { light: '#0369a1', dark: '#38bdf8' } },
  { label: 'Lima',           value: '#f7fee7', swatch: '#d9f99d', dark: '#0d1a00', accent: { light: '#4d7c0f', dark: '#a3e635' } },
  { label: 'Coral',          value: '#fef2f2', swatch: '#fca5a5', dark: '#1a0000', accent: { light: '#b91c1c', dark: '#f87171' } },
  { label: 'Violeta',        value: '#f5f3ff', swatch: '#ddd6fe', dark: '#0d0c20', accent: { light: '#6d28d9', dark: '#a78bfa' } },
  { label: 'Arena',          value: '#fdf4ff', swatch: '#f5d0fe', dark: '#180020', accent: { light: '#a21caf', dark: '#e879f9' } },
]

// Map: stored DB value (light hex) → dark-mode equivalent
export const DARK_BG_MAP = Object.fromEntries(
  NOTE_BACKGROUND_COLORS
    .filter(c => c.value && c.dark)
    .map(c => [c.value, c.dark])
)

// Hex accent for a note's icon given its stored background value, or null
// (keep the default amber) for no color / unknown legacy values.
export function noteAccentColor(backgroundColor, isDark) {
  if (!backgroundColor) return null
  const entry = NOTE_BACKGROUND_COLORS.find(c => c.value === backgroundColor)
  if (!entry?.accent) return null
  return isDark ? entry.accent.dark : entry.accent.light
}
