import { STUDIO_FONTS } from '../../../../../shared/studio/fonts.js'

// The site wizard and the theme editor share the self-hosted Studio catalog: no
// font is fetched from the internet (the published site CSP only allows 'self').
const FALLBACK = (category) => {
  if (/^Serif/.test(category)) return 'serif'
  if (/Mono/.test(category)) return 'monospace'
  if (/Manuscrita|Caligr/.test(category)) return 'cursive'
  return 'sans-serif'
}

export const SITE_FONTS = Object.freeze(
  STUDIO_FONTS.filter((font) => font.file).map((font) => ({
    family: font.family,
    category: font.category,
    stack: `${font.family}, ${FALLBACK(font.category)}`,
    css: `'${font.family}', ${FALLBACK(font.category)}`,
  })),
)

export const FONT_GROUPS = Object.freeze([
  { id: 'all', label: 'Todas', test: () => true },
  { id: 'sans', label: 'Sans', test: (font) => /^Sans/.test(font.category) },
  { id: 'serif', label: 'Serif', test: (font) => /^Serif/.test(font.category) },
  { id: 'display', label: 'Display', test: (font) => /Display|Condensada/.test(font.category) },
  { id: 'script', label: 'Manuscritas', test: (font) => /Manuscrita|Caligr/.test(font.category) },
  { id: 'mono', label: 'Mono', test: (font) => /Mono/.test(font.category) },
])

export const FONT_PAIRINGS = Object.freeze([
  { id: 'modern', label: 'Moderno', heading: 'Poppins', body: 'Inter' },
  { id: 'editorial', label: 'Editorial', heading: 'Playfair Display', body: 'Source Sans 3' },
  { id: 'elegant', label: 'Elegante', heading: 'Cormorant Garamond', body: 'Montserrat' },
  { id: 'friendly', label: 'Cercano', heading: 'Nunito', body: 'Nunito' },
  { id: 'classic', label: 'Clásico', heading: 'Libre Baskerville', body: 'Open Sans' },
  { id: 'impact', label: 'Impacto', heading: 'Bebas Neue', body: 'Roboto' },
])

export function fontStack(family) {
  return SITE_FONTS.find((font) => font.family === family)?.stack ?? `${family}, sans-serif`
}

export function fontCss(family) {
  return SITE_FONTS.find((font) => font.family === family)?.css ?? `'${family}', sans-serif`
}

// Theme `typography` object in the shape the Tema screen edits and the server stores.
export function typographyFromFonts({ headingFont, bodyFont }) {
  return { headingFont: fontStack(headingFont), bodyFont: fontStack(bodyFont), baseFontSize: '16px', headingWeight: '700' }
}
