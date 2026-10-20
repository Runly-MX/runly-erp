// Optional portal theming from the company's primary color. Only applied when the color keeps
// accessible contrast; otherwise the portal keeps the default Runly theme.
const HEX = /^#?([0-9a-f]{6})$/i
const WHITE = [255, 255, 255]
const INK = [11, 18, 32]
const DARK_PAGE = [15, 23, 42]

function parseHex(value) {
  const m = HEX.exec(String(value ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]) {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`

// CSS variables for the portal root, or null when the color must be ignored:
// text on the accent needs >= 4.5:1 and the accent itself >= 3:1 against both the light and dark page.
export function portalThemeVars(primaryColor) {
  const rgb = parseHex(primaryColor)
  if (!rgb) return null
  const foreground = contrastRatio(rgb, WHITE) >= contrastRatio(rgb, INK) ? WHITE : INK
  if (contrastRatio(rgb, foreground) < 4.5) return null
  if (contrastRatio(rgb, WHITE) < 3 || contrastRatio(rgb, DARK_PAGE) < 3) return null
  return {
    '--brand-primary': toHex(rgb),
    '--brand-primary-on-dark': toHex(rgb),
    '--brand-primary-foreground': toHex(foreground),
    '--brand-soft': `rgba(${rgb.join(', ')}, 0.14)`,
  }
}
